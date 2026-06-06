import uuid
from django.db import models
from django.contrib.auth.models import User


class Team(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    members = models.ManyToManyField(User, related_name='teams')


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='projects')
    created_at = models.DateTimeField(auto_now_add=True)


class Document(models.Model):
    STATUS_CHOICES = (
        ('Uploaded', 'Uploaded'),
        ('Processing', 'Processing...'),
        ('Ready', 'Ready'),
        ('Failed', 'Failed'),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='documents/')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='documents')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Uploaded')
    uploaded_at = models.DateTimeField(auto_now_add=True)


class ChatSession(models.Model):
    """Represents a single named chat tab within a project."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='chat_sessions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    title = models.CharField(max_length=255, default='New Chat')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.project.name})"


class ChatMessage(models.Model):
    ROLE_CHOICES = (
        ('user', 'User'),
        ('ai', 'AI'),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='chat_messages')
    # Session FK — nullable so existing messages without a session still work
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name='messages',
        null=True,
        blank=True
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
