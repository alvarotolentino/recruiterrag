"""Multi-stage candidate matching pipeline (spec §4.2.3).

Stage 1: Milvus scalar pre-filter (hard constraints from the JD)
Stage 2: Milvus ANN search (top-K by cosine similarity)
Stage 3: LLM scoring agent per candidate, ranked by aggregate fit score
"""
import asyncio
import json
import logging

from sqlmodel import Session, select

from ..config import settings
from ..db import engine
from ..models import Candidate, PipelineCandidate, PipelineNote, Position, StageHistory
from . import milvus_client
from .agents.scorer import score_candidate
from .embeddings import embed_text
from .jobs import Job

logger = logging.getLogger(__name__)

SENIORITY_ORDER = ["junior", "mid", "senior", "lead", "principal"]


def position_context(schema: dict) -> dict:
    """Bundle the JD signals the scorer needs for the eligibility gate."""
    return {
        "discipline": schema.get("discipline"),
        "required_skills": schema.get("required_skills") or [],
        "exclusion_criteria": [
            c for c in (schema.get("exclusion_criteria") or [])
            if isinstance(c, dict) and c.get("enabled", True)
        ],
    }


def _enabled_rule(criteria: list[dict], rule_type: str) -> dict | None:
    for c in criteria:
        if c.get("type") == rule_type and c.get("severity") == "hard":
            return c.get("rule") or {}
    return None


def apply_hard_gates(candidate_ids: list[str], ctx: dict) -> tuple[list[str], list[tuple[str, str]]]:
    """Deterministic first-pass filter on stored candidate fields (free, never relaxed).

    Returns (survivors, excluded) where excluded is [(candidate_id, reason)]. Fail-open:
    a candidate is only excluded when a known field clearly violates a hard rule, so a
    missing/unknown field passes through to the LLM eligibility gate.
    """
    criteria = ctx.get("exclusion_criteria") or []
    disc_rule = _enabled_rule(criteria, "discipline")
    years_rule = _enabled_rule(criteria, "min_years")
    sen_rule = _enabled_rule(criteria, "seniority_floor")
    allowed = set(disc_rule.get("allowed") or []) if disc_rule else None
    min_years = years_rule.get("min") if years_rule else None
    floor = sen_rule.get("floor") if sen_rule else None
    floor_idx = SENIORITY_ORDER.index(floor) if floor in SENIORITY_ORDER else None

    survivors: list[str] = []
    excluded: list[tuple[str, str]] = []
    with Session(engine) as session:
        for cid in candidate_ids:
            cand = session.get(Candidate, cid)
            if cand is None:
                continue
            reason: str | None = None
            if allowed and cand.discipline and cand.discipline not in allowed:
                reason = f"Discipline '{cand.discipline}' is not accepted for this role (needs {', '.join(sorted(allowed))})."
            elif isinstance(min_years, (int, float)) and cand.years_exp is not None and cand.years_exp < min_years:
                reason = f"Has {cand.years_exp:g} years experience, below the {min_years:g}-year minimum."
            elif floor_idx is not None and cand.seniority in SENIORITY_ORDER \
                    and SENIORITY_ORDER.index(cand.seniority) < floor_idx:
                reason = f"Seniority '{cand.seniority}' is below the required '{floor}'."
            if reason:
                excluded.append((cid, reason))
            else:
                survivors.append(cid)
    return survivors, excluded


def build_scalar_filter(schema: dict) -> str | None:
    """Stage 1 — translate JD hard constraints into a Milvus boolean expression."""
    clauses: list[str] = []
    remote = schema.get("remote_preference")
    if remote and remote != "flexible":
        # flexible candidates are acceptable for any position
        clauses.append(f'(remote_pref == "{remote}" or remote_pref == "flexible" or remote_pref == "")')
    min_years = schema.get("min_years_experience")
    if isinstance(min_years, (int, float)) and min_years > 0:
        clauses.append(f"years_exp >= {float(min_years)}")
    seniority = schema.get("seniority_level")
    if seniority in SENIORITY_ORDER:
        # accept stated level and above
        accepted = SENIORITY_ORDER[SENIORITY_ORDER.index(seniority):]
        options = " or ".join(f'seniority == "{level}"' for level in accepted)
        clauses.append(f'({options} or seniority == "")')
    return " and ".join(clauses) if clauses else None


