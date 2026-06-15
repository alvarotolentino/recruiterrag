"""LLM extraction of position schema from a Job Description (spec §4.2.2)."""
from ...config import settings
from ..llm import get_llm

DEFAULT_DIMENSION_TARGET = 7

# Closed taxonomy so candidate discipline and JD discipline can be compared exactly.
DISCIPLINES = [
    "fullstack", "frontend", "backend", "data-engineering", "data-science",
    "ml-engineering", "devops-sre", "mobile", "qa", "security",
    "product-management", "design", "other",
]

EXCLUSION_TYPES = [
    "discipline", "min_years", "seniority_floor", "must_have_skill", "location", "custom",
]

JD_SCHEMA = """{
  "position_title": "string",
  "discipline": "fullstack | frontend | backend | data-engineering | data-science | ml-engineering | devops-sre | mobile | qa | security | product-management | design | other",
  "required_skills": ["string"],
  "nice_to_have_skills": ["string"],
  "seniority_level": "junior | mid | senior | lead | principal",
  "min_years_experience": number,
  "remote_preference": "remote | hybrid | on-site | flexible",
  "location": "string | null",
  "scoring_dimensions": [
    { "name": "string", "description": "string", "weight": 1.0, "target": 7 }
  ],
  "exclusion_criteria": [
    { "id": "string", "label": "string", "type": "discipline | min_years | seniority_floor | must_have_skill | location | custom",
      "rule": {}, "description": "string", "severity": "hard | soft", "source": "ai", "enabled": true }
  ],
  "budget_range": "string | null",
  "team_size": "string | null",
  "key_responsibilities": ["string"]
}"""

SYSTEM_PROMPT = (
    "You are an expert recruiter analyzing a Job Description. Extract a structured "
    f"position schema. Respond ONLY with a valid JSON object matching:\n{JD_SCHEMA}\n"
    "scoring_dimensions must contain between 4 and 8 dimensions that capture what "
    "matters most for success in this role (mix technical and behavioral, e.g. "
    "'Rust Expertise', 'System Design', 'Communication'). All weights are 1.0 in v1.0. "
    "For each dimension set 'target' to the minimum 1-10 score a candidate should reach "
    "for this role: higher (8-9) for must-have core skills, lower (5-6) for nice-to-haves.\n"
    "discipline: classify the ROLE'S profession from the closed list above (a 'Fullstack "
    "Engineer' JD -> 'fullstack'; a 'Data Engineer' JD -> 'data-engineering').\n"
    "exclusion_criteria: derive the hard gates that disqualify a candidate BEFORE scoring, "
    "so only plausible candidates are shown. ALWAYS include a 'discipline' rule whose "
    "rule.allowed lists the professions acceptable for THIS role (e.g. a fullstack role -> "
    '{"allowed": ["fullstack","frontend","backend"]}, which excludes data-engineering, '
    "data-science, product-management, design). Add min_years (rule {\"min\": N}), "
    "seniority_floor (rule {\"floor\": \"mid\"}), must_have_skill (rule {\"skill\": \"React\"}) "
    "and custom (rule {\"text\": \"...\"}) gates only when the JD clearly requires them. "
    "Mark deterministic gates (discipline, min_years, seniority_floor) severity 'hard' and "
    "fuzzy/custom gates 'soft'. Set source 'ai' and enabled true on every gate.\n"
    "Use null for unknown scalar fields and [] for unknown lists."
)


