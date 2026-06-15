from app.services.matching import build_scalar_filter


def test_no_constraints():
    assert build_scalar_filter({}) is None


def test_flexible_remote_is_unconstrained():
    assert build_scalar_filter({"remote_preference": "flexible"}) is None


def test_min_years():
    expr = build_scalar_filter({"min_years_experience": 5})
    assert "years_exp >= 5.0" in expr


def test_seniority_accepts_level_and_above():
    expr = build_scalar_filter({"seniority_level": "senior"})
    assert 'seniority == "senior"' in expr
    assert 'seniority == "lead"' in expr
    assert 'seniority == "principal"' in expr
    assert 'seniority == "mid"' not in expr


def test_remote_filter_includes_flexible_candidates():
    expr = build_scalar_filter({"remote_preference": "remote"})
    assert 'remote_pref == "remote"' in expr
    assert 'remote_pref == "flexible"' in expr
