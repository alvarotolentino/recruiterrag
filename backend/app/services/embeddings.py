import httpx

from ..config import settings


async def embed_text(text: str) -> list[float]:
    """Generate a 768-dim embedding via Ollama nomic-embed-text."""
    async with httpx.AsyncClient(timeout=settings.EMBED_TIMEOUT) as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/embeddings",
            json={"model": settings.EMBED_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        return resp.json()["embedding"]
