"""Candidate ingestion pipeline (spec §4.1.1): extract → LLM profile → embed → store."""
import json
import logging
import uuid
from pathlib import Path

from sqlmodel import Session

from ..config import settings
from ..db import engine
from ..models import Candidate
from . import milvus_client, storage
from .agents.profile_extractor import extract_profile
from .embeddings import embed_text
from .extraction import extract_text
from .jobs import Job

logger = logging.getLogger(__name__)


async def ingest_files(job: Job, files: list[tuple[str, bytes, str]]) -> None:
    """Background ingestion of (filename, data, content_type) tuples. Publishes SSE events."""
    created_ids: list[str] = []
    errors: list[dict] = []

    for index, (filename, data, content_type) in enumerate(files):
        file_label = {"file": filename, "index": index, "total": len(files)}
        try:
            job.publish({**file_label, "type": "step", "step": "upload", "message": f"Uploading {filename}..."})
            object_name = f"{uuid.uuid4()}{Path(filename).suffix.lower()}"
            minio_path = storage.upload_file(settings.BUCKET_CANDIDATE_FILES, object_name, data, content_type)

            job.publish({**file_label, "type": "step", "step": "extract", "message": f"Reading {filename}..."})
            text, used_ocr = extract_text(filename, data)
            if used_ocr:
                job.publish({**file_label, "type": "step", "step": "ocr",
                             "message": "This file looks like a scanned document — using text recognition."})
            if not text.strip():
                raise ValueError("no text could be extracted")

            job.publish({**file_label, "type": "step", "step": "llm", "message": "AI is reading the resume..."})
            profile = await extract_profile(text)

            job.publish({**file_label, "type": "step", "step": "embed", "message": "Indexing candidate..."})
            embedding = await embed_text(text)

            candidate = Candidate(
                full_name=profile.get("full_name", "Unknown"),
                email=profile.get("email"),
                years_exp=profile.get("years_of_experience"),
                seniority=profile.get("seniority_level"),
                discipline=profile.get("discipline"),
                current_role=profile.get("current_role"),
                tech_stack=json.dumps(profile.get("tech_stack") or []),
                education=json.dumps(profile.get("education") or []),
                languages=json.dumps(profile.get("languages") or []),
                work_experience=json.dumps(profile.get("work_experience") or []),
                remote_pref=profile.get("remote_preference"),
                location=profile.get("location"),
                summary=profile.get("summary"),
                raw_text=text,
                file_paths=json.dumps([minio_path]),
                section_sources=json.dumps({
                    "summary": "ai", "work_experience": "ai", "tech_stack": "ai",
                    "current_role": "ai", "years_exp": "ai", "seniority": "ai",
                    "remote_pref": "ai", "location": "ai",
                    "education": "ai", "languages": "ai",
                }),
            )
            with Session(engine) as session:
                session.add(candidate)
                session.commit()
                session.refresh(candidate)

            milvus_client.insert_candidate(
                candidate.id,
                embedding,
                candidate.remote_pref,
                candidate.seniority,
                candidate.years_exp,
                candidate.location,
            )
            created_ids.append(candidate.id)
            job.publish({**file_label, "type": "file_done", "candidate_id": candidate.id,
                         "profile": profile, "message": f"{filename} done"})
        except Exception as exc:  # file is preserved in MinIO even when extraction fails
            logger.exception("ingestion failed for %s", filename)
            # Some exceptions (e.g. httpx.ReadTimeout) stringify to "" — include the
            # type so the UI can map it to a useful message.
            message = str(exc) or exc.__class__.__name__
            errors.append({"file": filename, "error": message})
            job.publish({**file_label, "type": "file_error", "error": message})

    job.finish(
        status="completed" if created_ids or not errors else "failed",
        result={"candidate_ids": created_ids, "errors": errors},
    )