def format_work_experience(candidate: Candidate) -> str:
    """Render the structured work history (most-recent first) for the scoring prompt."""
    try:
        roles = json.loads(candidate.work_experience or "[]")
    except (TypeError, ValueError):
        return ""
    if not roles:
        return ""
    lines = ["Professional experience (most recent first):"]
    for role in roles:
        end = "Present" if role.get("is_current") else (role.get("end_date") or "")
        span = " – ".join(p for p in [role.get("start_date") or "", end] if p)
        header = f"- {role.get('title', '?')} at {role.get('company', '?')}"
        lines.append(f"{header} ({span})" if span else header)
        for item in role.get("responsibilities", []) or []:
            lines.append(f"    • {item}")
    return "\n".join(lines)


def candidate_full_text(candidate: Candidate) -> str:
    parts: list[str] = []
    experience = format_work_experience(candidate)
    if experience:
        parts.append(experience)
    parts.append(candidate.raw_text or "")
    if candidate.recruiter_notes:
        parts.append(f"\nRecruiter notes:\n{candidate.recruiter_notes}")
    return "\n".join(parts)


def store_exclusion(position_id: str, candidate_id: str, first_stage: str,
                    reason: str | None, note: str = "Excluded") -> None:
    """Persist an excluded candidate (status='excluded') so the recruiter can review/override."""
    with Session(engine) as session:
        existing = session.exec(
            select(PipelineCandidate).where(
                PipelineCandidate.position_id == position_id,
                PipelineCandidate.candidate_id == candidate_id,
            )
        ).first()
        if existing is None:
            pc = PipelineCandidate(
                position_id=position_id,
                candidate_id=candidate_id,
                current_stage=first_stage,
                fit_score=None,
                status="excluded",
                exclusion_reason=reason,
            )
            session.add(pc)
            session.flush()
            session.add(StageHistory(pipeline_cand_id=pc.id, from_stage=None,
                                     to_stage=first_stage, note=note))
        else:
            existing.status = "excluded"
            existing.exclusion_reason = reason
        session.commit()


