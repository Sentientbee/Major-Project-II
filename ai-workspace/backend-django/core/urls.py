from django.contrib import admin
from django.urls import path
from core_app import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/signup/', views.signup_view),
    path('api/login/', views.login_view),
    path('api/projects/', views.project_list_create),
    path('api/projects/<uuid:project_id>/documents/', views.document_list_create),

    path('api/projects/<uuid:project_id>/documents/', views.document_list_create),
    path('api/projects/<uuid:project_id>/chat/', views.chat_gateway),

    # Add these underneath your existing paths in core/urls.py
    path('api/projects/<uuid:project_id>/team/add/', views.add_team_member),
    path('api/projects/<uuid:project_id>/chat/history/', views.get_chat_history),

    path('api/projects/<uuid:project_id>/delete/', views.delete_project),
    path('api/projects/<uuid:project_id>/documents/<uuid:doc_id>/delete/', views.delete_document),
    path('api/projects/<uuid:project_id>/evaluate/', views.save_evaluation),
]
