import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from ..db import get_session
from ..models import (
    Candidate,
    PipelineCandidate,
    PipelineNote,
    Position,
    StageHistory,
    utcnow,
)
from ..services.agents.jd_extractor import extract_jd
from ..services.jobs import create_job, get_job
from ..services.matching import rescore_pipeline, rescore_with_notes, run_matching, score_single

router = APIRouter(prefix="/positions", tags=["positions"])

DEFAULT_STAGES = ["New", "Screening", "Technical Interview", "Cultural Interview", "Offer", "Hired", "Rejected"]
VALID_STATUSES = {"open", "paused", "closed_filled", "closed_cancelled"}

# position_id -> latest scoring job id (for SSE progress)
_scoring_jobs: dict[str, str] = {}


class PositionCreate(BaseModel):
    jd_text: str
    title: str | None = None
    stages: list[str] | None = None
    budget_range: str | None = None
    remote_pref: str | None = None
    location: str | None = None
    min_years_exp: float | None = None
    extracted_schema: dict | None = None  # pre-extracted (wizard flow); skips LLM extraction
    auto_match: bool = True


class PositionUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    stages: list[str] | None = None
    budget_range: str | None = None
    remote_pref: str | None = None
    location: str | None = None
    min_years_exp: float | None = None
    extracted_schema: dict | None = None


class StatusUpdate(BaseModel):
    status: str


class AddCandidate(BaseModel):
    candidate_id: str


class StageMove(BaseModel):
    stage: str
    note: str | None = None


class NoteCreate(BaseModel):
    stage: str
    content: str


def position_to_dict(p: Position, candidate_count: int | None = None) -> dict:
    d = {
        "id": p.id,
        "title": p.title,
        "description": p.description,
        "extracted_schema": json.loads(p.extracted_schema or "{}"),
        "stages": json.loads(p.stages or "[]"),
        "status": p.status,
        "budget_range": p.budget_range,
        "remote_pref": p.remote_pref,
        "location": p.location,
        "min_years_exp": p.min_years_exp,
        "seniority": p.seniority,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "closed_at": p.closed_at.isoformat() if p.closed_at else None,
    }
    if candidate_count is not None:
        d["candidate_count"] = candidate_count
    return d


@router.post("/extract-jd")
async def extract_jd_preview(body: dict):
    """Wizard step 2: extract JD schema for review without creating the position."""
    jd_text = (body.get("jd_text") or "").strip()
    if not jd_text:
        raise HTTPException(400, "jd_text is required")
    try:
        schema = await extract_jd(jd_text)
    except Exception as exc:
        raise HTTPException(502, f"JD extraction failed: {exc}")
    return schema


@router.post("")
async def create_position(body: PositionCreate, session: Session = Depends(get_session)):
    jd_text = body.jd_text.strip()
    if not jd_text:
        raise HTTPException(400, "jd_text is required")

    schema = body.extracted_schema
    if schema is None:
        try:
            schema = await extract_jd(jd_text)
        except Exception as exc:
            raise HTTPException(502, f"JD extraction failed: {exc}")

    position = Position(
        title=body.title or schema.get("position_title") or "Untitled Position",
        description=jd_text,
        extracted_schema=json.dumps(schema),
        stages=json.dumps(body.stages or DEFAULT_STAGES),
        budget_range=body.budget_range or schema.get("budget_range"),
        remote_pref=body.remote_pref or schema.get("remote_preference"),
        location=body.location or schema.get("location"),
        min_years_exp=body.min_years_exp if body.min_years_exp is not None else schema.get("min_years_experience"),
        seniority=schema.get("seniority_level"),
    )
    session.add(position)
    session.commit()
    session.refresh(position)

    job_id = None
    if body.auto_match:
        job = create_job("scoring")
        _scoring_jobs[position.id] = job.id
        asyncio.create_task(run_matching(job, position.id))
        job_id = job.id

    result = position_to_dict(position)
    result["scoring_job_id"] = job_id
    return result


@router.get("")
def list_positions(status: str | None = None, session: Session = Depends(get_session)):
    query = select(Position)
    if status:
        query = query.where(Position.status == status)
    positions = session.exec(query.order_by(Position.created_at.desc())).all()
    out = []
    for p in positions:
        count = len(session.exec(
            select(PipelineCandidate)
            .where(PipelineCandidate.position_id == p.id)
            .where(PipelineCandidate.status != "excluded")
        ).all())
        out.append(position_to_dict(p, candidate_count=count))
    return out


