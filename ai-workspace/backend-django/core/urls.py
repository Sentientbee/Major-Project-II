from django.contrib import admin
from django.urls import path
from core_app import views

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth
    path('api/signup/', views.signup_view),
    path('api/login/', views.login_view),

    # Projects
    path('api/projects/', views.project_list_create),
    path('api/projects/<uuid:project_id>/delete/', views.delete_project),

    # Team
    path('api/projects/<uuid:project_id>/team/add/', views.add_team_member),

    # Documents
    path('api/projects/<uuid:project_id>/documents/', views.document_list_create),
    path('api/projects/<uuid:project_id>/documents/<uuid:doc_id>/delete/', views.delete_document),

    # Chat Sessions (multi-tab)
    path('api/projects/<uuid:project_id>/sessions/', views.chat_session_list_create),
    path('api/projects/<uuid:project_id>/sessions/<uuid:session_id>/delete/', views.chat_session_delete),
    path('api/projects/<uuid:project_id>/sessions/<uuid:session_id>/history/', views.get_session_history),

    # Chat gateway (stateful, session-scoped)
    path('api/projects/<uuid:project_id>/chat/', views.chat_gateway),

    # Legacy project-level history (kept for backward compat)
    path('api/projects/<uuid:project_id>/chat/history/', views.get_chat_history),
]
