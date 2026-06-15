"""Scoring agent — judges a candidate against a position's dimensions (spec §4.1.4).

When a position context with exclusion criteria is supplied, the agent first runs an
ELIGIBILITY gate: a candidate from the wrong profession (e.g. a Data Engineer or
Project Manager for a Fullstack role) is marked ineligible and dimension scoring is
skipped. This is the AI-driven first-pass filter — it reads the resume text directly,
so it works even for candidates whose stored `discipline` is unknown.
"""
from ...config import settings
from ..llm import get_llm

SCORE_INSTRUCTIONS = """For each dimension listed, assign a score from 1 to 10 and provide a 1-sentence justification.
Weigh the candidate's professional experience heavily: the companies they worked at, how long,
the seniority of each role, and whether their actual responsibilities match what this position
requires. Recent, directly-relevant experience counts more than older or tangential work.
Cite a specific role, company, or responsibility in each justification where possible."""

PROMPT_TEMPLATE = """You are an expert recruiter evaluating a candidate for a specific role.

Job Position: {position_title}
Scoring Dimensions: {dimensions}

Candidate Profile:
{candidate_full_text}

{instructions}
Respond ONLY in JSON format:
{{
  "scores": [
    {{ "dimension": "...", "score": 8, "justification": "..." }}
  ]
}}"""

GATED_PROMPT_TEMPLATE = """You are an expert recruiter evaluating a candidate for a specific role.

Job Position: {position_title}
Target discipline (profession this role belongs to): {discipline}
Acceptable disciplines for this role: {allowed_disciplines}
Required skills: {required_skills}
Hard exclusion rules — if ANY clearly applies, the candidate is NOT eligible:
{exclusion_list}

Candidate Profile:
{candidate_full_text}

STEP 1 — ELIGIBILITY. Identify the candidate's PRIMARY profession from their current
title and the bulk of their work history, then check it against the acceptable
disciplines above. Judge by their actual job role, NOT by overlapping tools or skills.
Many professions share technologies (SQL, Python, AWS, Git) — shared tools do NOT make
someone eligible.

A candidate whose primary profession is outside the acceptable disciplines is NOT
eligible. Examples for a Fullstack role (acceptable: fullstack/frontend/backend):
- Data Engineer / Big Data Engineer / Lead Data Engineer -> data-engineering -> NOT eligible
- Data Scientist / ML Engineer -> NOT eligible
- Project Manager / Product Manager -> NOT eligible
- DevOps / SRE, QA, Designer, Security -> NOT eligible
Only a candidate whose core career is building web applications (frontend + backend) is
eligible for a Fullstack role. Be strict: when the title clearly names a different
profession, exclude them even if some projects touch web tech.

If NOT eligible: set "eligible" false, give a one-sentence "exclusion_reason" stating the
candidate's profession and why it does not match, and return "scores": [].

STEP 2 — Only if eligible: {instructions}

Respond ONLY in JSON format:
{{
  "eligible": true,
  "exclusion_reason": null,
  "scores": [
    {{ "dimension": "...", "score": 8, "justification": "..." }}
  ]
}}"""


def _format_exclusions(criteria: list[dict]) -> str:
    lines: list[str] = []
    for c in criteria or []:
        if not isinstance(c, dict) or not c.get("enabled", True):
            continue
        label = c.get("label") or c.get("type") or "rule"
        desc = c.get("description") or _rule_text(c)
        lines.append(f"- {label}: {desc}")
    return "\n".join(lines) if lines else "- (none beyond the target discipline)"


def _rule_text(c: dict) -> str:
    rule = c.get("rule") or {}
    t = c.get("type")
    if t == "discipline":
        return f"only disciplines {rule.get('allowed')} are acceptable"
    if t == "min_years":
        return f"requires at least {rule.get('min')} years of experience"
    if t == "seniority_floor":
        return f"requires seniority of at least {rule.get('floor')}"
    if t == "must_have_skill":
        return f"requires the skill: {rule.get('skill')}"
    if t == "custom":
        return str(rule.get("text") or "")
    return ""


async def score_candidate(
    position_title: str,
    dimensions: list[str],
    candidate_full_text: str,
    position_ctx: dict | None = None,
    llm=None,
) -> tuple[list[dict], float | None, bool, str | None]:
    """Returns (dimension_scores, aggregate_fit_score, eligible, exclusion_reason).

    Equal dimension weights in v1.0. When position_ctx is provided the eligibility gate
    runs first; an ineligible candidate returns ([], None, False, reason) without scoring.
    Pass an explicit LLMClient to score against a specific backend (A/B comparison).
    """
    llm = llm or get_llm()
    text = candidate_full_text[:settings.LLM_MAX_INPUT_CHARS]
    gated = bool(position_ctx)

    if gated:
        rule = next(
            (c.get("rule", {}) for c in (position_ctx.get("exclusion_criteria") or [])
             if isinstance(c, dict) and c.get("type") == "discipline"),
            {},
        )
        prompt = GATED_PROMPT_TEMPLATE.format(
            position_title=position_title,
            discipline=position_ctx.get("discipline") or "unspecified",
            allowed_disciplines=", ".join(rule.get("allowed") or []) or "any engineering discipline",
            required_skills=", ".join(position_ctx.get("required_skills") or []) or "—",
            exclusion_list=_format_exclusions(position_ctx.get("exclusion_criteria")),
            candidate_full_text=text,
            instructions=SCORE_INSTRUCTIONS,
        )
        score_schema = {
            "type": "object",
            "properties": {
                "eligible": {"type": "boolean"},
                "exclusion_reason": {"type": ["string", "null"]},
                "scores": _SCORES_SCHEMA,
            },
            "required": ["eligible", "scores"],
        }
    else:
        prompt = PROMPT_TEMPLATE.format(
            position_title=position_title,
            dimensions=", ".join(dimensions),
            candidate_full_text=text,
            instructions=SCORE_INSTRUCTIONS,
        )
        score_schema = {"type": "object", "properties": {"scores": _SCORES_SCHEMA}, "required": ["scores"]}

    result = await llm.chat_json([{"role": "user", "content": prompt}], schema=score_schema)

    if gated and result.get("eligible") is False:
        reason = result.get("exclusion_reason") or "Does not match the target discipline for this role."
        return [], None, False, str(reason)

    scores = result.get("scores") or []
    valid = [s for s in scores if isinstance(s.get("score"), (int, float))]
    if not valid:
        raise ValueError("scoring agent returned no valid scores")
    for s in valid:
        s["score"] = max(1.0, min(10.0, float(s["score"])))
    fit_score = round(sum(s["score"] for s in valid) / len(valid), 2)
    return valid, fit_score, True, None


_SCORES_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "dimension": {"type": "string"},
            "score": {"type": "integer", "minimum": 1, "maximum": 10},
            "justification": {"type": "string"},
        },
        "required": ["dimension", "score", "justification"],
    },
}
