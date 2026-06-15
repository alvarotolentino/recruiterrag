# RecruiterRAG

A fully local, AI-powered recruiting pipeline for non-technical recruiters. Upload resumes and job
descriptions — the AI extracts, scores, and ranks candidates, and you explore them through a chat
interface with live charts. No cloud accounts, no API keys. Everything runs on your machine.

## Quick Start (5 steps)

1. **Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)** (Windows needs WSL2 enabled).
2. **Clone and start:**
   ```bash
   git clone <repo-url> recruiterrag
   cd recruiterrag
   docker compose up
   ```
3. **Wait for the first-run model download** (Qwen3 8B + embeddings, ~6 GB — one time only).
4. **Open <http://localhost:3000>** — the welcome tour starts automatically.
5. **Add candidates** (drop PDFs/Word files) and **create a position** (paste a JD). Done.

> **Have an NVIDIA GPU?** Run inference on it for a big speedup — see [docs/GPU.md](docs/GPU.md).
> Short version: `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build`.

## What's Inside

| Service | Port | Purpose |
|---|---|---|
| `ui` | 3000 | React app (dashboard, chat, wizards) |
| `api` | 8000 | FastAPI backend + AI agents |
| `ollama` | 11434 | Local LLM inference (qwen3:8b, nomic-embed-text) |
| `milvus` | 19530 | Vector search over candidates |
| `storage` (MinIO) | 9000 | Raw file + model adapter storage |
| `llamacpp` | 8080 | Serves your fine-tuned model (profile: `finetuned`) |
| `trainer` | 8500 | Fine-tuning service (profile: `training`, needs GPU) |

## Teaching Your AI (optional, needs a GPU)

After closing a few pipelines you can fine-tune the model on your own hiring decisions:

```bash
docker compose --profile training up -d trainer
```

Then open **Teach Your AI** in the app and follow the wizard. Requires an NVIDIA GPU with ≥ 6 GB
VRAM (QLoRA) or ≥ 16 GB (LoRA). Once an adapter is activated, start the fine-tuned inference
backend:

```bash
docker compose --profile finetuned up -d llamacpp
```

## Common Issues

| Symptom | Fix |
|---|---|
| "The AI isn't ready yet" | First run downloads ~6 GB of models. Watch `docker compose logs ollama-init`. |
| Chat / resume processing is slow | CPU inference of qwen3:8b is slow. Best fix: enable GPU ([docs/GPU.md](docs/GPU.md)). Otherwise set `LLM_MODEL=qwen3:4b` in `.env`. |
| Scanned PDFs read poorly | OCR quality depends on scan resolution. Paste the text manually if extraction looks wrong. |
| Training says "no GPU found" | The trainer needs CUDA or Apple Silicon. CPU training is not supported. |

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Spec and plan live in [docs/spec.md](docs/spec.md)
and [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

## Privacy

All inference, storage, and processing stays on your machine. After the first model download the
app runs fully offline. MinIO credentials default to `recruiterrag`/`recruiterrag` — change them if
you ever expose the services beyond localhost.
