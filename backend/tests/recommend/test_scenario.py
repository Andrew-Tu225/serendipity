"""`recommend` on the 8-user, 60-place scenario.

`oracle` re-derives the expected result from docs/recommendations.md section 2
without the production helpers, and every viewer is checked against it. The
persona tests pin hand-worked expectations from the dataset's design.
"""

import math
from collections import Counter, defaultdict
from dataclasses import dataclass

import pytest

from app.models.domain import Category, Experience, Verdict
from app.recommend.service import PinKind, Relation, recommend
from app.recommend.taste import similar_users, vectors_from_rows
from tests.recommend import scenario as sc

VIEWERS = tuple(sc.USERS)
LIMITS = (10, 30)


def value(log: Experience) -> float:
    if log.verdict == Verdict.RECOMMEND:
        return 1.0
    if log.verdict == Verdict.AVOID:
        return -1.0
    return (log.rating - 3) / 2


@dataclass(frozen=True)
class Expected:
    similar: list[tuple[str, float]]
    main: list[tuple[str, float, PinKind]]
    gems: dict[str, int]
    gem_count: int
    is_cold_start: bool


def oracle(viewer: str, limit: int) -> Expected:
    followees = {f.followee_id for f in sc.FOLLOWS if f.follower_id == viewer}

    vectors: dict[str, dict[Category, float]] = defaultdict(lambda: defaultdict(float))
    for log in sc.ALL_LOGS:
        vectors[log.user_id][sc.CATEGORY_OF[log.place_id]] += value(log)

    def cosine(a: str, b: str) -> float:
        dot = sum(vectors[a][k] * vectors[b][k] for k in Category)
        na = math.sqrt(sum(vectors[a][k] ** 2 for k in Category))
        nb = math.sqrt(sum(vectors[b][k] ** 2 for k in Category))
        return 0.0 if na == 0 or nb == 0 else max(dot / (na * nb), 0.0)

    candidates = [(u, cosine(viewer, u)) for u in sc.USERS if u != viewer and u not in followees]
    similar = sorted((c for c in candidates if c[1] >= 0.2), key=lambda c: (-c[1], c[0]))[:10]

    weight = {u: s for u, s in similar} | {u: 1.0 for u in followees}
    excluded = {b.place_id for b in sc.BOOKMARKS if b.user_id == viewer} | {
        log.place_id for log in sc.LATEST_LOGS if log.user_id == viewer
    }

    score: dict[str, float] = defaultdict(float)
    for log in sc.LATEST_LOGS:
        if log.place_id not in excluded and log.user_id in weight:
            score[log.place_id] += weight[log.user_id] * value(log)
    ranked = sorted((p for p, s in score.items() if s > 0), key=lambda p: (-score[p], p))

    weighted_places = {log.place_id for log in sc.LATEST_LOGS if log.user_id in weight}
    gems = Counter(
        log.place_id
        for log in sc.LATEST_LOGS
        if value(log) > 0 and log.place_id not in excluded | weighted_places
    )

    main_target = round(0.8 * limit)
    gem_count = min(len(gems), limit - min(len(ranked), main_target))
    main_count = min(len(ranked), limit - gem_count)
    friend_liked = {
        log.place_id for log in sc.LATEST_LOGS if log.user_id in followees and value(log) > 0
    }
    main = [
        (p, score[p], PinKind.FRIEND if p in friend_liked else PinKind.SIMILAR_TASTE)
        for p in ranked[:main_count]
    ]
    return Expected(similar, main, dict(gems), gem_count, is_cold_start=not weight)


def main_items(items):
    return [i for i in items if i.kind is not PinKind.EXPLORE]


def explore_items(items):
    return [i for i in items if i.kind is PinKind.EXPLORE]


# Every viewer against the oracle


