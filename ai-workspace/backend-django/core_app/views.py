import json
import requests
from django.shortcuts import render
from django.contrib.auth import authenticate, login, get_user_model
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from .models import Document, Project, Team, ChatMessage, Evaluation
from .tasks import process_document_task

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
        projects = Project.objects.filter(team__members=request.user).values('id', 'name', 'team__name')
        return JsonResponse(list(projects), safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        team = request.user.teams.first() 
        project = Project.objects.create(name=data.get('name'), team=team)
        return JsonResponse({'id': project.id, 'name': project.name}, status=201)

@csrf_exempt
def document_list_create(request, project_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    try:
        project = Project.objects.get(id=project_id, team__members=request.user)
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found or unauthorized'}, status=403)

    if request.method == 'GET':
        docs = project.documents.values('id', 'title', 'status', 'uploaded_at')
        return JsonResponse(list(docs), safe=False)

    elif request.method == 'POST':
        file = request.FILES.get('file')
        if not file:
            return JsonResponse({'error': 'No file provided'}, status=400)
        
        doc = Document.objects.create(title=file.name, file=file, project=project, status='Uploaded')
        process_document_task.delay(str(doc.id))
        
        return JsonResponse({'id': str(doc.id), 'title': doc.title, 'status': doc.status}, status=201)

@csrf_exempt
def add_team_member(request, project_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    
    if request.method == 'POST':
        data = json.loads(request.body)
        new_username = data.get('username')
        
        try:
            project = Project.objects.get(id=project_id, team__members=request.user)
            user_to_add = User.objects.get(username=new_username)
            project.team.members.add(user_to_add)
            return JsonResponse({'message': f'User {new_username} added to the team.'})
        except Project.DoesNotExist:
            return JsonResponse({'error': 'Project not found or unauthorized'}, status=403)
        except User.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)

@csrf_exempt
def get_chat_history(request, project_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    
    if request.method == 'GET':
        messages = ChatMessage.objects.filter(
            project_id=project_id, 
            project__team__members=request.user
        ).values('role', 'content', 'created_at')
        return JsonResponse(list(messages), safe=False)

@csrf_exempt
def chat_gateway(request, project_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'POST':
        data = json.loads(request.body)
        user_message_content = data.get("message")
        
        try:
            project = Project.objects.get(id=project_id, team__members=request.user)
        except Project.DoesNotExist:
            return JsonResponse({'error': 'Not authorized'}, status=403)

        ChatMessage.objects.create(
            project=project, 
            user=request.user, 
            role='user', 
            content=user_message_content
        )

        fastapi_url = "http://workspace-fastapi:8001/chat/"
        payload = {
            "project_id": str(project_id),
            "message": user_message_content
        }

        def stream_generator():
            full_ai_response = ""
            try:
                with requests.post(fastapi_url, json=payload, stream=True) as r:
                    for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
                        if chunk:
                            full_ai_response += chunk
                            yield chunk
                ChatMessage.objects.create(project=project, role='ai', content=full_ai_response)
            except requests.exceptions.RequestException as e:
                error_msg = f"Error connecting to AI service: {str(e)}"
                ChatMessage.objects.create(project=project, role='ai', content=error_msg)
                yield error_msg

        return StreamingHttpResponse(stream_generator(), content_type='text/event-stream')

@csrf_exempt
def delete_project(request, project_id):
    if not request.user.is_authenticated: 
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'DELETE':
        Project.objects.filter(id=project_id, team__members=request.user).delete()
        return JsonResponse({'message': 'Deleted'})

@csrf_exempt
def delete_document(request, project_id, doc_id):
    if not request.user.is_authenticated: 
        return JsonResponse({'error': 'Not authenticated'}, status=401)
        
    if request.method == 'DELETE':
        fastapi_url = f"http://ml-fastapi:8001/documents/{str(doc_id)}/"
        try:
            requests.delete(fastapi_url, timeout=5)
        except requests.exceptions.RequestException as e:
            print(f"Warning: Failed to reach FastAPI to delete embeddings: {e}")

        Document.objects.filter(id=doc_id, project_id=project_id, project__team__members=request.user).delete()
        return JsonResponse({'message': 'Deleted'})

@csrf_exempt
def save_evaluation(request, project_id):
    if not request.user.is_authenticated: 
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        data = json.loads(request.body)
        Evaluation.objects.create(
            project_id=project_id,
            prompt_a=data.get('prompt_a'),
            prompt_b=data.get('prompt_b'),
            response_a=data.get('response_a'),
            response_b=data.get('response_b'),
            winner=data.get('winner')
        )
        return JsonResponse({'message': 'Evaluation saved!'})