async def run_matching(job: Job, position_id: str, only_new: bool = False) -> None:
    """Background job: match + score candidates for a position.

    only_new=True skips candidates already in the pipeline — used by "Find new
    candidates" to pull freshly-added pool members into an existing open position.
    """
    try:
        with Session(engine) as session:
            position = session.get(Position, position_id)
            if position is None:
                raise ValueError(f"position {position_id} not found")
            schema = json.loads(position.extracted_schema or "{}")
            stages = json.loads(position.stages or "[]")
        first_stage = stages[0] if stages else "New"

        dimensions = [d["name"] for d in schema.get("scoring_dimensions", [])]
        if not dimensions:
            raise ValueError("position has no scoring dimensions")

        # Stage 1 + 2: filtered ANN search
        job.publish({"type": "step", "step": "search", "message": "Finding similar candidates..."})
        jd_text = " ".join(
            filter(None, [
                schema.get("position_title", ""),
                " ".join(schema.get("key_responsibilities") or []),
                " ".join(schema.get("required_skills") or []),
            ])
        ) or (position.description or position.title)
        embedding = await embed_text(jd_text)
        scalar_filter = build_scalar_filter(schema)
        hits = milvus_client.search(embedding, top_k=settings.ANN_TOP_K, scalar_filter=scalar_filter)
        if not hits and scalar_filter:
            # Hard filters may be too strict for a small pool — retry unfiltered
            hits = milvus_client.search(embedding, top_k=settings.ANN_TOP_K)

        candidate_ids = [h["id"] for h in hits]
        if only_new:
            with Session(engine) as session:
                existing_ids = {
                    pc.candidate_id for pc in session.exec(
                        select(PipelineCandidate).where(PipelineCandidate.position_id == position_id)
                    ).all()
                }
            candidate_ids = [cid for cid in candidate_ids if cid not in existing_ids]

        # First-pass filter — deterministic hard gates (discipline / years / seniority).
        # Applied here, not as a Milvus pre-filter, so they survive the unfiltered retry
        # above and so the discipline gate works on stored candidate fields.
        ctx = position_context(schema)
        position_title = schema.get("position_title", position.title)
        survivors, hard_excluded = apply_hard_gates(candidate_ids, ctx)
        for cid, reason in hard_excluded:
            store_exclusion(position_id, cid, first_stage, reason, note="Excluded by hard filter")
            job.publish({"type": "excluded", "candidate_id": cid, "reason": reason})

        job.publish({"type": "matched", "count": len(survivors), "excluded": len(hard_excluded)})
        if not survivors:
            job.finish(result={"scored": 0, "excluded": len(hard_excluded)})
            return

        # Stage 2.5 + 3: LLM eligibility gate folded into scoring (bounded concurrency).
        semaphore = asyncio.Semaphore(settings.SCORING_CONCURRENCY)
        done_count = 0
        gate_excluded = 0

        async def score_one(cid: str):
            nonlocal done_count, gate_excluded
            async with semaphore:
                with Session(engine) as session:
                    candidate = session.get(Candidate, cid)
                if candidate is None:
                    return
                try:
                    scores, fit, eligible, reason = await score_candidate(
                        position_title,
                        dimensions,
                        candidate_full_text(candidate),
                        position_ctx=ctx,
                    )
                except Exception as exc:
                    logger.exception("scoring failed for candidate %s", cid)
                    job.publish({"type": "score_error", "candidate_id": cid, "error": str(exc)})
                    return
                if not eligible:
                    store_exclusion(position_id, cid, first_stage, reason, note="Excluded by eligibility gate")
                    gate_excluded += 1
                    job.publish({"type": "excluded", "candidate_id": cid,
                                 "candidate_name": candidate.full_name, "reason": reason})
                    return
                with Session(engine) as session:
                    existing = session.exec(
                        select(PipelineCandidate).where(
                            PipelineCandidate.position_id == position_id,
                            PipelineCandidate.candidate_id == cid,
                        )
                    ).first()
                    if existing is None:
                        pc = PipelineCandidate(
                            position_id=position_id,
                            candidate_id=cid,
                            current_stage=first_stage,
                            fit_score=fit,
                            dimension_scores=json.dumps(scores),
                        )
                        session.add(pc)
                        session.flush()
                        session.add(StageHistory(pipeline_cand_id=pc.id, from_stage=None, to_stage=first_stage,
                                                 note="Added by automatic matching"))
                    else:
                        existing.fit_score = fit
                        existing.dimension_scores = json.dumps(scores)
                        existing.status = "eligible"
                        existing.exclusion_reason = None
                    session.commit()
                done_count += 1
                job.publish({
                    "type": "scored",
                    "candidate_id": cid,
                    "candidate_name": candidate.full_name,
                    "fit_score": fit,
                    "done": done_count,
                    "total": len(survivors),
                    "message": f"Scoring candidates: {done_count} / {len(survivors)}",
                })

        await asyncio.gather(*(score_one(cid) for cid in survivors))
        job.finish(result={"scored": done_count, "excluded": len(hard_excluded) + gate_excluded})
    except Exception as exc:
        logger.exception("matching job failed for position %s", position_id)
        job.publish({"type": "error", "error": str(exc)})
        job.finish(status="failed")


async def score_single(position_id: str, candidate_id: str) -> PipelineCandidate:
    """Score one candidate against a position (manual add to pipeline)."""
    with Session(engine) as session:
        position = session.get(Position, position_id)
        candidate = session.get(Candidate, candidate_id)
        if position is None or candidate is None:
            raise ValueError("position or candidate not found")
        schema = json.loads(position.extracted_schema or "{}")
        stages = json.loads(position.stages or "[]")
    dimensions = [d["name"] for d in schema.get("scoring_dimensions", [])]
    first_stage = stages[0] if stages else "New"

    # Manual add = explicit recruiter intent; skip the eligibility gate (no position_ctx).
    scores, fit, _eligible, _reason = await score_candidate(
        schema.get("position_title", position.title),
        dimensions or ["Overall Fit"],
        candidate_full_text(candidate),
    )
    with Session(engine) as session:
        existing = session.exec(
            select(PipelineCandidate).where(
                PipelineCandidate.position_id == position_id,
                PipelineCandidate.candidate_id == candidate_id,
            )
        ).first()
        if existing is None:
            pc = PipelineCandidate(
                position_id=position_id,
                candidate_id=candidate_id,
                current_stage=first_stage,
                fit_score=fit,
                dimension_scores=json.dumps(scores),
            )
            session.add(pc)
            session.flush()
            session.add(StageHistory(pipeline_cand_id=pc.id, from_stage=None, to_stage=first_stage,
                                     note="Added manually"))
        else:
            pc = existing
            pc.status = "eligible"
            pc.exclusion_reason = None
            pc.fit_score = fit
            pc.dimension_scores = json.dumps(scores)
        session.commit()
        session.refresh(pc)
        return pc