@pytest.mark.parametrize("viewer", VIEWERS)
def test_similar_users_match_oracle(viewer):
    followees = frozenset(f.followee_id for f in sc.FOLLOWS if f.follower_id == viewer)

    result = similar_users(viewer, followees, vectors_from_rows(sc.PROFILES))

    expected = oracle(viewer, 10).similar
    assert [s.user_id for s in result] == [u for u, _ in expected]
    assert [s.sim for s in result] == pytest.approx([s for _, s in expected])


@pytest.mark.parametrize("limit", LIMITS)
@pytest.mark.parametrize("viewer", VIEWERS)
def test_main_items_have_oracle_places_scores_and_kinds(viewer, limit):
    items = recommend(sc.input_for(viewer, limit))

    expected = oracle(viewer, limit).main
    assert [(i.place.id, i.kind) for i in main_items(items)] == [(p, k) for p, _, k in expected]
    assert [i.score for i in main_items(items)] == pytest.approx([s for _, s, _ in expected])


@pytest.mark.parametrize("limit", LIMITS)
@pytest.mark.parametrize("viewer", VIEWERS)
def test_explore_items_are_hidden_gems_with_score_zero(viewer, limit):
    items = recommend(sc.input_for(viewer, limit))

    expected = oracle(viewer, limit)
    explore = explore_items(items)
    assert len(explore) == expected.gem_count
    assert {i.place.id for i in explore} <= set(expected.gems)
    assert all(i.score == 0.0 for i in explore)
    assert len(items) <= limit


@pytest.mark.parametrize("viewer", VIEWERS)
def test_never_recommends_logged_or_bookmarked_places(viewer):
    logged = {log.place_id for log in sc.ALL_LOGS if log.user_id == viewer}
    bookmarked = {b.place_id for b in sc.BOOKMARKS if b.user_id == viewer}

    items = recommend(sc.input_for(viewer, 60))

    assert {i.place.id for i in items}.isdisjoint(logged | bookmarked)


@pytest.mark.parametrize("viewer", VIEWERS)
def test_pin_logs_are_liked_capped_and_ordered_by_relation(viewer):
    rank = {Relation.FOLLOWING: 0, Relation.SIMILAR_TASTE: 1, Relation.COMMUNITY: 2}

    for item in recommend(sc.input_for(viewer, 60)):
        relations = [rank[s.relation] for s in item.logs]
        assert 1 <= len(item.logs) <= 3
        assert all(value(s.experience) > 0 for s in item.logs)
        assert all(s.experience.place_id == item.place.id for s in item.logs)
        assert relations == sorted(relations)
        if item.kind is not PinKind.EXPLORE:
            assert relations[0] < rank[Relation.COMMUNITY]


@pytest.mark.parametrize("viewer", VIEWERS)
def test_same_viewer_and_day_give_the_same_result(viewer):
    assert recommend(sc.input_for(viewer)) == recommend(sc.input_for(viewer))


# Persona expectations, worked out by hand from the dataset

F, S = PinKind.FRIEND, PinKind.SIMILAR_TASTE


def top_main(viewer: str) -> list[tuple[str, PinKind]]:
    return [(i.place.id, i.kind) for i in main_items(recommend(sc.input_for(viewer)))]


def similar_of(viewer: str) -> list[tuple[str, float]]:
    followees = frozenset(f.followee_id for f in sc.FOLLOWS if f.follower_id == viewer)
    return [
        (s.user_id, s.sim) for s in similar_users(viewer, followees, vectors_from_rows(sc.PROFILES))
    ]


def test_hana_profile_counts_both_visits_to_s03():
    trail = next(
        r.score for r in sc.PROFILES if r.user_id == "u_hana" and r.category is Category.TRAIL
    )

    assert trail == 2.0


