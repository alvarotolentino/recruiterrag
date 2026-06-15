from pymilvus import (
    Collection,
    CollectionSchema,
    DataType,
    FieldSchema,
    connections,
    utility,
)

from ..config import settings

_connected = False


def connect() -> None:
    global _connected
    if not _connected:
        connections.connect(alias="default", host=settings.MILVUS_HOST, port=settings.MILVUS_PORT)
        _connected = True


def init_collection() -> Collection:
    connect()
    name = settings.MILVUS_COLLECTION
    if not utility.has_collection(name):
        schema = CollectionSchema(
            fields=[
                FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=64, is_primary=True),
                FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=settings.EMBED_DIM),
                FieldSchema(name="remote_pref", dtype=DataType.VARCHAR, max_length=32),
                FieldSchema(name="seniority", dtype=DataType.VARCHAR, max_length=32),
                FieldSchema(name="years_exp", dtype=DataType.FLOAT),
                FieldSchema(name="location", dtype=DataType.VARCHAR, max_length=128),
            ],
            description="RecruiterRAG candidate embeddings",
        )
        collection = Collection(name=name, schema=schema)
        collection.create_index(
            field_name="embedding",
            index_params={"index_type": "HNSW", "metric_type": "COSINE", "params": {"M": 16, "efConstruction": 200}},
        )
    collection = Collection(name)
    collection.load()
    return collection


def get_collection() -> Collection:
    connect()
    return Collection(settings.MILVUS_COLLECTION)


def insert_candidate(
    candidate_id: str,
    embedding: list[float],
    remote_pref: str | None,
    seniority: str | None,
    years_exp: float | None,
    location: str | None,
) -> None:
    col = get_collection()
    col.upsert(
        [
            {
                "id": candidate_id,
                "embedding": embedding,
                "remote_pref": remote_pref or "",
                "seniority": seniority or "",
                "years_exp": float(years_exp or 0.0),
                "location": location or "",
            }
        ]
    )
    col.flush()


def delete_candidate(candidate_id: str) -> None:
    col = get_collection()
    col.delete(expr=f'id == "{candidate_id}"')


def search(
    embedding: list[float],
    top_k: int = 30,
    scalar_filter: str | None = None,
) -> list[dict]:
    """ANN search with optional scalar pre-filter. Returns [{id, score}] by cosine similarity."""
    col = get_collection()
    col.load()
    results = col.search(
        data=[embedding],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"ef": 128}},
        limit=top_k,
        expr=scalar_filter,
        output_fields=["id"],
    )
    hits = []
    for hit in results[0]:
        hits.append({"id": hit.entity.get("id"), "score": float(hit.distance)})
    return hits


def get_all_embeddings(limit: int = 1000) -> list[dict]:
    """Fetch all candidate vectors + scalar fields (for the candidate map projection)."""
    col = get_collection()
    col.load()
    rows = col.query(
        expr="id != ''",
        output_fields=["id", "embedding", "seniority", "years_exp"],
        limit=limit,
    )
    return rows