def format_stage_notes(notes: list[PipelineNote]) -> str:
    """Group interview/screening notes by stage for the scoring prompt."""
    if not notes:
        return ""
    by_stage: dict[str, list[str]] = {}
    for n in sorted(notes, key=lambda n: n.created_at or 0):
        by_stage.setdefault(n.stage, []).append(n.content)
    lines = ["Interview & screening notes (by pipeline stage):"]
    for stage, items in by_stage.items():
        lines.append(f"[{stage}]")
        for item in items:
            lines.append(f"  - {item}")
    return "\n".join(lines)


async def rescore_with_notes(position_id: str, candidate_id: str) -> PipelineCandidate:
    """Re-run scoring for a candidate, folding in stage-tagged interview notes."""
    with Session(engine) as session:
        position = session.get(Position, position_id)
        candidate = session.get(Candidate, candidate_id)
        if position is None or candidate is None:
            raise ValueError("position or candidate not found")
        pc = session.exec(
            select(PipelineCandidate).where(
                PipelineCandidate.position_id == position_id,
                PipelineCandidate.candidate_id == candidate_id,
            )
        ).first()
        if pc is None:
            raise ValueError("candidate is not in this pipeline")
        schema = json.loads(position.extracted_schema or "{}")
        notes = session.exec(
            select(PipelineNote).where(PipelineNote.pipeline_cand_id == pc.id)
        ).all()
        pc_id = pc.id

    dimensions = [d["name"] for d in schema.get("scoring_dimensions", [])] or ["Overall Fit"]
    text = candidate_full_text(candidate)
    stage_notes = format_stage_notes(notes)
    if stage_notes:
        text = f"{stage_notes}\n\n{text}"

    scores, fit, _eligible, _reason = await score_candidate(
        schema.get("position_title", position.title), dimensions, text,
    )

    with Session(engine) as session:
        pc = session.get(PipelineCandidate, pc_id)
        previous = pc.fit_score
        pc.fit_score = fit
        pc.dimension_scores = json.dumps(scores)
        session.add(pc)
        session.commit()
        session.refresh(pc)
    logger.info("rescored candidate %s on position %s: %s -> %s", candidate_id, position_id, previous, fit)
    return pc


async def rescore_pipeline(job: Job, position_id: str) -> None:
    """Background job: re-score every candidate already in a pipeline (notes + current dimensions)."""
    try:
        with Session(engine) as session:
            position = session.get(Position, position_id)
            if position is None:
                raise ValueError(f"position {position_id} not found")
            rows = session.exec(
                select(PipelineCandidate).where(PipelineCandidate.position_id == position_id)
            ).all()
            candidate_ids = [pc.candidate_id for pc in rows]

        total = len(candidate_ids)
        job.publish({"type": "matched", "count": total})
        if total == 0:
            job.finish(result={"scored": 0})
            return

        semaphore = asyncio.Semaphore(settings.SCORING_CONCURRENCY)
        done = 0

        async def one(cid: str):
            nonlocal done
            async with semaphore:
                try:
                    pc = await rescore_with_notes(position_id, cid)
                except Exception as exc:
                    logger.exception("re-score failed for candidate %s", cid)
                    job.publish({"type": "score_error", "candidate_id": cid, "error": str(exc)})
                    return
                done += 1
                job.publish({
                    "type": "scored",
                    "candidate_id": cid,
                    "fit_score": pc.fit_score,
                    "done": done,
                    "total": total,
                    "message": f"Re-scoring candidates: {done} / {total}",
                })

        await asyncio.gather(*(one(cid) for cid in candidate_ids))
        job.finish(result={"scored": done})
    except Exception as exc:
        logger.exception("rescore pipeline failed for position %s", position_id)
        job.publish({"type": "error", "error": str(exc)})
        job.finish(status="failed")
