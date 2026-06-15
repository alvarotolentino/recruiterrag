import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..db import get_session
from ..models import Candidate, PipelineCandidate, Position, StageHistory

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

FINAL_STAGES = {"offer", "hired"}
ACTIVE_STATUSES = {"open", "paused"}
PERIOD_DAYS = {"week": 7, "month": 30, "year": 365}


def _aware(dt: datetime | None) -> datetime | None:
    """Treat naive DB timestamps as UTC so comparisons never raise."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _registration_trend(candidates, since: datetime, now: datetime, period: str) -> list[dict]:
    """Bucketed count of new candidate registrations within the window.

    Daily buckets for week/month (smooth area chart), monthly buckets for year.
    """
    monthly = period == "year"
    buckets: dict[str, int] = {}
    if monthly:
        cursor = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        # Seed the last 12 month buckets so the chart has a stable x-domain.
        seeds = []
        y, m = cursor.year, cursor.month
        for _ in range(12):
            seeds.append(f"{y:04d}-{m:02d}")
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        for key in reversed(seeds):
            buckets[key] = 0
        key_of = lambda d: f"{d.year:04d}-{d.month:02d}"  # noqa: E731
    else:
        days = PERIOD_DAYS[period]
        start = (now - timedelta(days=days - 1)).date()
        for i in range(days):
            buckets[(start + timedelta(days=i)).isoformat()] = 0
        key_of = lambda d: d.date().isoformat()  # noqa: E731

    for c in candidates:
        created = _aware(c.created_at)
        if created and created >= since:
            key = key_of(created)
            if key in buckets:
                buckets[key] += 1
    return [{"bucket": k, "count": v} for k, v in buckets.items()]


@router.get("/metrics")
def metrics(
    session: Session = Depends(get_session),
    period: str = Query("month", pattern="^(week|month|year)$"),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=PERIOD_DAYS[period])

    positions = session.exec(select(Position)).all()
    # Excluded candidates failed an exclusion gate — they are not real pipeline members.
    pcs = session.exec(select(PipelineCandidate).where(PipelineCandidate.status != "excluded")).all()
    candidates = session.exec(select(Candidate)).all()

    open_ids = {p.id for p in positions if p.status == "open"}

    # ---- Pipelines tile: current counts by status + new within the period ----
    def _count_status(status: str) -> int:
        return sum(1 for p in positions if p.status == status)

    def _new_open(status: str) -> int:
        return sum(1 for p in positions if p.status == status and (_aware(p.created_at) or now) >= since)

    def _new_closed(status: str) -> int:
        return sum(
            1 for p in positions
            if p.status == status and (_aware(p.closed_at) or _aware(p.updated_at) or now) >= since
        )

    pipelines = {
        "open": _count_status("open"),
        "paused": _count_status("paused"),
        "filled": _count_status("closed_filled"),
        "cancelled": _count_status("closed_cancelled"),
        "open_new": _new_open("open"),
        "paused_new": _new_open("paused"),
        "filled_new": _new_closed("closed_filled"),
        "cancelled_new": _new_closed("closed_cancelled"),
    }
    status_breakdown = [
        {"status": "open", "count": pipelines["open"]},
        {"status": "paused", "count": pipelines["paused"]},
        {"status": "closed_filled", "count": pipelines["filled"]},
        {"status": "closed_cancelled", "count": pipelines["cancelled"]},
    ]

    # ---- Candidates tile ----
    open_pcs = [pc for pc in pcs if pc.position_id in open_ids]
    unique_in_pipelines = len({pc.candidate_id for pc in pcs})
    new_registered = sum(1 for c in candidates if (_aware(c.created_at) or now) >= since)
    in_play_new = sum(1 for pc in open_pcs if (_aware(pc.added_at) or now) >= since)
    unique_added_period = len({pc.candidate_id for pc in pcs if (_aware(pc.added_at) or now) >= since})

    candidates_tile = {
        "in_play": len(open_pcs),
        "unique": unique_in_pipelines,
        "new_registered": new_registered,
        "in_play_new": in_play_new,
        "unique_new": unique_added_period,
    }

    # ---- Pipeline-stage tile ----
    stage_counts: dict[str, int] = {}
    final_by_position: dict[str, int] = {}
    for pc in open_pcs:
        if pc.current_stage:
            stage_counts[pc.current_stage] = stage_counts.get(pc.current_stage, 0) + 1
        if (pc.current_stage or "").lower() in FINAL_STAGES:
            final_by_position[pc.position_id] = final_by_position.get(pc.position_id, 0) + 1

    final_candidates = sum(final_by_position.values())
    open_in_final = len(final_by_position)
    n_open = len(open_ids) or 1

    advances = session.exec(select(StageHistory)).all()
    moves_period = sum(
        1 for h in advances
        if h.from_stage and (_aware(h.changed_at) or now) >= since
    )

    stage_tile = {
        "final_candidates": final_candidates,
        "open_in_final": open_in_final,
        "final_per_open": round(final_candidates / n_open, 2),
        "moves": moves_period,
        "avg_moves_per_pipeline": round(moves_period / n_open, 2),
    }

    # Order stage_breakdown by canonical pipeline stage sequence.
    # Collect median position-index across all open positions to define funnel order.
    stage_positions: dict[str, list[int]] = {}
    for p in positions:
        if p.status == "open":
            for idx, s in enumerate(json.loads(p.stages or "[]")):
                stage_positions.setdefault(s, []).append(idx)

    def _stage_sort_key(s: str) -> tuple[float, str]:
        idxs = stage_positions.get(s)
        if idxs:
            return (sum(idxs) / len(idxs), s)  # mean — good enough; avoids statistics import
        return (9999.0, s)

    stage_breakdown = [
        {"stage": s, "count": stage_counts[s]}
        for s in sorted(stage_counts.keys(), key=_stage_sort_key)
    ]

    return {
        "period": period,
        "total_positions": len(positions),
        "total_candidates": len(candidates),
        "pipelines": pipelines,
        "candidates": candidates_tile,
        "stage": stage_tile,
        "status_breakdown": status_breakdown,
        "stage_breakdown": stage_breakdown,
        "registration_trend": _registration_trend(candidates, since, now, period),
    }


def _kmeans(x, k: int, iters: int = 30, seed: int = 0):
    """Minimal Lloyd's k-means (numpy). Returns integer labels per row."""
    import numpy as np

    rng = np.random.default_rng(seed)
    centroids = x[rng.choice(len(x), size=k, replace=False)].copy()
    labels = np.zeros(len(x), dtype=int)
    for _ in range(iters):
        dist = ((x[:, None, :] - centroids[None, :, :]) ** 2).sum(-1)
        new_labels = dist.argmin(1)
        if (new_labels == labels).all():
            break
        labels = new_labels
        for j in range(k):
            members = x[labels == j]
            if len(members):
                centroids[j] = members.mean(0)
    return labels


