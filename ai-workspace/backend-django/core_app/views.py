from django.shortcuts import render

import json
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
