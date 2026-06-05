from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Text, text
from sqlalchemy import create_engine, Column, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
import uuid

DATABASE_URL = "postgresql://myuser:mypassword@postgres:5432/workspace_db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Enable pgvector extension
with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    conn.commit()

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(String, index=True)
    project_id = Column(String, index=True)
    text = Column(Text)
    # 384 is the dimension for all-MiniLM-L6-v2 embeddings
    embedding = Column(Vector(384))

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Engine API")
embeddings_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

class IngestRequest(BaseModel):
    document_id: str
    project_id: str
    text: str

@app.post("/ingest/")
def ingest_document(request: IngestRequest):
    try:
        chunks = text_splitter.split_text(request.text)
        
        chunk_embeddings = embeddings_model.embed_documents(chunks)
        
        db = SessionLocal()
        for chunk_text, embedding in zip(chunks, chunk_embeddings):
            db_chunk = DocumentChunk(
                document_id=request.document_id,
                project_id=request.project_id,
                text=chunk_text,
                embedding=embedding
            )
            db.add(db_chunk)
        db.commit()
        db.close()
        
        return {"status": "success", "chunks_processed": len(chunks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

# We use host.docker.internal to reach LMStudio running on your host machine
chat_model = ChatOpenAI(
    base_url="http://host.docker.internal:1234/v1",
    api_key="lm-studio", # API key is required but ignored by LMStudio
    streaming=True,
    temperature=0.7
)

class ChatRequest(BaseModel):
    project_id: str
    message: str

@app.post("/chat/")
async def chat_endpoint(request: ChatRequest):
    # 1. Embed the user's message
    query_embedding = embeddings_model.embed_query(request.message)
    
    db = SessionLocal()
    try:
        # 2. Retrieve relevant chunks using pgvector's cosine distance
        chunks = db.query(DocumentChunk).filter(
            DocumentChunk.project_id == request.project_id
        ).order_by(
            DocumentChunk.embedding.cosine_distance(query_embedding)
        ).limit(3).all()
        
        context = "\n\n".join([chunk.text for chunk in chunks])
    finally:
        db.close()

    # 3. Build the prompt
    system_prompt = (
        "You are an AI research assistant. Use the following document context to "
        f"answer the user's question.\n\nContext:\n{context}"
    )
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=request.message)
    ]

    # 4. Asynchronous generator to stream tokens
    async def generate_response():
        async for chunk in chat_model.astream(messages):
            if chunk.content:
                yield chunk.content

    return StreamingResponse(generate_response(), media_type="text/event-stream")


import redis
from fastapi import Request
from langchain_community.tools import WikipediaQueryRun
from langchain_community.utilities import WikipediaAPIWrapper
from langchain.agents import initialize_agent, AgentType

# 1. Setup Redis Connection for Rate Limiting
redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

def check_rate_limit(project_id: str, limit: int = 20, window: int = 60):
    """Allows 20 requests per minute per project."""
    key = f"rate_limit:{project_id}"
    current = redis_client.get(key)
    if current and int(current) >= limit:
        return False
    
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, window)
    pipe.execute()
    return True

# 2. Initialize MCP/Tools (Wikipedia)
wikipedia_tool = WikipediaQueryRun(api_wrapper=WikipediaAPIWrapper())
tools = [wikipedia_tool]

@app.post("/chat/")
async def chat_endpoint(request: ChatRequest):
    # Enforce Rate Limiting
    if not check_rate_limit(request.project_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a minute.")
        
    query_embedding = embeddings_model.embed_query(request.message)
    
    db = SessionLocal()
    try:
        chunks = db.query(DocumentChunk).filter(
            DocumentChunk.project_id == request.project_id
        ).order_by(
            DocumentChunk.embedding.cosine_distance(query_embedding)
        ).limit(3).all()
        
        context = "\n\n".join([chunk.text for chunk in chunks])
    finally:
        db.close()

    # Create Agent Prompt Context
    system_prompt = (
        "You are an AI research assistant. Use the following document context to "
        f"answer the user's question:\n\n{context}\n\n"
        "If the answer is not in the documents, use the Wikipedia tool to search for it."
    )
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=request.message)
    ]

    # Initialize a Langchain Agent to handle tools (Model Context Protocol simulation)
    # Using chat-conversational-react-description ensures it works well with tools
    agent_executor = initialize_agent(
        tools, 
        chat_model, 
        agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION, 
        verbose=True, 
        handle_parsing_errors=True
    )

    async def generate_response():
        # Note: Local LLMs sometimes struggle with streaming React agents.
        # We catch the final tool-augmented output and stream it safely.
        try:
            # We append the system context into the user's prompt for the agent
            full_prompt = f"{system_prompt}\n\nUser Question: {request.message}"
            
            # Since standard agents don't stream intermediate steps easily via async generator
            # we invoke the agent and yield the final chunks
            response = await agent_executor.ainvoke({"input": full_prompt})
            
            # Simulate streaming the finalized tool-enhanced response
            output = response.get("output", "I could not find an answer.")
            
            # Chunk the output manually to maintain the streaming UI effect
            chunk_size = 20
            for i in range(0, len(output), chunk_size):
                yield output[i:i+chunk_size]
                
        except Exception as e:
            yield f"Error processing tools: {str(e)}"

    return StreamingResponse(generate_response(), media_type="text/event-stream")


@app.delete("/documents/{document_id}/")
def delete_document_chunks(document_id: str):
    db = SessionLocal()
    try:
        # Delete all chunks belonging to this document
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()