def test_hana_matches_mei_and_gets_her_trails_as_similar_taste():
    assert similar_of("u_hana") == [("u_mei", pytest.approx(0.8975, abs=1e-4))]
    assert top_main("u_hana") == [
        ("s_05", F),
        ("s_22", F),
        ("s_31", F),
        ("s_34", F),
        ("s_57", F),
        ("s_04", S),
        ("s_48", S),
        ("s_07", F),
    ]
    first = recommend(sc.input_for("u_hana"))[0]
    assert first.score == pytest.approx(0.75 + 0.8975, abs=1e-4)
    assert [s.experience.user_id for s in first.logs] == ["u_dev", "u_mei"]


def test_mei_gets_dev_climbing_and_hana_trails_but_not_the_trail_hana_now_avoids():
    assert similar_of("u_mei") == [("u_hana", pytest.approx(0.8975, abs=1e-4))]
    assert top_main("u_mei") == [
        ("s_34", F),
        ("s_57", F),
        ("s_02", S),
        ("s_35", F),
        ("s_11", S),
        ("s_36", F),
        ("s_37", F),
        ("s_06", S),
    ]
    assert "s_03" not in {i.place.id for i in recommend(sc.input_for("u_mei", 60))}


def test_dev_weakly_matches_mei_and_gets_her_spots_after_hanas():
    assert similar_of("u_dev") == [("u_mei", pytest.approx(0.2973, abs=1e-4))]
    assert top_main("u_dev") == [
        ("s_01", F),
        ("s_11", F),
        ("s_06", F),
        ("s_47", F),
        ("s_04", S),
        ("s_12", S),
        ("s_48", S),
        ("s_20", F),
    ]


def test_omar_matches_jay_without_following_him():
    assert similar_of("u_omar") == [("u_jay", pytest.approx(0.5504, abs=1e-4))]
    assert top_main("u_omar") == [
        ("s_22", F),
        ("s_31", F),
        ("s_07", F),
        ("s_21", F),
        ("s_18", S),
        ("s_44", S),
        ("s_50", S),
        ("s_24", F),
    ]


def test_omar_never_gets_places_jay_avoided_or_he_bookmarked_or_logged():
    ids = {i.place.id for i in recommend(sc.input_for("u_omar", 60))}

    assert ids.isdisjoint({"s_51", "s_41", "s_19", "s_53"})


def test_jay_only_has_omar_so_gems_fill_the_rest():
    items = recommend(sc.input_for("u_jay"))

    assert similar_of("u_jay") == []
    assert [(i.place.id, i.kind) for i in main_items(items)] == [
        ("s_15", F),
        ("s_20", F),
        ("s_42", F),
        ("s_52", F),
        ("s_14", F),
    ]
    assert len(explore_items(items)) == 5
    assert {"s_06", "s_53"}.isdisjoint({i.place.id for i in items})


def test_sofia_matches_hana_just_above_the_threshold_and_skips_her_bookmark():
    assert similar_of("u_sofia") == [("u_hana", pytest.approx(0.2096, abs=1e-4))]
    assert "s_23" not in {i.place.id for i in recommend(sc.input_for("u_sofia", 60))}


def test_lin_has_no_similar_users_and_gets_only_sofias_places_then_gems():
    items = recommend(sc.input_for("u_lin"))

    assert similar_of("u_lin") == []
    assert [(i.place.id, i.kind) for i in main_items(items)] == [
        ("s_06", F),
        ("s_20", F),
        ("s_31", F),
        ("s_07", F),
        ("s_21", F),
        ("s_24", F),
        ("s_32", F),
        ("s_43", F),
    ]
    assert len(explore_items(items)) == 2


def test_newcomer_cold_start_orders_by_liked_count_and_ignores_superseded_visits():
    items = recommend(sc.input_for("u_newcomer", 60))

    assert all(i.kind is PinKind.EXPLORE for i in items)
    assert [i.place.id for i in items[:2]] == ["s_10", "s_20"]
    counts = oracle("u_newcomer", 60).gems
    assert [counts[i.place.id] for i in items] == sorted(counts.values(), reverse=True)
    assert "s_03" not in {i.place.id for i in items}
