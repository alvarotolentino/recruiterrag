FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    # pymilvus pulls milvus-lite (an embedded local engine, ~140 MB) but we talk to
    # the remote milvus server, so it is dead weight — remove it.
    && pip uninstall -y milvus-lite \
    # Drop bytecode caches (regenerated lazily at runtime if ever needed).
    && find /usr/local/lib/python3.11 -type d -name __pycache__ -prune -exec rm -rf {} +

COPY app ./app

EXPOSE 8000

# Quiet logs: warnings+ only, and drop the per-request access log noise.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--log-level", "warning", "--no-access-log"]
