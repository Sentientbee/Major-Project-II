# Use the official lightweight Python image
FROM python:3.11-slim

# Set environment variables
# 1. Prevents Python from writing .pyc files to disk
# 2. Ensures Python output is logged directly to the terminal without buffering
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
# (You will need to create an empty requirements.txt file in this folder for now)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the Django project code
COPY . .

# Expose port 8000 for Django
EXPOSE 8000

# Start the Django development server
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
