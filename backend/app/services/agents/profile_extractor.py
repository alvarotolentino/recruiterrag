"""LLM structured extraction of candidate profiles (spec §4.1.3)."""
from ...config import settings
from ..llm import get_llm

PROFILE_SCHEMA = """{
  "full_name": "string",
  "email": "string | null",
  "years_of_experience": number,
  "seniority_level": "junior | mid | senior | lead | principal",
  "discipline": "fullstack | frontend | backend | data-engineering | data-science | ml-engineering | devops-sre | mobile | qa | security | product-management | design | other",
  "current_role": "string",
  "tech_stack": ["string"],
  "education": ["string"],
  "languages": ["string"],
  "remote_preference": "remote | hybrid | on-site | flexible",
  "location": "string | null",
  "summary": "string",
  "work_experience": [
    {
      "company": "string",
      "title": "string",
      "start_date": "string | null",   // e.g. "2021", "Mar 2021"
      "end_date": "string | null",      // "Present" if current
      "is_current": boolean,
      "responsibilities": ["string"]
    }
  ]
}"""

SENIORITY = ["junior", "mid", "senior", "lead", "principal"]
REMOTE = ["remote", "hybrid", "on-site", "flexible"]
DISCIPLINES = [
    "fullstack", "frontend", "backend", "data-engineering", "data-science",
    "ml-engineering", "devops-sre", "mobile", "qa", "security",
    "product-management", "design", "other",
]

# JSON Schema passed to Ollama/llama.cpp for constrained decoding — guarantees a
# parseable object with exactly these fields (spec §4.1.3, extended with work history).
PROFILE_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "full_name": {"type": "string"},
        "email": {"type": ["string", "null"]},
        "years_of_experience": {"type": "number"},
        "seniority_level": {"type": "string", "enum": SENIORITY},
        "discipline": {"type": "string", "enum": DISCIPLINES},
        "current_role": {"type": "string"},
        "tech_stack": {"type": "array", "items": {"type": "string"}},
        "education": {"type": "array", "items": {"type": "string"}},
        "languages": {"type": "array", "items": {"type": "string"}},
        "remote_preference": {"type": "string", "enum": REMOTE},
        "location": {"type": ["string", "null"]},
        "summary": {"type": "string"},
        "work_experience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "title": {"type": "string"},
                    "start_date": {"type": ["string", "null"]},
                    "end_date": {"type": ["string", "null"]},
                    "is_current": {"type": "boolean"},
                    "responsibilities": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["company", "title", "responsibilities"],
            },
        },
    },
    "required": ["full_name", "years_of_experience", "seniority_level", "current_role",
                 "tech_stack", "remote_preference", "summary", "work_experience"],
}

SYSTEM_PROMPT = (
    "You are an expert technical recruiter. Extract a structured candidate profile "
    f"from the resume text provided, matching this schema:\n{PROFILE_SCHEMA}\n"
    "Use null for unknown scalar fields and [] for unknown lists. "
    "Estimate years_of_experience and seniority_level from the work history if not stated. "
    "discipline: classify the candidate's PROFESSION from the closed list above based on "
    "current_role, tech_stack and work history (e.g. a Data Engineer -> 'data-engineering', "
    "a Project Manager -> 'product-management', a React+Node engineer -> 'fullstack'). "
    "The summary must be 2-3 sentences capturing the candidate's core strengths.\n"
    "work_experience MUST list every job, ordered most-recent first. For each role capture "
    "the company, job title, start/end dates, whether it is the current job, and 2-5 concise "
    "bullet points describing the key responsibilities and achievements. Do not omit roles."
)


DISCIPLINE_CLASSIFY_PROMPT = (
    "Classify the candidate's PRIMARY profession into exactly one of these values:\n"
    f"{', '.join(DISCIPLINES)}\n"
    "Judge by their job title and the bulk of their career, NOT by overlapping tools. "
    "Examples: 'Data Engineer'/'Big Data Engineer' -> data-engineering; "
    "'Project Manager'/'Product Manager' -> product-management; a React+Node web "
    "developer -> fullstack; 'Frontend Developer' -> frontend; 'Backend Engineer' -> backend; "
    "'DevOps Engineer'/'SRE' -> devops-sre; 'Data Scientist' -> data-science; "
    "'ML Engineer' -> ml-engineering. Respond ONLY with JSON: {\"discipline\": \"<value>\"}."
)

DISCIPLINE_CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {"discipline": {"type": "string", "enum": DISCIPLINES}},
    "required": ["discipline"],
}


async def classify_discipline(current_role: str | None, tech_stack: list[str] | None,
                              summary: str | None) -> str:
    """Cheap single-field classification — used to backfill candidates ingested before
    the discipline field existed."""
    llm = get_llm()
    context = (
        f"Current role: {current_role or 'unknown'}\n"
        f"Tech stack: {', '.join(tech_stack or []) or 'unknown'}\n"
        f"Summary: {summary or ''}"
    )[:settings.LLM_MAX_INPUT_CHARS]
    result = await llm.chat_json(
        [{"role": "system", "content": DISCIPLINE_CLASSIFY_PROMPT},
         {"role": "user", "content": context}],
        schema=DISCIPLINE_CLASSIFY_SCHEMA,
    )
    value = result.get("discipline") if isinstance(result, dict) else None
    return value if value in DISCIPLINES else "other"


async def extract_profile(raw_text: str) -> dict:
    llm = get_llm()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Resume text:\n\n{raw_text[:settings.LLM_MAX_INPUT_CHARS]}"},
    ]
    profile = await llm.chat_json(messages, schema=PROFILE_JSON_SCHEMA)
    if not isinstance(profile, dict) or not profile.get("full_name"):
        raise ValueError("profile extraction returned no full_name")
    return profile
