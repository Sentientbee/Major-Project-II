from django.db import models

from django.db import models
from django.contrib.auth.models import User

class Team(models.Model):
    name = models.CharField(max_length=255)
    members = models.ManyToManyField(User, related_name='teams')

    def __str__(self):
        return self.name

class Project(models.Model):
    name = models.CharField(max_length=255)
    # A project consists of a team, not user directly
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='projects')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Document(models.Model):
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='documents/')
    # Can belong to a User and/or a Project
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='personal_docs')
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='project_docs')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
