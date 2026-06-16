import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session, select

from ..config import settings
from ..db import engine, get_session
from ..models import (
    ActiveAdapter,
    Candidate,
    PipelineCandidate,
    Position,
    TrainingDataset,
    TrainingExample,
    TrainingRun,
    utcnow,
)
from ..services.llm import make_client, set_backend

router = APIRouter(prefix="/training", tags=["training"])

MIN_DPO_PAIRS = 10  # TEMP: lowered from 20 for end-to-end testing — restore to 20
MIN_SFT_EXAMPLES = 30
MIN_GRPO_PROMPTS = 10

SELECTED_STAGES = {"hired", "offer"}
REJECTED_STAGES = {"rejected"}


class DatasetCreate(BaseModel):
    name: str
    description: str | None = None
    method: str | None = None  # sft | dpo | grpo


class ExampleCreate(BaseModel):
    example_type: str = "dpo_pair"
    prompt: str
    chosen_response: str | None = None
    rejected_response: str | None = None
    cot_trace: str | None = None
    recruiter_notes: str | None = None
    confidence: str | None = None
    source_pipeline_id: str | None = None
    source_candidate_ids: list[str] | None = None


class ExampleUpdate(BaseModel):
    prompt: str | None = None
    chosen_response: str | None = None
    rejected_response: str | None = None
    cot_trace: str | None = None
    recruiter_notes: str | None = None
    confidence: str | None = None


class GeneratePairs(BaseModel):
    position_id: str


class RunCreate(BaseModel):
    dataset_id: str
    method: str  # sft | dpo | grpo
    base_model: str = "Qwen/Qwen3-4B"  # matches the qwen3:4b chat model; fits an 8 GB GPU
    lora_rank: int = 16
    epochs: int = 3
    learning_rate: float = 2e-4
    use_qlora: bool = True
    notes: str | None = None


def dataset_stats(session: Session, dataset_id: str) -> dict:
    examples = session.exec(
        select(TrainingExample).where(TrainingExample.dataset_id == dataset_id)
    ).all()
    confidence_dist: dict[str, int] = {}
    for e in examples:
        if e.confidence:
            confidence_dist[e.confidence] = confidence_dist.get(e.confidence, 0) + 1
    pairs = sum(1 for e in examples if e.example_type == "dpo_pair")
    return {
        "total_examples": len(examples),
        "dpo_pairs": pairs,
        "sft_examples": sum(1 for e in examples if e.example_type == "sft"),
        "grpo_prompts": sum(1 for e in examples if e.example_type == "grpo_prompt"),
        "with_cot": sum(1 for e in examples if e.cot_trace),
        "confidence_distribution": confidence_dist,
    }