def _cluster_label(skills: list[str], roles: list[str]) -> str:
    """Name a cluster by its most common skill, falling back to a common role word."""
    from collections import Counter

    skill_counts = Counter(s.strip().lower() for s in skills if s.strip())
    if skill_counts:
        top, _ = skill_counts.most_common(1)[0]
        return top.title()
    role_words = Counter(
        w.lower() for r in roles for w in r.split()
        if len(w) > 3 and w.lower() not in {"senior", "junior", "staff", "lead"}
    )
    if role_words:
        return role_words.most_common(1)[0][0].title()
    return "Group"


@router.get("/candidate-map")
def candidate_map(session: Session = Depends(get_session)):
    """2D projection (PCA) of candidate embeddings — nearby points = similar profiles.

    The embedding encodes the whole resume (role, skills, experience), so proximity
    reflects holistic similarity. Points are clustered (k-means) into skill groups and
    enriched with role / years / top skills so the UI can color and size by any of them.
    A practical, interpretable alternative to a trained SOM.
    """
    import json as _json

    import numpy as np

    from ..services import milvus_client

    try:
        rows = milvus_client.get_all_embeddings(limit=2000)
    except Exception:
        return {"points": [], "clusters": [], "note": "Candidate search is not available right now."}
    if len(rows) < 3:
        return {"points": [], "clusters": [], "note": "Add at least 3 candidates to see the map."}

    vectors = np.array([r["embedding"] for r in rows], dtype=np.float32)
    centered = vectors - vectors.mean(axis=0)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    coords = centered @ vt[:2].T  # (n, 2)

    # Cluster on the full embeddings (captures skills/role/experience together).
    k = max(2, min(6, len(rows) // 3))
    labels = _kmeans(vectors, k)

    candidates = {c.id: c for c in session.exec(select(Candidate)).all()}
    pipe_counts: dict[str, int] = {}
    for pc in session.exec(select(PipelineCandidate).where(PipelineCandidate.status != "excluded")).all():
        pipe_counts[pc.candidate_id] = pipe_counts.get(pc.candidate_id, 0) + 1

    def skills_of(c) -> list[str]:
        try:
            return _json.loads(c.tech_stack or "[]") if c else []
        except ValueError:
            return []

    points = []
    cluster_members: dict[int, dict] = {i: {"skills": [], "roles": []} for i in range(k)}
    for r, (x, y), cluster in zip(rows, coords, labels):
        cid = r["id"]
        c = candidates.get(cid)
        years = r.get("years_exp")
        skills = skills_of(c)
        cluster_members[int(cluster)]["skills"].extend(skills)
        if c and c.current_role:
            cluster_members[int(cluster)]["roles"].append(c.current_role)
        points.append({
            "id": cid,
            "name": c.full_name if c else "Unknown",
            "x": round(float(x), 3),
            "y": round(float(y), 3),
            "cluster": int(cluster),
            "role": (c.current_role if c else None),
            "seniority": r.get("seniority") or "unknown",
            "years_exp": round(float(years), 1) if years is not None else None,
            "top_skills": skills[:4],
            "pipelines": int(pipe_counts.get(cid, 0)),
        })

    clusters = [
        {"id": i, "label": _cluster_label(m["skills"], m["roles"]),
         "size": sum(1 for p in points if p["cluster"] == i)}
        for i, m in cluster_members.items()
    ]
    return {"points": points, "clusters": clusters, "note": None}


@router.get("/stage-durations")
def stage_durations(session: Session = Depends(get_session)):
    """Per active (open/paused) pipeline, the average days candidates spend in each stage.

    Drives the "pipeline progress" line chart: x = ordered stages, y = days, one line
    per pipeline. Durations come from StageHistory (time between stage moves); the
    candidate's current stage is still in progress, measured up to now.
    """
    now = datetime.now(timezone.utc)
    positions = [p for p in session.exec(select(Position)).all() if p.status in ACTIVE_STATUSES]

    out = []
    for p in positions:
        stages = json.loads(p.stages or "[]")
        if not stages:
            continue
        pcs = session.exec(
            select(PipelineCandidate)
            .where(PipelineCandidate.position_id == p.id)
            .where(PipelineCandidate.status != "excluded")
        ).all()
        if not pcs:
            continue

        # stage -> list of day-durations, and whether anyone is still sitting there
        durations: dict[str, list[float]] = {s: [] for s in stages}
        in_progress: dict[str, bool] = {s: False for s in stages}

        for pc in pcs:
            history = session.exec(
                select(StageHistory)
                .where(StageHistory.pipeline_cand_id == pc.id)
                .order_by(StageHistory.changed_at)
            ).all()
            # Timeline of (stage, entered_at): seed with the initial stage at added_at.
            entries: list[tuple[str, datetime]] = []
            start = _aware(pc.added_at) or now
            first_stage = history[0].from_stage if history and history[0].from_stage else (
                pc.current_stage if not history else history[0].from_stage
            )
            if first_stage:
                entries.append((first_stage, start))
            for h in history:
                entries.append((h.to_stage, _aware(h.changed_at) or now))

            for i, (stage, entered) in enumerate(entries):
                if i + 1 < len(entries):
                    delta = (entries[i + 1][1] - entered).total_seconds()
                else:
                    delta = (now - entered).total_seconds()  # current stage, still open
                    if stage in in_progress:
                        in_progress[stage] = True
                if stage in durations and delta >= 0:
                    durations[stage].append(delta / 86400.0)

        stage_rows = []
        for s in stages:
            vals = durations[s]
            stage_rows.append({
                "stage": s,
                "avg_days": round(sum(vals) / len(vals), 1) if vals else None,
                "candidates": len(vals),
                "in_progress": in_progress[s],
            })
        out.append({"position_id": p.id, "title": p.title, "stages": stage_rows})
    return out


@router.get("/pipeline-summary")
def pipeline_summary(session: Session = Depends(get_session)):
    positions = session.exec(select(Position)).all()
    out = []
    for p in positions:
        pcs = session.exec(
            select(PipelineCandidate)
            .where(PipelineCandidate.position_id == p.id)
            .where(PipelineCandidate.status != "excluded")
        ).all()
        stages = json.loads(p.stages or "[]")
        stage_counts = {s: 0 for s in stages}
        for pc in pcs:
            if pc.current_stage:
                stage_counts[pc.current_stage] = stage_counts.get(pc.current_stage, 0) + 1
        last_activity = max(
            (pc.updated_at for pc in pcs if pc.updated_at), default=p.updated_at
        )
        out.append({
            "position_id": p.id,
            "title": p.title,
            "status": p.status,
            "candidate_count": len(pcs),
            "stages": [{"stage": s, "count": stage_counts.get(s, 0)} for s in stages],
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "last_activity": last_activity.isoformat() if last_activity else None,
        })
    return out
