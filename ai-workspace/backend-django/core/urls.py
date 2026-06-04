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
]
