import json
import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path}")
    import importlib

    from app import config, db

    importlib.reload(config)
    importlib.reload(db)
    db.init_db()

    # Build the app without the lifespan side effects (Ollama/Milvus/MinIO waits).
    # Reload the router so its Depends(get_session) points at the reloaded db module.
    from fastapi import FastAPI

    from app.routers import training

    importlib.reload(training)
    real_get_session = db.get_session

    app = FastAPI()
    app.include_router(training.router, prefix="/api/v1")

    def override():
        from sqlmodel import Session

        with Session(db.engine) as session:
            yield session

    app.dependency_overrides[real_get_session] = override

    yield TestClient(app), db
    db.engine.dispose()
    os.unlink(path)


def _seed_closed_pipeline(db):
    from sqlmodel import Session

    from app.models import Candidate, PipelineCandidate, Position

    with Session(db.engine) as session:
        position = Position(
            title="Senior Backend",
            status="closed_filled",
            extracted_schema=json.dumps({
                "position_title": "Senior Backend",
                "scoring_dimensions": [{"name": "Go", "description": "", "weight": 1.0}],
            }),
            stages=json.dumps(["New", "Hired", "Rejected"]),
        )
        hired = Candidate(full_name="Alice", summary="Go expert")
        rejected = Candidate(full_name="Bob", summary="Junior dev")
        session.add(position)
        session.add(hired)
        session.add(rejected)
        session.commit()
        session.add(PipelineCandidate(
            position_id=position.id, candidate_id=hired.id, current_stage="Hired",
            fit_score=9.0, dimension_scores=json.dumps([{"dimension": "Go", "score": 9}]),
        ))
        session.add(PipelineCandidate(
            position_id=position.id, candidate_id=rejected.id, current_stage="Rejected",
            fit_score=4.0, dimension_scores=json.dumps([{"dimension": "Go", "score": 4}]),
        ))
        session.commit()
        return position.id


def test_generate_pairs_from_closed_pipeline(client):
    api, db = client
    position_id = _seed_closed_pipeline(db)

    ds = api.post("/api/v1/training/datasets", json={"name": "test ds"}).json()
    resp = api.post(f"/api/v1/training/datasets/{ds['id']}/generate-pairs",
                    json={"position_id": position_id})
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 1  # 1 hired x 1 rejected

    detail = api.get(f"/api/v1/training/datasets/{ds['id']}").json()
    example = detail["examples"][0]
    assert example["example_type"] == "dpo_pair"
    assert "Alice" in example["chosen_response"]
    assert "Bob" in example["rejected_response"]


def test_generate_pairs_rejects_open_pipeline(client):
    api, db = client
    from sqlmodel import Session

    from app.models import Position

    with Session(db.engine) as session:
        position = Position(title="Open role", status="open")
        session.add(position)
        session.commit()
        position_id = position.id

    ds = api.post("/api/v1/training/datasets", json={"name": "ds2"}).json()
    resp = api.post(f"/api/v1/training/datasets/{ds['id']}/generate-pairs",
                    json={"position_id": position_id})
    assert resp.status_code == 400


def test_run_submission_enforces_minimum_pairs(client):
    api, _ = client
    ds = api.post("/api/v1/training/datasets", json={"name": "tiny"}).json()
    resp = api.post("/api/v1/training/runs", json={"dataset_id": ds["id"], "method": "dpo"})
    assert resp.status_code == 400
    assert "20" in resp.json()["detail"]
