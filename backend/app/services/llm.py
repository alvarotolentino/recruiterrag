"""Common LLM client interface over Ollama and llama.cpp backends.

Both backends are driven through plain HTTP. llama.cpp exposes an
OpenAI-compatible /v1/chat/completions endpoint; Ollama uses /api/chat.
"""
import json
import re
from typing import Any, Optional, Union

import httpx

from ..config import settings

# A JSON output constraint: either Ollama's generic "json" mode or a JSON Schema dict.
JsonFormat = Union[str, dict]


class LLMError(Exception):
    pass


class LLMClient:
    async def chat(
        self, messages: list[dict], thinking: bool = False, fmt: Optional[JsonFormat] = None
    ) -> str:
        raise NotImplementedError

    async def chat_json(
        self,
        messages: list[dict],
        retries: int = 2,
        thinking: bool = False,
        schema: Optional[dict] = None,
    ) -> Any:
        """Call chat constrained to JSON output and parse the result.

        Passes a JSON Schema (or generic JSON mode) to the backend so the model is
        *forced* to emit valid JSON via constrained decoding — no prose-scraping.
        Structured output and thinking are mutually exclusive, so thinking is
        disabled whenever a format is in effect.
        """
        fmt: JsonFormat = schema or "json"
        last_err: Optional[Exception] = None
        for _ in range(retries + 1):
            raw = await self.chat(messages, thinking=False, fmt=fmt)
            try:
                return extract_json(raw)
            except (json.JSONDecodeError, ValueError) as e:
                last_err = e
                messages = messages + [
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": "That was not valid JSON. Reply with ONLY the JSON object."},
                ]
        raise LLMError(f"LLM returned invalid JSON after {retries + 1} attempts: {last_err}")


def extract_json(raw: str) -> Any:
    """Parse the first complete JSON value in a model response.

    Tolerates leading <think> blocks, markdown fences, and trailing text after the
    object (the "Extra data" case) by using a raw decoder that stops at the end of
    the first valid value.
    """
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    cleaned = re.sub(r"```(?:json)?", "", cleaned).strip()
    start = cleaned.find("{")
    if start == -1:
        raise ValueError("no JSON object found in response")
    try:
        obj, _ = json.JSONDecoder().raw_decode(cleaned[start:])
        return obj
    except json.JSONDecodeError as e:
        raise ValueError(f"could not decode JSON: {e}") from e


class OllamaClient(LLMClient):
    def __init__(self, base_url: str = "", model: str = ""):
        self.base_url = base_url or settings.OLLAMA_BASE_URL
        self.model = model or settings.LLM_MODEL

    async def chat(
        self, messages: list[dict], thinking: bool = False, fmt: Optional[JsonFormat] = None
    ) -> str:
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "think": thinking,
            "options": {"temperature": 0.2},
        }
        if fmt is not None:
            payload["format"] = fmt  # "json" or a JSON Schema object
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT) as client:
            resp = await client.post(f"{self.base_url}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()
        return data["message"]["content"]


class LlamaCppClient(LLMClient):
    def __init__(self, base_url: str = ""):
        self.base_url = base_url or settings.LLAMACPP_BASE_URL

    async def chat(
        self, messages: list[dict], thinking: bool = False, fmt: Optional[JsonFormat] = None
    ) -> str:
        # Qwen3 defaults to thinking mode; /no_think via system message disables it so
        # the response goes to "content" (not reasoning_content) and JSON schema output works.
        no_think_sys = {"role": "system", "content": "/no_think"}
        controlled = [no_think_sys] + [m for m in messages if m.get("role") != "system"]
        payload: dict = {
            "messages": controlled,
            "temperature": 0.2,
            "max_tokens": 4096,
        }
        if isinstance(fmt, dict):
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "result", "schema": fmt},
            }
        elif fmt == "json":
            payload["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT) as client:
            resp = await client.post(f"{self.base_url}/v1/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
        msg = data["choices"][0]["message"]
        # If thinking still ran and exhausted the token budget, content is ""; fall back.
        return msg.get("content") or msg.get("reasoning_content") or ""


_client: Optional[LLMClient] = None


def get_llm() -> LLMClient:
    global _client
    if _client is None:
        _client = make_client(settings.INFERENCE_BACKEND)
    return _client


def make_client(backend: str) -> LLMClient:
    if backend == "llamacpp":
        return LlamaCppClient()
    return OllamaClient()


def set_backend(backend: str) -> None:
    global _client
    _client = make_client(backend)
