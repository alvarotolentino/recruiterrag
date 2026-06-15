import pytest

from app.services.agents import scorer


class FakeLLM:
    def __init__(self, payload):
        self.payload = payload

    async def chat_json(self, messages, retries=2, thinking=False, schema=None):
        return self.payload


@pytest.mark.asyncio
async def test_score_candidate_aggregates_equal_weights():
    llm = FakeLLM({
        "scores": [
            {"dimension": "Rust", "score": 8, "justification": "strong"},
            {"dimension": "Communication", "score": 6, "justification": "ok"},
        ]
    })
    scores, fit, eligible, reason = await scorer.score_candidate(
        "Backend Eng", ["Rust", "Communication"], "cv text", llm=llm)
    assert fit == 7.0
    assert len(scores) == 2
    assert eligible is True
    assert reason is None


@pytest.mark.asyncio
async def test_score_candidate_clamps_out_of_range():
    llm = FakeLLM({"scores": [{"dimension": "Rust", "score": 14}, {"dimension": "Go", "score": 0}]})
    scores, fit, _eligible, _reason = await scorer.score_candidate("X", ["Rust", "Go"], "cv", llm=llm)
    assert scores[0]["score"] == 10.0
    assert scores[1]["score"] == 1.0
    assert fit == 5.5


@pytest.mark.asyncio
async def test_score_candidate_rejects_empty_scores():
    llm = FakeLLM({"scores": []})
    with pytest.raises(ValueError):
        await scorer.score_candidate("X", ["Rust"], "cv", llm=llm)


@pytest.mark.asyncio
async def test_eligibility_gate_excludes_wrong_discipline():
    llm = FakeLLM({"eligible": False, "exclusion_reason": "Data Engineer, not Fullstack.", "scores": []})
    ctx = {
        "discipline": "fullstack",
        "required_skills": ["React"],
        "exclusion_criteria": [
            {"type": "discipline", "rule": {"allowed": ["fullstack", "frontend", "backend"]},
             "severity": "hard", "enabled": True, "label": "Wrong discipline"},
        ],
    }
    scores, fit, eligible, reason = await scorer.score_candidate(
        "Fullstack Engineer", ["React"], "data engineer cv", position_ctx=ctx, llm=llm)
    assert eligible is False
    assert fit is None
    assert scores == []
    assert "Data Engineer" in reason


@pytest.mark.asyncio
async def test_eligibility_gate_scores_when_eligible():
    llm = FakeLLM({"eligible": True, "exclusion_reason": None,
                   "scores": [{"dimension": "React", "score": 9, "justification": "strong"}]})
    ctx = {"discipline": "fullstack", "required_skills": ["React"], "exclusion_criteria": []}
    scores, fit, eligible, reason = await scorer.score_candidate(
        "Fullstack Engineer", ["React"], "fullstack cv", position_ctx=ctx, llm=llm)
    assert eligible is True
    assert fit == 9.0
    assert reason is None