@router.get("/{position_id}")
def get_position(position_id: str, session: Session = Depends(get_session)):
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    count = len(session.exec(
        select(PipelineCandidate).where(PipelineCandidate.position_id == position_id)
    ).all())
    result = position_to_dict(position, candidate_count=count)
    result["scoring_job_id"] = _scoring_jobs.get(position_id)
    return result


@router.put("/{position_id}")
def update_position(position_id: str, body: PositionUpdate, session: Session = Depends(get_session)):
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    if body.title is not None:
        position.title = body.title
    if body.description is not None:
        position.description = body.description
    if body.stages is not None:
        position.stages = json.dumps(body.stages)
    if body.budget_range is not None:
        position.budget_range = body.budget_range
    if body.remote_pref is not None:
        position.remote_pref = body.remote_pref
    if body.location is not None:
        position.location = body.location
    if body.min_years_exp is not None:
        position.min_years_exp = body.min_years_exp
    if body.extracted_schema is not None:
        position.extracted_schema = json.dumps(body.extracted_schema)
    position.updated_at = utcnow()
    session.add(position)
    session.commit()
    session.refresh(position)
    return position_to_dict(position)


@router.patch("/{position_id}/status")
def update_status(position_id: str, body: StatusUpdate, session: Session = Depends(get_session)):
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status: {body.status}")
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    position.status = body.status
    position.updated_at = utcnow()
    position.closed_at = utcnow() if body.status.startswith("closed") else None
    session.add(position)
    session.commit()
    return position_to_dict(position)


@router.get("/{position_id}/candidates")
def pipeline_candidates(position_id: str, include_excluded: bool = False,
                        session: Session = Depends(get_session)):
    """Ranked pipeline. Excluded candidates (failed an exclusion gate) are hidden unless
    include_excluded=true, so the recruiter sees only potential candidates by default."""
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    rows = session.exec(
        select(PipelineCandidate, Candidate)
        .where(PipelineCandidate.position_id == position_id)
        .where(PipelineCandidate.candidate_id == Candidate.id)
    ).all()
    out = []
    excluded_count = 0
    for pc, c in rows:
        if pc.status == "excluded":
            excluded_count += 1
            if not include_excluded:
                continue
        notes = session.exec(
            select(PipelineNote)
            .where(PipelineNote.pipeline_cand_id == pc.id)
            .order_by(PipelineNote.created_at)
        ).all()
        out.append({
            "pipeline_candidate_id": pc.id,
            "candidate_id": c.id,
            "full_name": c.full_name,
            "current_role": c.current_role,
            "discipline": c.discipline,
            "seniority": c.seniority,
            "years_exp": c.years_exp,
            "remote_pref": c.remote_pref,
            "current_stage": pc.current_stage,
            "fit_score": pc.fit_score,
            "dimension_scores": json.loads(pc.dimension_scores or "[]"),
            "status": pc.status,
            "exclusion_reason": pc.exclusion_reason,
            "recruiter_notes": pc.recruiter_notes,
            "notes": [
                {"id": n.id, "stage": n.stage, "content": n.content,
                 "created_at": n.created_at.isoformat() if n.created_at else None}
                for n in notes
            ],
            "added_at": pc.added_at.isoformat() if pc.added_at else None,
        })
    out.sort(key=lambda x: (x["status"] == "excluded", -(x["fit_score"] or 0)))
    return {"candidates": out, "excluded_count": excluded_count}


@router.post("/{position_id}/candidates")
async def add_candidate(position_id: str, body: AddCandidate, session: Session = Depends(get_session)):
    if session.get(Position, position_id) is None:
        raise HTTPException(404, "Position not found")
    if session.get(Candidate, body.candidate_id) is None:
        raise HTTPException(404, "Candidate not found")
    try:
        pc = await score_single(position_id, body.candidate_id)
    except Exception as exc:
        raise HTTPException(502, f"Scoring failed: {exc}")
    return {
        "pipeline_candidate_id": pc.id,
        "fit_score": pc.fit_score,
        "dimension_scores": json.loads(pc.dimension_scores or "[]"),
        "current_stage": pc.current_stage,
    }


@router.patch("/{position_id}/candidates/{candidate_id}/stage")
def move_stage(position_id: str, candidate_id: str, body: StageMove, session: Session = Depends(get_session)):
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    stages = json.loads(position.stages or "[]")
    if stages and body.stage not in stages:
        raise HTTPException(400, f"Unknown stage: {body.stage}")
    pc = session.exec(
        select(PipelineCandidate).where(
            PipelineCandidate.position_id == position_id,
            PipelineCandidate.candidate_id == candidate_id,
        )
    ).first()
    if pc is None:
        raise HTTPException(404, "Candidate not in this pipeline")
    from_stage = pc.current_stage
    pc.current_stage = body.stage
    pc.updated_at = utcnow()
    session.add(pc)
    session.add(StageHistory(pipeline_cand_id=pc.id, from_stage=from_stage, to_stage=body.stage, note=body.note))
    session.commit()
    return {"ok": True, "from_stage": from_stage, "to_stage": body.stage}


