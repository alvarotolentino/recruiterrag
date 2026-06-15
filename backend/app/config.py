import os


class Settings:
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    LLAMACPP_BASE_URL: str = os.getenv("LLAMACPP_BASE_URL", "http://localhost:8080")
    INFERENCE_BACKEND: str = os.getenv("INFERENCE_BACKEND", "ollama")  # ollama | llamacpp
    LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen3:8b")
    EMBED_MODEL: str = os.getenv("EMBED_MODEL", "nomic-embed-text")
    EMBED_DIM: int = int(os.getenv("EMBED_DIM", "768"))

    MILVUS_HOST: str = os.getenv("MILVUS_HOST", "localhost")
    MILVUS_PORT: str = os.getenv("MILVUS_PORT", "19530")
    MILVUS_COLLECTION: str = "candidates"

    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "recruiterrag")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "recruiterrag")
    BUCKET_CANDIDATE_FILES: str = "candidate-files"
    BUCKET_MODEL_ADAPTERS: str = "model-adapters"

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./recruiterrag.db")

    TRAINER_BASE_URL: str = os.getenv("TRAINER_BASE_URL", "http://localhost:8500")

    # LLM request timeout (seconds). CPU inference of 8B models is slow;
    # raise this on weak hardware or lower it after switching to a lighter model.
    LLM_TIMEOUT: float = float(os.getenv("LLM_TIMEOUT", "900"))
    EMBED_TIMEOUT: float = float(os.getenv("EMBED_TIMEOUT", "300"))

    # Max characters of candidate/JD text sent to the LLM. Smaller = faster on CPU.
    LLM_MAX_INPUT_CHARS: int = int(os.getenv("LLM_MAX_INPUT_CHARS", "16000"))

    # Matching pipeline
    ANN_TOP_K: int = 30
    SCORING_CONCURRENCY: int = int(os.getenv("SCORING_CONCURRENCY", "3"))

    APP_VERSION: str = "1.0.0"


settings = Settings()
