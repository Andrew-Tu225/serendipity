from datetime import date

import pytest

from app.models.domain import Category, Experience, TasteProfile, Verdict
from app.recommend.config import SIMILAR_K, SIMILAR_MIN
from app.recommend.taste import (
    SimilarUser,
    apply_log,
    empty_profile,
    is_liked,
    log_value,
    similar_users,
    taste_sim,
    vectors_from_rows,
)

TRAIL, CAFE, MUSEUM = Category.TRAIL, Category.CAFE, Category.MUSEUM


def make_log(place_id="p_1", rating=3.0, verdict=Verdict.NEUTRAL, log_id="e_1") -> Experience:
    return Experience(
        id=log_id,
        user_id="u_1",
        place_id=place_id,
        rating=rating,
        verdict=verdict,
        visited_on=date(2026, 10, 1),
    )


def profile(**scores: float) -> dict[Category, float]:
    return {**empty_profile(), **{Category(k): v for k, v in scores.items()}}


# Doc section 2.2 example
VIEWER = profile(trail=3.0, cafe=1.5, restaurant=-0.5)
KAI = profile(trail=2.0, cafe=1.0, museum=0.5)
SAM = profile(restaurant=4.0)


@pytest.mark.parametrize(("verdict", "expected"), [(Verdict.RECOMMEND, 1.0), (Verdict.AVOID, -1.0)])
def test_log_value_uses_verdict_over_rating(verdict, expected):
    assert log_value(make_log(rating=3.0, verdict=verdict)) == expected


@pytest.mark.parametrize(("rating", "expected"), [(5.0, 1.0), (4.0, 0.5), (3.0, 0.0), (1.0, -1.0)])
def test_log_value_maps_neutral_rating_to_minus_one_to_one(rating, expected):
    assert log_value(make_log(rating=rating)) == expected


@pytest.mark.parametrize(("rating", "expected"), [(3.5, True), (3.0, False), (2.0, False)])
def test_is_liked_only_when_value_positive(rating, expected):
    assert is_liked(make_log(rating=rating)) is expected


def test_empty_profile_has_every_category_at_zero():
    assert empty_profile() == {category: 0.0 for category in Category}


def test_apply_log_adds_log_value_to_its_category():
    after = apply_log(profile(cafe=1.5), make_log(verdict=Verdict.RECOMMEND), CAFE)

    assert after == profile(cafe=2.5)


def test_apply_log_negative_log_lowers_category():
    after = apply_log(profile(cafe=1.5), make_log(verdict=Verdict.AVOID), CAFE)

    assert after[CAFE] == 0.5


def test_apply_log_does_not_mutate_input():
    before = profile(cafe=1.5)

    apply_log(before, make_log(verdict=Verdict.RECOMMEND), CAFE)

    assert before[CAFE] == 1.5


def test_apply_log_accumulates_over_several_logs():
    logs = [
        (make_log("p_1", verdict=Verdict.RECOMMEND), TRAIL),
        (make_log("p_2", rating=4.0), TRAIL),
        (make_log("p_3", verdict=Verdict.AVOID), CAFE),
        (make_log("p_1", rating=5.0), TRAIL),
    ]

    result = empty_profile()
    for log, category in logs:
        result = apply_log(result, log, category)

    assert result == profile(trail=2.5, cafe=-1.0)


def test_vectors_from_rows_groups_by_user_and_fills_missing_categories():
    rows = [
        TasteProfile(user_id="u_1", category=CAFE, score=2.0),
        TasteProfile(user_id="u_1", category=TRAIL, score=-1.0),
        TasteProfile(user_id="u_2", category=MUSEUM, score=0.5),
    ]

    vectors = vectors_from_rows(rows)

    assert vectors == {"u_1": profile(cafe=2.0, trail=-1.0), "u_2": profile(museum=0.5)}


def test_taste_sim_identical_profiles_is_one():
    assert taste_sim(VIEWER, VIEWER) == pytest.approx(1.0)


def test_taste_sim_ignores_magnitude():
    tripled = {k: v * 3 for k, v in KAI.items()}

    assert taste_sim(KAI, tripled) == pytest.approx(1.0)


def test_taste_sim_disjoint_profiles_is_zero():
    assert taste_sim(profile(cafe=1.0), profile(trail=1.0)) == 0.0


def test_taste_sim_clamps_opposite_profiles_to_zero():
    assert taste_sim(profile(cafe=1.0), profile(cafe=-1.0)) == 0.0


def test_taste_sim_zero_vector_is_zero():
    assert taste_sim(empty_profile(), VIEWER) == 0.0


def test_taste_sim_doc_example():
    assert taste_sim(VIEWER, KAI) == pytest.approx(0.965, abs=1e-3)
    assert taste_sim(VIEWER, SAM) == 0.0


def test_similar_users_excludes_viewer_and_followees():
    vectors = {"viewer": VIEWER, "kai": KAI, "kai_twin": KAI, "sam": SAM}

    result = similar_users("viewer", frozenset({"kai_twin"}), vectors)

    assert [s.user_id for s in result] == ["kai"]


def test_similar_users_applies_minimum_similarity():
    weak = profile(trail=0.1, museum=3.0)
    assert taste_sim(VIEWER, weak) < SIMILAR_MIN

    result = similar_users("viewer", frozenset(), {"viewer": VIEWER, "weak": weak})

    assert result == ()


def test_similar_users_sorts_by_similarity_then_id_and_caps_at_k():
    close = profile(trail=3.0, cafe=1.4, restaurant=-0.5)
    vectors = {"viewer": VIEWER, "close": close}
    vectors |= {f"kai_{i:02d}": KAI for i in range(SIMILAR_K + 2)}

    result = similar_users("viewer", frozenset(), vectors)

    assert len(result) == SIMILAR_K
    assert result[0].user_id == "close"
    assert [s.user_id for s in result[1:]] == [f"kai_{i:02d}" for i in range(SIMILAR_K - 1)]
    assert all(isinstance(s, SimilarUser) for s in result)


def test_similar_users_viewer_without_profile_gets_none():
    assert similar_users("viewer", frozenset(), {"kai": KAI}) == ()


def test_log_value_uses_the_stored_value_when_present():
    log = make_log(rating=5.0, verdict=Verdict.RECOMMEND).model_copy(update={"value": 0.25})

    assert log_value(log) == 0.25


def test_is_liked_follows_the_stored_value():
    log = make_log(rating=5.0, verdict=Verdict.RECOMMEND).model_copy(update={"value": 0.0})

    assert is_liked(log) is False
