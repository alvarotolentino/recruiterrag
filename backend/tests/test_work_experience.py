import json
from datetime import datetime, timezone

from app.models import Candidate, PipelineNote
from app.services.matching import candidate_full_text, format_stage_notes, format_work_experience


def _candidate(work):
    return Candidate(full_name="Alice", raw_text="raw resume text",
                     work_experience=json.dumps(work))


def test_format_orders_and_marks_current():
    text = format_work_experience(_candidate([
        {"company": "ScaleCorp", "title": "Staff Engineer", "start_date": "2022",
         "is_current": True, "responsibilities": ["Led platform design"]},
        {"company": "CloudWorks", "title": "Senior Engineer", "start_date": "2019",
         "end_date": "2022", "responsibilities": ["Built gRPC services"]},
    ]))
    assert "Staff Engineer at ScaleCorp (2022 – Present)" in text
    assert "Senior Engineer at CloudWorks (2019 – 2022)" in text
    assert "• Led platform design" in text
    # most-recent role appears before the older one
    assert text.index("ScaleCorp") < text.index("CloudWorks")


def test_empty_history_is_blank():
    assert format_work_experience(_candidate([])) == ""


def test_full_text_prepends_experience():
    text = candidate_full_text(_candidate([
        {"company": "X", "title": "Eng", "responsibilities": ["did things"]},
    ]))
    assert text.index("Professional experience") < text.index("raw resume text")


def _note(stage, content, order=0):
    return PipelineNote(
        pipeline_cand_id="pc1", stage=stage, content=content,
        created_at=datetime(2026, 1, 1, order, tzinfo=timezone.utc),
    )


def test_format_stage_notes_groups_by_stage():
    text = format_stage_notes([
        _note("Screening", "Good comms", 0),
        _note("Technical Interview", "Weak on Raft", 1),
        _note("Screening", "Available immediately", 2),
    ])
    assert "[Screening]" in text
    assert "[Technical Interview]" in text
    assert "- Good comms" in text
    assert "- Weak on Raft" in text


def test_format_stage_notes_empty():
    assert format_stage_notes([]) == ""
