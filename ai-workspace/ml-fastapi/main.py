import uuid
import redis
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Text, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage
from langchain_community.tools import WikipediaQueryRun
from langchain_community.utilities import WikipediaAPIWrapper
from langchain.agents import initialize_agent, AgentType
from langchain.tools import Tool

DATABASE_URL = "postgresql://myuser:mypassword@postgres:5432/workspace_db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    conn.commit()

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(String, index=True)
    project_id = Column(String, index=True)
    text = Column(Text)
    embedding = Column(Vector(384))

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Engine API")
embeddings_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

chat_model = ChatOpenAI(
    base_url="http://host.docker.internal:1234/v1",
    api_key="lm-studio",
    streaming=True,
    temperature=0.7
)

redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

def check_rate_limit(project_id: str, limit: int = 20, window: int = 60):
    key = f"rate_limit:{project_id}"
    current = redis_client.get(key)
    if current and int(current) >= limit:
        return False
    
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, window)
    pipe.execute()
    return True

wikipedia_tool = WikipediaQueryRun(api_wrapper=WikipediaAPIWrapper())

class IngestRequest(BaseModel):
    document_id: str
    project_id: str
    text: str

class ChatRequest(BaseModel):
    project_id: str
    message: str

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

@app.post("/chat/")
async def chat_endpoint(request: ChatRequest):
    if not check_rate_limit(request.project_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a minute.")
        
    def retrieve_docs(query: str) -> str:
        query_embedding = embeddings_model.embed_query(query)
        db = SessionLocal()
        try:
            chunks = db.query(DocumentChunk).filter(
                DocumentChunk.project_id == request.project_id
            ).order_by(
                DocumentChunk.embedding.cosine_distance(query_embedding)
            ).limit(3).all()
            
            if not chunks:
                return "No relevant information found in the uploaded documents."
            return "\n\n".join([chunk.text for chunk in chunks])
        finally:
            db.close()

    doc_tool = Tool(
        name="Project_Database",
        func=retrieve_docs,
        description="Always use this tool FIRST to search the user's uploaded PDF documents for context. Input should be a specific search query."
    )

    tools = [doc_tool, wikipedia_tool]

    agent_executor = initialize_agent(
        tools, 
        chat_model, 
        agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, 
        verbose=True, 
        handle_parsing_errors=True,
        max_iterations=4
    )

    async def generate_response():
        try:
            response = await agent_executor.ainvoke({"input": request.message})
            output = response.get("output", "I could not find an answer.")
            
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
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()