# Python 3.11 Slim Image (Ensures compatibility with TensorFlow 2.13.1)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Install system dependencies required by OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files (.dockerignore keeps .env and local backups out of the image)
COPY . .

# Hosts such as Hugging Face Spaces run the container as a non-root user (uid 1000):
# give it a writable HOME and let it save word packs / profiles in backend/data
ENV HOME=/tmp
RUN chmod -R a+rwX /app/backend/data

# Expose FastAPI port
EXPOSE 8000

# Launch Uvicorn server; hosts such as Render, Railway and Fly inject $PORT
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
