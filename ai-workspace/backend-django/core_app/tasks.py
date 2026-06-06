from celery import shared_task
import PyPDF2
import requests
from .models import Document

@shared_task
def process_document_task(document_id):
    print(f"Starting processing for document: {document_id}")
    doc = Document.objects.get(id=document_id)
    doc.status = 'Processing'
    doc.save()

    try:
        fastapi_url = "http://ml-fastapi:8001"
        
        # --- FIX: Clear any existing partial chunks before starting to prevent duplication ---
        try:
            requests.delete(f"{fastapi_url}/documents/{document_id}/", timeout=10)
            print(f"Cleared existing chunks for {document_id} to prevent duplication.")
        except requests.exceptions.RequestException as e:
            print(f"Warning: Could not clear previous chunks: {e}")
        # -----------------------------------------------------------------------------------

        text_buffer = ""
        # Send to FastAPI in chunks of roughly 10,000 characters
        # This prevents both the Celery Worker and FastAPI from running out of memory
        chunk_size_limit = 10000 
        
        with doc.file.open('rb') as f:
            reader = PyPDF2.PdfReader(f)
            total_pages = len(reader.pages)
            print(f"Document {document_id} has {total_pages} pages.")
            
            for i, page in enumerate(reader.pages):
                try:
                    extracted = page.extract_text()
                    if extracted:
                        text_buffer += extracted + "\n"
                    
                    # If buffer reaches the limit, send it over and clear memory immediately
                    if len(text_buffer) >= chunk_size_limit:
                        print(f"Sending batch for doc {document_id} (Length: {len(text_buffer)} chars)...")
                        payload = {
                            "document_id": str(doc.id),
                            "project_id": str(doc.project.id),
                            "text": text_buffer
                        }
                        response = requests.post(f"{fastapi_url}/ingest/", json=payload, timeout=60)
                        response.raise_for_status()
                        
                        # Wipe the buffer to free up RAM
                        text_buffer = "" 
                        
                except Exception as page_e:
                    print(f"Skipping page {i} due to extraction error: {page_e}")

        # Send the final remaining text chunk
        if text_buffer.strip():
            print(f"Sending final batch for doc {document_id}...")
            payload = {
                "document_id": str(doc.id),
                "project_id": str(doc.project.id),
                "text": text_buffer
            }
            response = requests.post(f"{fastapi_url}/ingest/", json=payload, timeout=60)
            response.raise_for_status()

        print(f"Successfully finished processing document: {document_id}")
        doc.status = 'Ready'
        doc.save()

    except Exception as e:
        doc.status = 'Failed'
        doc.save()
        print(f"Error processing doc {document_id}: {e}")