# JSON Schema for constrained decoding (spec §4.2.2).
JD_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "position_title": {"type": "string"},
        "discipline": {"type": "string", "enum": DISCIPLINES},
        "required_skills": {"type": "array", "items": {"type": "string"}},
        "nice_to_have_skills": {"type": "array", "items": {"type": "string"}},
        "seniority_level": {"type": "string", "enum": ["junior", "mid", "senior", "lead", "principal"]},
        "min_years_experience": {"type": "number"},
        "remote_preference": {"type": "string", "enum": ["remote", "hybrid", "on-site", "flexible"]},
        "location": {"type": ["string", "null"]},
        "scoring_dimensions": {
            "type": "array",
            "minItems": 4,
            "maxItems": 8,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "weight": {"type": "number"},
                    "target": {"type": "integer", "minimum": 1, "maximum": 10},
                },
                "required": ["name", "description", "weight", "target"],
            },
        },
        "exclusion_criteria": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "type": {"type": "string", "enum": EXCLUSION_TYPES},
                    "rule": {"type": "object"},
                    "description": {"type": "string"},
                    "severity": {"type": "string", "enum": ["hard", "soft"]},
                    "source": {"type": "string", "enum": ["ai", "recruiter"]},
                    "enabled": {"type": "boolean"},
                },
                "required": ["id", "label", "type", "severity", "enabled"],
            },
        },
        "budget_range": {"type": ["string", "null"]},
        "team_size": {"type": ["string", "null"]},
        "key_responsibilities": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["position_title", "discipline", "required_skills", "seniority_level", "scoring_dimensions"],
}


async def extract_jd(jd_text: str) -> dict:
    llm = get_llm()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Job Description:\n\n{jd_text[:settings.LLM_MAX_INPUT_CHARS]}"},
    ]
    schema = await llm.chat_json(messages, schema=JD_JSON_SCHEMA)
    if not isinstance(schema, dict) or not schema.get("position_title"):
        raise ValueError("JD extraction returned no position_title")
    dims = schema.get("scoring_dimensions") or []
    if not dims:
        raise ValueError("JD extraction returned no scoring_dimensions")
    # Ensure every dimension has a sane expected score (recruiter can edit later).
    for d in dims:
        target = d.get("target")
        if not isinstance(target, (int, float)) or not (1 <= target <= 10):
            d["target"] = DEFAULT_DIMENSION_TARGET
        else:
            d["target"] = int(round(target))
    schema["discipline"] = _normalize_discipline(schema.get("discipline"))
    schema["exclusion_criteria"] = _normalize_exclusions(
        schema.get("exclusion_criteria"), schema["discipline"]
    )
    return schema


def _normalize_discipline(value: object) -> str:
    return value if value in DISCIPLINES else "other"


# Disciplines that share enough surface with each other to never auto-exclude.
_DISCIPLINE_NEIGHBORS = {
    "fullstack": ["fullstack", "frontend", "backend"],
    "frontend": ["frontend", "fullstack"],
    "backend": ["backend", "fullstack"],
    "data-engineering": ["data-engineering", "backend"],
    "data-science": ["data-science", "ml-engineering"],
    "ml-engineering": ["ml-engineering", "data-science", "backend"],
}


def _normalize_exclusions(raw: object, discipline: str) -> list[dict]:
    """Clean LLM output and guarantee a discipline gate exists (the core first-pass filter)."""
    out: list[dict] = []
    seen_types: set[str] = set()
    for c in raw if isinstance(raw, list) else []:
        if not isinstance(c, dict) or c.get("type") not in EXCLUSION_TYPES:
            continue
        c.setdefault("rule", {})
        c.setdefault("source", "ai")
        c["enabled"] = c.get("enabled", True)
        c["severity"] = c.get("severity") if c.get("severity") in ("hard", "soft") else "hard"
        c.setdefault("id", c["type"])
        c.setdefault("label", c["type"].replace("_", " ").title())
        out.append(c)
        seen_types.add(c["type"])
    if "discipline" not in seen_types and discipline != "other":
        allowed = _DISCIPLINE_NEIGHBORS.get(discipline, [discipline])
        out.insert(0, {
            "id": "wrong-discipline",
            "label": "Wrong discipline",
            "type": "discipline",
            "rule": {"allowed": allowed},
            "description": f"Only candidates in {', '.join(allowed)} fit this {discipline} role.",
            "severity": "hard",
            "source": "ai",
            "enabled": True,
        })
    return out
