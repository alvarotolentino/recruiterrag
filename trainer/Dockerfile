FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /trainer

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# llama.cpp conversion script for PEFT LoRA -> GGUF
RUN git clone --depth 1 https://github.com/ggml-org/llama.cpp /opt/llama.cpp \
    && pip install --no-cache-dir gguf sentencepiece

COPY . .

EXPOSE 8500

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8500"]
