import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import app_settings, candidates, chat, dashboard, positions, training
from .services import milvus_client, storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("recruiterrag")


async def wait_for_ollama(timeout_seconds: int = 600) -> None:
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            try:
                resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
                if resp.status_code == 200:
                    logger.info("Ollama is ready")
                    return
            except httpx.HTTPError:
                pass
            if asyncio.get_event_loop().time() > deadline:
                logger.warning("Ollama not reachable after %ss — continuing anyway", timeout_seconds)
                return
            logger.info("Waiting for Ollama...")
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("SQLite schema + FTS5 ready")
    await wait_for_ollama()
    try:
        storage.init_buckets()
        logger.info("MinIO buckets ready")
    except Exception as exc:
        logger.warning("MinIO init failed: %s", exc)
    try:
        milvus_client.init_collection()
        logger.info("Milvus collection ready")
    except Exception as exc:
        logger.warning("Milvus init failed: %s", exc)
    yield


app = FastAPI(title="RecruiterRAG API", version=settings.APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local single-user app; no auth in v1.0
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(candidates.router, prefix=API_PREFIX)
app.include_router(positions.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(app_settings.router, prefix=API_PREFIX)
app.include_router(training.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health")
async def health():
    status = {"api": "ok", "ollama": "unknown", "milvus": "unknown", "storage": "unknown"}
    async with httpx.AsyncClient(timeout=3) as client:
        try:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            status["ollama"] = "ok" if resp.status_code == 200 else "error"
        except Exception:
            status["ollama"] = "error"
    try:
        milvus_client.connect()
        status["milvus"] = "ok"
    except Exception:
        status["milvus"] = "error"
    try:
        storage.get_minio().bucket_exists(settings.BUCKET_CANDIDATE_FILES)
        status["storage"] = "ok"
    except Exception:
        status["storage"] = "error"
    return status
