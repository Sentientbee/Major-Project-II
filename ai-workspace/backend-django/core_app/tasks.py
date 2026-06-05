from celery import shared_task
import PyPDF2
import requests
from .models import Document

@shared_task
def process_document_task(document_id):
    doc = Document.objects.get(id=document_id)
    doc.status = 'Processing'
    doc.save()

    try:
        text = ""
        with doc.file.open('rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"

        fastapi_url = "http://ml-fastapi:8001/ingest/"
        payload = {
            "document_id": str(doc.id),
            "project_id": str(doc.project.id),
            "text": text
        }
        
        response = requests.post(fastapi_url, json=payload)
        response.raise_for_status()

        doc.status = 'Ready'
        doc.save()

    except Exception as e:
        doc.status = 'Failed'
        doc.save()
        print(f"Error processing doc {document_id}: {e}")