def example_to_dict(e: TrainingExample) -> dict:
    return {
        "id": e.id,
        "dataset_id": e.dataset_id,
        "example_type": e.example_type,
        "prompt": e.prompt,
        "chosen_response": e.chosen_response,
        "rejected_response": e.rejected_response,
        "cot_trace": e.cot_trace,
        "recruiter_notes": e.recruiter_notes,
        "confidence": e.confidence,
        "source_pipeline_id": e.source_pipeline_id,
        "source_candidate_ids": json.loads(e.source_candidate_ids or "[]"),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def run_to_dict(r: TrainingRun, active_run_id: str | None = None) -> dict:
    return {
        "id": r.id,
        "dataset_id": r.dataset_id,
        "method": r.method,
        "base_model": r.base_model,
        "lora_rank": r.lora_rank,
        "epochs": r.epochs,
        "learning_rate": r.learning_rate,
        "use_qlora": r.use_qlora,
        "status": r.status,
        "progress": r.progress,
        "adapter_path": r.adapter_path,
        "gguf_path": r.gguf_path,
        "eval_loss": r.eval_loss,
        "notes": r.notes,
        "eval_summary": r.eval_summary,
        "metrics": json.loads(r.metrics or "{}"),
        "is_active": r.id == active_run_id,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.post("/datasets")
def create_dataset(body: DatasetCreate, session: Session = Depends(get_session)):
    ds = TrainingDataset(name=body.name, description=body.description, method=body.method)
    session.add(ds)
    session.commit()
    session.refresh(ds)
    return {"id": ds.id, "name": ds.name, "status": ds.status}


@router.get("/datasets")
def list_datasets(session: Session = Depends(get_session)):
    out = []
    for ds in session.exec(select(TrainingDataset).order_by(TrainingDataset.created_at.desc())).all():
        out.append({
            "id": ds.id,
            "name": ds.name,
            "description": ds.description,
            "method": ds.method,
            "status": ds.status,
            "created_at": ds.created_at.isoformat() if ds.created_at else None,
            "stats": dataset_stats(session, ds.id),
        })
    return out


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str, session: Session = Depends(get_session)):
    ds = session.get(TrainingDataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found")
    examples = session.exec(
        select(TrainingExample).where(TrainingExample.dataset_id == dataset_id)
    ).all()
    return {
        "id": ds.id,
        "name": ds.name,
        "description": ds.description,
        "method": ds.method,
        "status": ds.status,
        "stats": dataset_stats(session, ds.id),
        "examples": [example_to_dict(e) for e in examples],
    }


@router.post("/datasets/{dataset_id}/examples")
def add_example(dataset_id: str, body: ExampleCreate, session: Session = Depends(get_session)):
    if session.get(TrainingDataset, dataset_id) is None:
        raise HTTPException(404, "Dataset not found")
    example = TrainingExample(
        dataset_id=dataset_id,
        example_type=body.example_type,
        prompt=body.prompt,
        chosen_response=body.chosen_response,
        rejected_response=body.rejected_response,
        cot_trace=body.cot_trace,
        recruiter_notes=body.recruiter_notes,
        confidence=body.confidence,
        source_pipeline_id=body.source_pipeline_id,
        source_candidate_ids=json.dumps(body.source_candidate_ids or []),
    )
    session.add(example)
    session.commit()
    session.refresh(example)
    return example_to_dict(example)


@router.put("/datasets/{dataset_id}/examples/{example_id}")
def edit_example(dataset_id: str, example_id: str, body: ExampleUpdate, session: Session = Depends(get_session)):
    example = session.get(TrainingExample, example_id)
    if example is None or example.dataset_id != dataset_id:
        raise HTTPException(404, "Example not found")
    for field in ("prompt", "chosen_response", "rejected_response", "cot_trace", "recruiter_notes", "confidence"):
        value = getattr(body, field)
        if value is not None:
            setattr(example, field, value)
    session.add(example)
    session.commit()
    session.refresh(example)
    return example_to_dict(example)


@router.delete("/datasets/{dataset_id}/examples/{example_id}")
def delete_example(dataset_id: str, example_id: str, session: Session = Depends(get_session)):
    example = session.get(TrainingExample, example_id)
    if example is None or example.dataset_id != dataset_id:
        raise HTTPException(404, "Example not found")
    session.delete(example)
    session.commit()
    return {"ok": True}


@router.post("/datasets/{dataset_id}/generate-pairs")
def generate_pairs(dataset_id: str, body: GeneratePairs, session: Session = Depends(get_session)):
    """Auto-generate DPO preference pairs from a closed pipeline (spec §13.7.4)."""
    ds = session.get(TrainingDataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found")
    position = session.get(Position, body.position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    if not position.status.startswith("closed"):
        raise HTTPException(400, "Pairs can only be generated from closed pipelines")

    schema = json.loads(position.extracted_schema or "{}")
    dimensions = [d["name"] for d in schema.get("scoring_dimensions", [])]
    prompt = (
        f"Job Position: {position.title}\n"
        f"Summary: {schema.get('position_title', position.title)}\n"
        f"Scoring Dimensions: {', '.join(dimensions)}\n\n"
        "Evaluate the candidate below and produce a structured assessment with "
        "per-dimension scores (1-10) and justifications."
    )

    rows = session.exec(
        select(PipelineCandidate, Candidate)
        .where(PipelineCandidate.position_id == position.id)
        .where(PipelineCandidate.candidate_id == Candidate.id)
    ).all()

    def evaluation_text(pc: PipelineCandidate, c: Candidate) -> str:
        return json.dumps({
            "candidate": c.full_name,
            "fit_score": pc.fit_score,
            "scores": json.loads(pc.dimension_scores or "[]"),
        }, ensure_ascii=False)

    selected = [(pc, c) for pc, c in rows if (pc.current_stage or "").lower() in SELECTED_STAGES]
    rejected = [(pc, c) for pc, c in rows if (pc.current_stage or "").lower() in REJECTED_STAGES]

    created = []
    for sel_pc, sel_c in selected:
        for rej_pc, rej_c in rejected:
            example = TrainingExample(
                dataset_id=dataset_id,
                example_type="dpo_pair",
                prompt=prompt + f"\n\nCandidate A: {sel_c.summary}\nCandidate B: {rej_c.summary}",
                chosen_response=evaluation_text(sel_pc, sel_c),
                rejected_response=evaluation_text(rej_pc, rej_c),
                confidence="medium",
                source_pipeline_id=position.id,
                source_candidate_ids=json.dumps([sel_c.id, rej_c.id]),
            )
            session.add(example)
            created.append(example)
    session.commit()
    return {"created": len(created), "stats": dataset_stats(session, dataset_id)}


@router.post("/runs")
async def submit_run(body: RunCreate, session: Session = Depends(get_session)):
    ds = session.get(TrainingDataset, body.dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found")
    stats = dataset_stats(session, body.dataset_id)
    if body.method == "dpo" and stats["dpo_pairs"] < MIN_DPO_PAIRS:
        raise HTTPException(400, f"DPO requires at least {MIN_DPO_PAIRS} preference pairs (have {stats['dpo_pairs']})")
    if body.method == "sft" and stats["total_examples"] < MIN_SFT_EXAMPLES:
        raise HTTPException(400, f"SFT requires at least {MIN_SFT_EXAMPLES} examples (have {stats['total_examples']})")
    if body.method == "grpo" and stats["total_examples"] < MIN_GRPO_PROMPTS:
        raise HTTPException(400, f"GRPO requires at least {MIN_GRPO_PROMPTS} prompts (have {stats['total_examples']})")
    if body.method not in ("sft", "dpo", "grpo"):
        raise HTTPException(400, f"Unknown method: {body.method}")

    run = TrainingRun(
        dataset_id=body.dataset_id,
        method=body.method,
        base_model=body.base_model,
        lora_rank=body.lora_rank,
        epochs=body.epochs,
        learning_rate=body.learning_rate,
        use_qlora=body.use_qlora,
        notes=body.notes,
    )
    session.add(run)
    ds.status = "training"
    session.add(ds)
    session.commit()
    session.refresh(run)

    # Hand the job to the trainer service; it reads examples from the shared SQLite volume.
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{settings.TRAINER_BASE_URL}/jobs", json={"run_id": run.id})
            resp.raise_for_status()
    except Exception as exc:
        run.status = "failed"
        run.eval_summary = f"Could not reach trainer service: {exc}"
        ds.status = "ready"
        session.add(run)
        session.add(ds)
        session.commit()
        raise HTTPException(502, "Trainer service unavailable. Start it with: docker compose --profile training up trainer")
    return run_to_dict(run)


@router.get("/runs")
def list_runs(session: Session = Depends(get_session)):
    active = session.get(ActiveAdapter, 1)
    active_id = active.run_id if active else None
    runs = session.exec(select(TrainingRun).order_by(TrainingRun.created_at.desc())).all()
    return [run_to_dict(r, active_id) for r in runs]


@router.get("/runs/{run_id}")
def get_run(run_id: str, session: Session = Depends(get_session)):
    run = session.get(TrainingRun, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    active = session.get(ActiveAdapter, 1)
    return run_to_dict(run, active.run_id if active else None)


@router.post("/runs/{run_id}/activate")
async def activate_run(run_id: str, session: Session = Depends(get_session)):
    run = session.get(TrainingRun, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    if run.status != "completed" or not run.gguf_path:
        raise HTTPException(400, "Run is not completed or has no GGUF adapter")

    active = session.get(ActiveAdapter, 1)
    if active is None:
        active = ActiveAdapter(id=1, run_id=run_id)
    else:
        active.run_id = run_id
        active.activated_at = utcnow()
    session.add(active)
    session.commit()

    # Ask the trainer service to stage the adapter into the shared model volume
    # so the llamacpp service picks it up on (re)start.
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{settings.TRAINER_BASE_URL}/activate", json={"run_id": run_id})
            resp.raise_for_status()
    except Exception:
        pass  # staging is best-effort; adapter can be staged manually

    set_backend("llamacpp")
    return {"ok": True, "active_run_id": run_id, "inference_backend": "llamacpp"}


@router.post("/runs/deactivate")
def deactivate(session: Session = Depends(get_session)):
    active = session.get(ActiveAdapter, 1)
    if active:
        session.delete(active)
        session.commit()
    set_backend("ollama")
    return {"ok": True, "inference_backend": "ollama"}


class CompareRequest(BaseModel):
    position_id: str
    candidate_id: str


@router.post("/compare")
async def compare_models(body: CompareRequest, session: Session = Depends(get_session)):
    """Score one candidate with the base model and the fine-tuned model side by side.

    Requires the llamacpp service to be running with an activated adapter.
    """
    import asyncio
    import json as _json

    from ..services.agents.scorer import score_candidate

    position = session.get(Position, body.position_id)
    candidate = session.get(Candidate, body.candidate_id)
    if position is None or candidate is None:
        raise HTTPException(404, "Position or candidate not found")

    schema = _json.loads(position.extracted_schema or "{}")
    dimensions = [d["name"] for d in schema.get("scoring_dimensions", [])] or ["Overall Fit"]
    full_text = candidate.raw_text or candidate.summary or ""
    if candidate.recruiter_notes:
        full_text += f"\nRecruiter notes:\n{candidate.recruiter_notes}"

    async def run(backend: str):
        try:
            scores, fit, _eligible, _reason = await score_candidate(
                position.title, dimensions, full_text, llm=make_client(backend)
            )
            return {"backend": backend, "ok": True, "fit_score": fit, "scores": scores}
        except Exception as exc:
            return {"backend": backend, "ok": False, "error": str(exc)}

    base, tuned = await asyncio.gather(run("ollama"), run("llamacpp"))
    return {
        "candidate_name": candidate.full_name,
        "position_title": position.title,
        "dimensions": dimensions,
        "base": base,
        "fine_tuned": tuned,
    }


@router.get("/context/search")
def context_search(q: str, table: str = "examples", limit: int = 20):
    """BM25 full-text search over FTS5 training context tables."""
    fts_tables = {
        "examples": ("fts_training_examples", ["example_id", "dataset_id", "prompt", "chosen_response",
                                               "rejected_response", "cot_trace", "recruiter_notes"]),
        "tags": ("fts_training_tags", ["tag_id", "candidate_id", "position_id", "outcome",
                                       "signal_type", "reasoning", "cot_trace"]),
        "runs": ("fts_training_runs", ["run_id", "method", "base_model", "notes", "eval_summary"]),
    }
    if table not in fts_tables:
        raise HTTPException(400, f"Unknown table: {table}. Use one of: {list(fts_tables)}")
    fts_name, columns = fts_tables[table]
    sql = text(
        f"SELECT {', '.join(columns)}, bm25({fts_name}) AS rank "
        f"FROM {fts_name} WHERE {fts_name} MATCH :q ORDER BY rank LIMIT :limit"
    )
    with engine.connect() as conn:
        try:
            rows = conn.execute(sql, {"q": q, "limit": limit}).fetchall()
        except Exception as exc:
            raise HTTPException(400, f"Invalid FTS5 query: {exc}")
    return [dict(zip(columns + ["rank"], row)) for row in rows]
