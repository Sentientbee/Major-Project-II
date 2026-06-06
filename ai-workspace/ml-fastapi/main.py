from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Text, text
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

from fastapi.responses import StreamingResponse
from fastapi import Request
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import MessagesPlaceholder
import redis
from langchain_community.tools import WikipediaQueryRun
from langchain_community.utilities import WikipediaAPIWrapper
from langchain.agents import initialize_agent, AgentType

# We use host.docker.internal to reach LMStudio running on your host machine
chat_model = ChatOpenAI(
    base_url="http://host.docker.internal:1234/v1",
    api_key="lm-studio",  
    streaming=True,
    temperature=0.7
)

# --- Rate Limiting via Redis ---
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

wikipedia_wrapper = WikipediaAPIWrapper(
    top_k_results=3,
    doc_content_chars_max=2000
)
wikipedia_tool = WikipediaQueryRun(api_wrapper=wikipedia_wrapper)
tools = [wikipedia_tool]

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

class ChatRequest(BaseModel):
    project_id: str
    message: str
    history: list[dict] = []  # Added history field to receive memory from Django

@app.post("/chat/")
async def chat_endpoint(request: ChatRequest):
    if not check_rate_limit(request.project_id):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait a minute."
        )

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

    # Parse history into LangChain message objects
    chat_history = []
    for msg in request.history:
        if msg.get('role') == 'user':
            chat_history.append(HumanMessage(content=msg.get('content', '')))
        elif msg.get('role') == 'ai':
            chat_history.append(AIMessage(content=msg.get('content', '')))

    # --- UI Rendering Instructions Added to System Prompt ---
    system_prompt = (
        "You are an AI research assistant. Use the following document context to "
        f"answer the user's question:\n\n{context}\n\n"
        "If the answer is not in the documents, use the Wikipedia tool to search for it.\n\n"
        "--- UI INSTRUCTIONS ---\n"
        "If the user asks for a chart, graph, or visualization of data (e.g., quarterly earnings, comparisons), "
        "you MUST include a structured JSON block in your response using the following format:\n"
        "```json\n"
        '{\n  "type": "bar_chart",\n  "title": "Your Chart Title",\n  "data": [\n    {"name": "Label 1", "value": 100},\n    {"name": "Label 2", "value": 150}\n  ]\n}\n'
        "```\n"
        "Provide a brief text explanation before the JSON."
    )

    agent_executor = initialize_agent(
        tools,
        chat_model,
        agent=AgentType.OPENAI_FUNCTIONS,
        verbose=True,
        handle_parsing_errors=True,
        agent_kwargs={
            "system_message": SystemMessage(content=system_prompt),
            "extra_prompt_messages": [MessagesPlaceholder(variable_name="memory")], # Inject memory placeholder
        }
    )

    async def generate_response():
        try:
            # Native token-by-token streaming using astream_events
            async for event in agent_executor.astream_events(
                {"input": request.message, "memory": chat_history}, 
                version="v1"
            ):
                # Stream only the text content generated directly by the LLM
                if event["event"] == "on_chat_model_stream":
                    token = event["data"]["chunk"].content
                    if token:
                        yield token
        except Exception as e:
            yield f"Error processing request: {str(e)}"

    return StreamingResponse(generate_response(), media_type="text/event-stream")

@app.delete("/documents/{document_id}/")
def delete_document_chunks(document_id: str):
    db = SessionLocal()
    try:
        db.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id
        ).delete()
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()