def _get_pipeline_candidate(session: Session, position_id: str, candidate_id: str) -> PipelineCandidate:
    pc = session.exec(
        select(PipelineCandidate).where(
            PipelineCandidate.position_id == position_id,
            PipelineCandidate.candidate_id == candidate_id,
        )
    ).first()
    if pc is None:
        raise HTTPException(404, "Candidate not in this pipeline")
    return pc


@router.post("/{position_id}/candidates/{candidate_id}/notes")
def add_note(position_id: str, candidate_id: str, body: NoteCreate, session: Session = Depends(get_session)):
    if not body.content.strip():
        raise HTTPException(400, "Note content is required")
    pc = _get_pipeline_candidate(session, position_id, candidate_id)
    note = PipelineNote(pipeline_cand_id=pc.id, stage=body.stage, content=body.content.strip())
    session.add(note)
    session.commit()
    session.refresh(note)
    return {
        "id": note.id,
        "stage": note.stage,
        "content": note.content,
        "created_at": note.created_at.isoformat(),
    }


@router.delete("/{position_id}/candidates/{candidate_id}/notes/{note_id}")
def delete_note(position_id: str, candidate_id: str, note_id: str, session: Session = Depends(get_session)):
    pc = _get_pipeline_candidate(session, position_id, candidate_id)
    note = session.get(PipelineNote, note_id)
    if note is None or note.pipeline_cand_id != pc.id:
        raise HTTPException(404, "Note not found")
    session.delete(note)
    session.commit()
    return {"ok": True}


@router.post("/{position_id}/candidates/{candidate_id}/rescore")
async def rescore_candidate(position_id: str, candidate_id: str):
    """Re-run scoring for one candidate, incorporating their interview notes."""
    try:
        pc = await rescore_with_notes(position_id, candidate_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Re-scoring failed: {exc}")
    return {
        "pipeline_candidate_id": pc.id,
        "fit_score": pc.fit_score,
        "dimension_scores": json.loads(pc.dimension_scores or "[]"),
    }


@router.post("/{position_id}/candidates/{candidate_id}/include")
async def include_candidate(position_id: str, candidate_id: str):
    """Override an exclusion: re-include a filtered-out candidate and score them."""
    try:
        pc = await score_single(position_id, candidate_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Scoring failed: {exc}")
    return {
        "pipeline_candidate_id": pc.id,
        "status": pc.status,
        "fit_score": pc.fit_score,
        "dimension_scores": json.loads(pc.dimension_scores or "[]"),
        "current_stage": pc.current_stage,
    }


@router.post("/{position_id}/match")
async def find_new_candidates(position_id: str, session: Session = Depends(get_session)):
    """Re-run matching for an open position, scoring pool candidates not yet in the pipeline."""
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    job = create_job("scoring")
    _scoring_jobs[position_id] = job.id
    asyncio.create_task(run_matching(job, position_id, only_new=True))
    return {"scoring_job_id": job.id}


@router.post("/{position_id}/rematch")
async def rematch_all(position_id: str, session: Session = Depends(get_session)):
    """Re-evaluate the WHOLE pipeline against the current exclusion gates (re-gates existing
    candidates, so newly-classified disciplines downgrade wrong-discipline rows to excluded)."""
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    job = create_job("scoring")
    _scoring_jobs[position_id] = job.id
    asyncio.create_task(run_matching(job, position_id, only_new=False))
    return {"scoring_job_id": job.id}


@router.post("/{position_id}/rescore")
async def rescore_position(position_id: str, session: Session = Depends(get_session)):
    """Re-score every candidate in the pipeline (notes + current dimensions) as a background job."""
    if session.get(Position, position_id) is None:
        raise HTTPException(404, "Position not found")
    job = create_job("scoring")
    _scoring_jobs[position_id] = job.id
    asyncio.create_task(rescore_pipeline(job, position_id))
    return {"scoring_job_id": job.id}


@router.get("/{position_id}/score/progress")
async def scoring_progress(position_id: str):
    job_id = _scoring_jobs.get(position_id)
    job = get_job(job_id) if job_id else None
    if job is None:
        raise HTTPException(404, "No scoring job for this position")

    async def event_generator():
        async for event in job.stream():
            yield {"event": event.get("type", "message"), "data": json.dumps(event)}

    return EventSourceResponse(event_generator())
