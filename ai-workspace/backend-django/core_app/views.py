from django.shortcuts import render
import json
from .models import Document
from .tasks import process_document_task
from django.contrib.auth import authenticate, login, get_user_model
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from .models import Project, Team, ChatMessage, ChatSession
import requests

User = get_user_model()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

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
def delete_project(request, project_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'DELETE':
        Project.objects.filter(id=project_id, team__members=request.user).delete()
        return JsonResponse({'message': 'Deleted'})


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

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
        process_document_task.delay(str(doc.id))
        return JsonResponse({'id': str(doc.id), 'title': doc.title, 'status': doc.status}, status=201)


@csrf_exempt
def delete_document(request, project_id, doc_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'DELETE':
        fastapi_url = f"http://workspace-fastapi:8001/documents/{str(doc_id)}/"
        try:
            requests.delete(fastapi_url, timeout=5)
        except requests.exceptions.RequestException as e:
            print(f"Warning: Failed to reach FastAPI to delete embeddings: {e}")

        Document.objects.filter(
            id=doc_id, project_id=project_id, project__team__members=request.user
        ).delete()
        return JsonResponse({'message': 'Deleted'})


# ---------------------------------------------------------------------------
# Chat Sessions (multi-tab support)
# ---------------------------------------------------------------------------

@csrf_exempt
def chat_session_list_create(request, project_id):
    """
    GET  /api/projects/<id>/sessions/  — list all sessions for this project
    POST /api/projects/<id>/sessions/  — create a new session (tab)
                                         body: { "title": "optional name" }
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    try:
        project = Project.objects.get(id=project_id, team__members=request.user)
    except Project.DoesNotExist:
        return JsonResponse({'error': 'Project not found'}, status=404)

    if request.method == 'GET':
        sessions = project.chat_sessions.filter(user=request.user).values(
            'id', 'title', 'created_at'
        )
        return JsonResponse(list(sessions), safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body) if request.body else {}
        # Auto-number: "Chat N" based on existing session count
        count = ChatSession.objects.filter(project=project, user=request.user).count()
        default_title = f"Chat {count + 1}"
        title = data.get('title', '').strip() or default_title

        session = ChatSession.objects.create(
            project=project,
            user=request.user,
            title=title
        )
        return JsonResponse({
            'id': str(session.id),
            'title': session.title,
            'created_at': session.created_at.isoformat()
        }, status=201)


@csrf_exempt
def chat_session_delete(request, project_id, session_id):
    """
    DELETE /api/projects/<pid>/sessions/<sid>/delete/
    Removes the session and all its messages (CASCADE).
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'DELETE':
        deleted, _ = ChatSession.objects.filter(
            id=session_id,
            project_id=project_id,
            user=request.user
        ).delete()
        if deleted:
            return JsonResponse({'message': 'Session deleted'})
        return JsonResponse({'error': 'Session not found'}, status=404)


@csrf_exempt
def get_session_history(request, project_id, session_id):
    """
    GET /api/projects/<pid>/sessions/<sid>/history/
    Returns all messages for a specific chat session in order.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'GET':
        try:
            session = ChatSession.objects.get(
                id=session_id,
                project_id=project_id,
                user=request.user
            )
        except ChatSession.DoesNotExist:
            return JsonResponse({'error': 'Session not found'}, status=404)

        messages = session.messages.values('role', 'content', 'created_at')
        return JsonResponse(list(messages), safe=False)


# ---------------------------------------------------------------------------
# Chat Gateway (stateful, session-scoped)
# ---------------------------------------------------------------------------

@csrf_exempt
def chat_gateway(request, project_id):
    """
    POST /api/projects/<pid>/chat/
    Body: { "message": "...", "session_id": "<uuid>" }

    - Saves the user message to the given session
    - Fetches the full session history and sends it to FastAPI
      so the model has conversational context (stateful multi-turn)
    - Streams the AI response back and persists it once complete
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'POST':
        data = json.loads(request.body)
        user_message_content = data.get('message')
        session_id = data.get('session_id')

        try:
            project = Project.objects.get(id=project_id, team__members=request.user)
        except Project.DoesNotExist:
            return JsonResponse({'error': 'Not authorized'}, status=403)

        # Resolve session — if none provided, fall back to the most recent one
        session = None
        if session_id:
            try:
                session = ChatSession.objects.get(
                    id=session_id,
                    project=project,
                    user=request.user
                )
            except ChatSession.DoesNotExist:
                return JsonResponse({'error': 'Session not found'}, status=404)

        # Save user message
        ChatMessage.objects.create(
            project=project,
            session=session,
            user=request.user,
            role='user',
            content=user_message_content
        )

        # Build conversation history for AI context (stateful multi-turn)
        history = []
        if session:
            prior_messages = ChatMessage.objects.filter(
                session=session
            ).order_by('created_at')
            history = [
                {'role': m.role, 'content': m.content}
                for m in prior_messages
            ]

        fastapi_url = "http://workspace-fastapi:8001/chat/"
        payload = {
            "project_id": str(project_id),
            "message": user_message_content,
            "history": history   # <-- enables stateful multi-turn conversation
        }

        def stream_generator():
            full_ai_response = ""
            try:
                with requests.post(fastapi_url, json=payload, stream=True) as r:
                    for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
                        if chunk:
                            full_ai_response += chunk
                            yield chunk
                ChatMessage.objects.create(
                    project=project,
                    session=session,
                    role='ai',
                    content=full_ai_response
                )
            except requests.exceptions.RequestException as e:
                error_msg = f"Error connecting to AI service: {str(e)}"
                ChatMessage.objects.create(
                    project=project,
                    session=session,
                    role='ai',
                    content=error_msg
                )
                yield error_msg

        return StreamingHttpResponse(stream_generator(), content_type='text/event-stream')


# ---------------------------------------------------------------------------
# Legacy: project-level chat history (kept for backward compatibility)
# ---------------------------------------------------------------------------

@csrf_exempt
def get_chat_history(request, project_id):
    """Legacy endpoint — returns all messages for the project regardless of session."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'GET':
        messages = ChatMessage.objects.filter(
            project_id=project_id,
            project__team__members=request.user
        ).values('role', 'content', 'created_at')
        return JsonResponse(list(messages), safe=False)
