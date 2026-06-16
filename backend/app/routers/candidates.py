import asyncio
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, delete, select
from sse_starlette.sse import EventSourceResponse

from ..config import settings
from ..db import get_session
from ..models import (
    Candidate,
    PipelineCandidate,
    PipelineNote,
    Position,
    StageHistory,
    TrainingTag,
    utcnow,
)
from ..services import milvus_client, storage
from ..services.extraction import SUPPORTED_EXTENSIONS, extract_text
from ..services.ingestion import ingest_files
from ..services.jobs import create_job, get_job

router = APIRouter(prefix="/candidates", tags=["candidates"])

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


class NotesUpdate(BaseModel):
    notes: str


class CandidateUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    years_exp: float | None = None
    seniority: str | None = None
    current_role: str | None = None
    tech_stack: list[str] | None = None
    education: list[str] | None = None
    languages: list[str] | None = None
    work_experience: list[dict] | None = None
    remote_pref: str | None = None
    location: str | None = None
    summary: str | None = None


def candidate_to_dict(c: Candidate) -> dict:
    return {
        "id": c.id,
        "full_name": c.full_name,
        "email": c.email,
        "years_exp": c.years_exp,
        "seniority": c.seniority,
        "discipline": c.discipline,
        "current_role": c.current_role,
        "tech_stack": json.loads(c.tech_stack or "[]"),
        "education": json.loads(c.education or "[]"),
        "languages": json.loads(c.languages or "[]"),
        "work_experience": json.loads(c.work_experience or "[]"),
        "remote_pref": c.remote_pref,
        "location": c.location,
        "summary": c.summary,
        "recruiter_notes": c.recruiter_notes,
        "file_paths": json.loads(c.file_paths or "[]"),
        "section_sources": json.loads(c.section_sources or "{}"),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.post("/backfill-discipline")
async def backfill_discipline(force: bool = False):
    """Classify discipline for candidates ingested before the field existed.

    Without it the deterministic discipline gate fails open (null discipline passes
    through). force=true reclassifies everyone, otherwise only candidates missing it.
    """
    from ..db import engine
    from ..services.agents.profile_extractor import classify_discipline

    with Session(engine) as session:
        candidates = session.exec(select(Candidate)).all()
        targets = [c for c in candidates if force or not c.discipline]

    updated = 0
    for c in targets:
        try:
            disc = await classify_discipline(
                c.current_role, json.loads(c.tech_stack or "[]"), c.summary
            )
        except Exception:
            continue
        with Session(engine) as session:
            row = session.get(Candidate, c.id)
            if row is not None:
                row.discipline = disc
                row.updated_at = utcnow()
                session.add(row)
                session.commit()
        updated += 1
    return {"classified": updated, "total": len(targets)}


@router.post("/ingest")
async def ingest(files: list[UploadFile]):
    if not files:
        raise HTTPException(400, "No files provided")
    payload: list[tuple[str, bytes, str]] = []
    for f in files:
        name = f.filename or "upload"
        ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(400, f"Unsupported file type: {name}")
        data = await f.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(400, f"File too large (max 25 MB): {name}")
        payload.append((name, data, f.content_type or "application/octet-stream"))

    job = create_job("ingestion")
    asyncio.create_task(ingest_files(job, payload))
    return {"job_id": job.id, "files": len(payload)}


@router.get("/ingest/{job_id}/progress")
async def ingest_progress(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")

    async def event_generator():
        async for event in job.stream():
            yield {"event": event.get("type", "message"), "data": json.dumps(event)}

    return EventSourceResponse(event_generator())


@router.get("")
def list_candidates(
    seniority: str | None = None,
    remote_pref: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
):
    query = select(Candidate)
    if seniority:
        query = query.where(Candidate.seniority == seniority)
    if remote_pref:
        query = query.where(Candidate.remote_pref == remote_pref)
    candidates = session.exec(query.order_by(Candidate.created_at.desc())).all()
    if search:
        needle = search.lower()
        candidates = [
            c for c in candidates
            if needle in c.full_name.lower()
            or needle in (c.current_role or "").lower()
            or needle in (c.tech_stack or "").lower()
        ]
    return [candidate_to_dict(c) for c in candidates]


@router.get("/{candidate_id}")
def get_candidate(candidate_id: str, session: Session = Depends(get_session)):
    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    result = candidate_to_dict(candidate)

    # All positions this candidate was scored against + stage history
    pipeline_rows = session.exec(
        select(PipelineCandidate, Position)
        .where(PipelineCandidate.candidate_id == candidate_id)
        .where(PipelineCandidate.position_id == Position.id)
    ).all()
    positions = []
    for pc, pos in pipeline_rows:
        history = session.exec(
            select(StageHistory)
            .where(StageHistory.pipeline_cand_id == pc.id)
            .order_by(StageHistory.changed_at)
        ).all()
        positions.append({
            "position_id": pos.id,
            "position_title": pos.title,
            "position_status": pos.status,
            "current_stage": pc.current_stage,
            "fit_score": pc.fit_score,
            "dimension_scores": json.loads(pc.dimension_scores or "[]"),
            "stage_history": [
                {"from_stage": h.from_stage, "to_stage": h.to_stage,
                 "changed_at": h.changed_at.isoformat(), "note": h.note}
                for h in history
            ],
        })
    result["positions"] = positions
    return result


@router.put("/{candidate_id}")
async def update_candidate(candidate_id: str, body: CandidateUpdate, session: Session = Depends(get_session)):
    """Manual profile corrections after extraction review (spec §10.1 step 4)."""
    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    SECTION_FIELD_MAP = {
        "summary": "summary", "tech_stack": "tech_stack", "work_experience": "work_experience",
        "current_role": "current_role", "years_exp": "years_exp", "seniority": "seniority",
        "remote_pref": "remote_pref", "location": "location",
        "education": "education", "languages": "languages",
    }
    sources = json.loads(candidate.section_sources or "{}")
    for field in ("full_name", "email", "years_exp", "seniority", "current_role",
                  "remote_pref", "location", "summary"):
        value = getattr(body, field)
        if value is not None:
            setattr(candidate, field, value)
    for field in ("tech_stack", "education", "languages", "work_experience"):
        value = getattr(body, field)
        if value is not None:
            setattr(candidate, field, json.dumps(value))
    for section, db_field in SECTION_FIELD_MAP.items():
        if getattr(body, db_field, None) is not None:
            sources[section] = "recruiter"
    candidate.section_sources = json.dumps(sources)
    candidate.updated_at = utcnow()
    session.add(candidate)
    session.commit()
    session.refresh(candidate)

    # Keep Milvus scalar filter fields in sync (needs re-upsert with the embedding)
    if candidate.raw_text:
        try:
            from ..services.embeddings import embed_text

            embedding = await embed_text(candidate.raw_text)
            milvus_client.insert_candidate(
                candidate.id, embedding, candidate.remote_pref,
                candidate.seniority, candidate.years_exp, candidate.location,
            )
        except Exception:
            pass  # search metadata refresh is best-effort; SQLite is source of truth
    return candidate_to_dict(candidate)


@router.put("/{candidate_id}/notes")
def update_notes(candidate_id: str, body: NotesUpdate, session: Session = Depends(get_session)):
    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    candidate.recruiter_notes = body.notes
    candidate.updated_at = utcnow()
    session.add(candidate)
    session.commit()
    return {"ok": True}


@router.post("/{candidate_id}/reprocess")
async def reprocess_resume(
    candidate_id: str,
    file: UploadFile,
    session: Session = Depends(get_session),
):
    """Replace AI-extracted sections from a new resume; preserve recruiter-edited sections."""
    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")

    filename = file.filename or "resume"
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {filename}")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 25 MB)")

    object_name = f"{uuid.uuid4()}{ext}"
    minio_path = storage.upload_file(
        settings.BUCKET_CANDIDATE_FILES, object_name, data,
        file.content_type or "application/octet-stream",
    )

    text, _ = extract_text(filename, data)
    if not text.strip():
        raise HTTPException(422, "No text could be extracted from this file")

    from ..services.agents.profile_extractor import extract_profile
    profile = await extract_profile(text)

    SECTION_MAP = {
        "summary":          ("summary",        profile.get("summary")),
        "work_experience":  ("work_experience", json.dumps(profile.get("work_experience") or [])),
        "tech_stack":       ("tech_stack",      json.dumps(profile.get("tech_stack") or [])),
        "current_role":     ("current_role",    profile.get("current_role")),
        "years_exp":        ("years_exp",       profile.get("years_of_experience")),
        "seniority":        ("seniority",       profile.get("seniority_level")),
        "remote_pref":      ("remote_pref",     profile.get("remote_preference")),
        "location":         ("location",        profile.get("location")),
        "education":        ("education",       json.dumps(profile.get("education") or [])),
        "languages":        ("languages",       json.dumps(profile.get("languages") or [])),
    }

    sources = json.loads(candidate.section_sources or "{}")
    conflicts = []

    for section, (field, new_value) in SECTION_MAP.items():
        if sources.get(section) == "recruiter":
            conflicts.append({
                "section": section,
                "current_value": getattr(candidate, field) or "",
                "new_value": new_value or "",
            })
        else:
            if new_value is not None:
                setattr(candidate, field, new_value)
            sources[section] = "ai"

    candidate.raw_text = text
    paths = json.loads(candidate.file_paths or "[]")
    paths.append(minio_path)
    candidate.file_paths = json.dumps(paths)
    candidate.section_sources = json.dumps(sources)
    candidate.updated_at = utcnow()
    session.add(candidate)
    session.commit()
    session.refresh(candidate)

    try:
        from ..services.embeddings import embed_text
        embedding = await embed_text(text)
        milvus_client.insert_candidate(
            candidate.id, embedding, candidate.remote_pref,
            candidate.seniority, candidate.years_exp, candidate.location,
        )
    except Exception:
        pass

    return {"candidate": candidate_to_dict(candidate), "conflicts": conflicts}


@router.delete("/{candidate_id}")
def delete_candidate(candidate_id: str, session: Session = Depends(get_session)):
    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    # Delete children before parents in explicit FK order. Bulk delete() statements
    # are emitted in the order written, unlike ORM session.delete() which the unit of
    # work may reorder (no relationship() is declared to teach it the dependency).
    pc_ids = session.exec(select(PipelineCandidate.id).where(PipelineCandidate.candidate_id == candidate_id)).all()
    if pc_ids:
        session.exec(delete(StageHistory).where(StageHistory.pipeline_cand_id.in_(pc_ids)))
        session.exec(delete(PipelineNote).where(PipelineNote.pipeline_cand_id.in_(pc_ids)))
    session.exec(delete(PipelineCandidate).where(PipelineCandidate.candidate_id == candidate_id))
    session.exec(delete(TrainingTag).where(TrainingTag.candidate_id == candidate_id))
    session.exec(delete(Candidate).where(Candidate.id == candidate_id))
    session.commit()
    try:
        milvus_client.delete_candidate(candidate_id)
    except Exception:
        pass  # vector cleanup is best-effort; SQLite is source of truth
    return {"ok": True}
