import io

from minio import Minio

from ..config import settings

_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
    return _client


def init_buckets() -> None:
    client = get_minio()
    for bucket in (settings.BUCKET_CANDIDATE_FILES, settings.BUCKET_MODEL_ADAPTERS):
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)


def upload_file(bucket: str, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    client = get_minio()
    client.put_object(bucket, object_name, io.BytesIO(data), length=len(data), content_type=content_type)
    return f"{bucket}/{object_name}"


def download_file(bucket: str, object_name: str) -> bytes:
    client = get_minio()
    resp = client.get_object(bucket, object_name)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()
