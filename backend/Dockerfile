# Multi-target Dockerfile for EcoRoute Backend (API & Worker)
FROM python:3.13-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered output for logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager
RUN pip install --no-cache-dir uv

# Copy dependencies manifest
COPY requirements.txt .

# Install dependencies into system Python
RUN uv pip install --system -r requirements.txt

# Copy application source code and migrations
COPY . .

# Expose default HTTP port
EXPOSE 8000

# Default entrypoint runs the FastAPI backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
