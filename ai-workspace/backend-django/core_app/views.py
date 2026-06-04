from django.shortcuts import render
import json
from .models import Document
from .tasks import process_document_task
from django.contrib.auth import authenticate, login, get_user_model
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from .models import Project, Team

User = get_user_model()

@csrf_exempt
@require_POST
def signup_view(request):
    data = json.loads(request.body)
    username = data.get('username')
    password = data.get('password')
    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'User exists'}, status=400)
    
    user = User.objects.create_user(username=username, password=password)
    # Automatically create a personal team for the user as a Team can be a single user
    team = Team.objects.create(name=f"{username}'s Team")
    team.members.add(user)
    
    login(request, user)
    return JsonResponse({'message': 'Signup successful', 'username': user.username})

@csrf_exempt
@require_POST
def login_view(request):
    data = json.loads(request.body)
    user = authenticate(request, username=data.get('username'), password=data.get('password'))
    if user is not None:
        login(request, user)
        return JsonResponse({'message': 'Login successful', 'username': user.username})
    return JsonResponse({'error': 'Invalid credentials'}, status=401)

@csrf_exempt
def project_list_create(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'GET':
        # Get projects belonging to any team the user is in
        projects = Project.objects.filter(team__members=request.user).values('id', 'name', 'team__name')
        return JsonResponse(list(projects), safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        # For simplicity, assign to the user's first team
        team = request.user.teams.first() 
        project = Project.objects.create(name=data.get('name'), team=team)
        return JsonResponse({'id': project.id, 'name': project.name}, status=201)

@csrf_exempt
def document_list_create(request, project_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    project = Project.objects.get(id=project_id, team__members=request.user)

    if request.method == 'GET':
        docs = project.documents.values('id', 'title', 'status', 'uploaded_at')
        return JsonResponse(list(docs), safe=False)

    elif request.method == 'POST':
        file = request.FILES.get('file')
        if not file:
            return JsonResponse({'error': 'No file provided'}, status=400)
        
        doc = Document.objects.create(title=file.name, file=file, project=project, status='Uploaded')
        
        # Trigger Celery Background Job
        process_document_task.delay(str(doc.id))
        
        return JsonResponse({'id': str(doc.id), 'title': doc.title, 'status': doc.status}, status=201)




from django.http import StreamingHttpResponse
import requests

@csrf_exempt
def chat_gateway(request, project_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'POST':
        data = json.loads(request.body)
        
        # Verify the project belongs to the user's team
        if not Project.objects.filter(id=project_id, team__members=request.user).exists():
            return JsonResponse({'error': 'Not authorized'}, status=403)

        # We use 'workspace-fastapi' because that's the container name in docker-compose.yml
        fastapi_url = "http://workspace-fastapi:8001/chat/"
        payload = {
            "project_id": str(project_id),
            "message": data.get("message")
        }

        def stream_generator():
            try:
                # Stream=True allows us to proxy the chunks as they arrive
                with requests.post(fastapi_url, json=payload, stream=True) as r:
                    for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
                        if chunk:
                            yield chunk
            except requests.exceptions.RequestException as e:
                yield f"Error connecting to AI service: {str(e)}"

        return StreamingHttpResponse(stream_generator(), content_type='text/event-stream')

