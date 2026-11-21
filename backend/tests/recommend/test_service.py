from dataclasses import replace
from datetime import date

import pytest

from app.models.domain import Experience, User, Verdict
from app.recommend.config import EXPLORE_RATIO, LOGS_PER_PLACE
from app.recommend.service import (
    PinKind,
    Relation,
    ScoredPlace,
    ShownLog,
    Slot,
    build_user_weights,
    daily_seed,
    find_hidden_gems,
    label_pin_kind,
    merge_top_and_gems,
    pick_most_liked_gems,
    pick_pin_logs,
    pick_random_gems,
    recommend,
    score_places,
    sort_logs_by_relation,
)
from app.recommend.taste import SimilarUser
from tests.recommend import fixtures as fx

FOLLOWEES = frozenset({fx.MAYA.id, fx.LEO.id})
SIMILAR = (SimilarUser(fx.KAI.id, 0.965), SimilarUser(fx.RIN.id, 0.938))
WEIGHTS = {fx.MAYA.id: 1.0, fx.LEO.id: 1.0, fx.KAI.id: 0.965, fx.RIN.id: 0.938}


def make_log(log_id, user_id, place_id="p_x", rating=3.0, verdict=Verdict.NEUTRAL, day=1):
    return Experience(
        id=log_id,
        user_id=user_id,
        place_id=place_id,
        rating=rating,
        verdict=verdict,
        visited_on=date(2026, 10, day),
    )


def shown(log: Experience, relation: Relation) -> ShownLog:
    return ShownLog(
        experience=log, author=User(id=log.user_id, display_name="x"), relation=relation
    )


# build_user_weights


def test_build_user_weights_followees_get_one_and_similar_get_their_sim():
    assert build_user_weights(FOLLOWEES, SIMILAR) == WEIGHTS


def test_build_user_weights_leaves_strangers_out():
    assert fx.ZED.id not in build_user_weights(FOLLOWEES, SIMILAR)


# score_places


def test_score_places_sums_weight_times_value_and_sorts_descending():
    scored = score_places(fx.LOGS, WEIGHTS, excluded=frozenset({"p_08", "p_09", "p_11"}))

    assert [s.place_id for s in scored] == ["p_01", "p_02", "p_10", "p_03"]
    assert [s.score for s in scored] == pytest.approx([3.903, 1.434, 0.2345, 0.035], abs=1e-3)


def test_score_places_drops_net_negative_places():
    scored = score_places(fx.LOGS, WEIGHTS, excluded=frozenset())

    assert "p_04" not in {s.place_id for s in scored}


def test_score_places_skips_excluded_places():
    scored = score_places(fx.LOGS, WEIGHTS, excluded=frozenset({"p_01"}))

    assert "p_01" not in {s.place_id for s in scored}


def test_score_places_ignores_authors_without_weight():
    logs = [make_log("e_1", fx.ZED.id, verdict=Verdict.RECOMMEND)]

    assert score_places(logs, WEIGHTS, excluded=frozenset()) == ()


def test_score_places_breaks_ties_by_place_id():
    logs = [
        make_log("e_1", fx.MAYA.id, "p_b", verdict=Verdict.RECOMMEND),
        make_log("e_2", fx.MAYA.id, "p_a", verdict=Verdict.RECOMMEND),
    ]

    scored = score_places(logs, WEIGHTS, excluded=frozenset())

    assert [s.place_id for s in scored] == ["p_a", "p_b"]


# find_hidden_gems


def test_find_hidden_gems_are_places_liked_only_by_authors_without_weight():
    gems = find_hidden_gems(fx.LOGS, WEIGHTS, excluded=frozenset({"p_08", "p_09", "p_11"}))

    assert gems == {"p_05": 1, "p_06": 1}


def test_find_hidden_gems_skips_excluded_places():
    gems = find_hidden_gems(fx.LOGS, WEIGHTS, excluded=frozenset({"p_05"}))

    assert "p_05" not in gems


def test_find_hidden_gems_with_no_weights_counts_liked_logs_per_place():
    gems = find_hidden_gems(fx.LOGS, {}, excluded=frozenset())

    assert gems["p_01"] == 5
    assert "p_07" not in gems


# pick_random_gems, pick_most_liked_gems, daily_seed


def test_pick_random_gems_is_stable_for_the_same_seed():
    gems = {f"p_{i:02d}": 1 for i in range(20)}

    first = pick_random_gems(gems, 5, seed=42)

    assert first == pick_random_gems(gems, 5, seed=42)
    assert len(first) == 5
    assert set(first) <= set(gems)


def test_pick_random_gems_caps_at_available_gems():
    assert sorted(pick_random_gems({"p_a": 1, "p_b": 1}, 5, seed=1)) == ["p_a", "p_b"]


def test_pick_most_liked_gems_orders_by_count_then_id():
    gems = {"p_c": 1, "p_b": 3, "p_a": 1, "p_d": 3}

    assert pick_most_liked_gems(gems, 3) == ("p_b", "p_d", "p_a")


def test_daily_seed_is_stable_per_viewer_and_day():
    day = date(2026, 11, 21)

    assert daily_seed("u_1", day) == daily_seed("u_1", day)
    assert daily_seed("u_1", day) != daily_seed("u_2", day)
    assert daily_seed("u_1", day) != daily_seed("u_1", date(2026, 11, 22))


# merge_top_and_gems


def scored_places(n: int) -> tuple[ScoredPlace, ...]:
    return tuple(ScoredPlace(f"s_{i:02d}", float(n - i)) for i in range(n))


def gem_ids(n: int) -> tuple[str, ...]:
    return tuple(f"g_{i:02d}" for i in range(n))


def test_merge_top_and_gems_splits_by_explore_ratio():
    slots = merge_top_and_gems(scored_places(20), gem_ids(20), limit=10)

    main = [s for s in slots if not s.is_gem]
    assert len(main) == round((1 - EXPLORE_RATIO) * 10)
    assert [s.place_id for s in main] == [f"s_{i:02d}" for i in range(len(main))]
    assert len(slots) == 10


def test_merge_top_and_gems_fills_with_gems_when_scored_runs_short():
    slots = merge_top_and_gems(scored_places(3), gem_ids(20), limit=10)

    assert sum(not s.is_gem for s in slots) == 3
    assert len(slots) == 10


def test_merge_top_and_gems_fills_with_scored_when_gems_run_short():
    slots = merge_top_and_gems(scored_places(20), gem_ids(0), limit=10)

    assert [s.place_id for s in slots] == [f"s_{i:02d}" for i in range(10)]


def test_merge_top_and_gems_never_exceeds_limit_or_repeats_a_place():
    overlapping = ("s_00", "s_01", *gem_ids(5))

    slots = merge_top_and_gems(scored_places(5), overlapping, limit=8)

    ids = [s.place_id for s in slots]
    assert len(ids) == len(set(ids)) <= 8


def test_merge_top_and_gems_gem_slots_have_score_zero():
    slots = merge_top_and_gems(scored_places(2), gem_ids(2), limit=4)

    assert all(s.score == 0.0 for s in slots if s.is_gem)


# sort_logs_by_relation


def test_sort_logs_by_relation_orders_following_then_similar_then_community():
    logs = [
        make_log("e_zed", fx.ZED.id, day=9),
        make_log("e_rin", fx.RIN.id, day=8),
        make_log("e_kai", fx.KAI.id, day=1),
        make_log("e_maya", fx.MAYA.id, day=2),
        make_log("e_leo", fx.LEO.id, day=5),
    ]

    result = sort_logs_by_relation(logs, fx.USERS, FOLLOWEES, SIMILAR)

    assert [s.experience.id for s in result] == ["e_leo", "e_maya", "e_kai", "e_rin", "e_zed"]
    assert [s.relation for s in result] == [
        Relation.FOLLOWING,
        Relation.FOLLOWING,
        Relation.SIMILAR_TASTE,
        Relation.SIMILAR_TASTE,
        Relation.COMMUNITY,
    ]
    assert result[0].author == fx.LEO


def test_sort_logs_by_relation_rejects_unknown_author():
    with pytest.raises(ValueError, match="u_ghost"):
        sort_logs_by_relation([make_log("e_1", "u_ghost")], fx.USERS, FOLLOWEES, SIMILAR)


# pick_pin_logs


def test_pick_pin_logs_keeps_liked_logs_in_order_up_to_the_cap():
    logs = (
        shown(make_log("e_1", "a", verdict=Verdict.AVOID), Relation.FOLLOWING),
        *(
            shown(make_log(f"e_{i}", "a", verdict=Verdict.RECOMMEND), Relation.COMMUNITY)
            for i in range(2, 7)
        ),
    )

    picked = pick_pin_logs(logs)

    assert [s.experience.id for s in picked] == ["e_2", "e_3", "e_4"][:LOGS_PER_PLACE]


# label_pin_kind


def test_label_pin_kind_friend_when_a_followee_log_is_shown():
    logs = (shown(make_log("e_1", "a"), Relation.FOLLOWING),)

    assert label_pin_kind(Slot("p", 1.0, is_gem=False), logs) is PinKind.FRIEND


def test_label_pin_kind_similar_taste_for_main_slot_without_followee():
    logs = (shown(make_log("e_1", "a"), Relation.SIMILAR_TASTE),)

    assert label_pin_kind(Slot("p", 1.0, is_gem=False), logs) is PinKind.SIMILAR_TASTE


def test_label_pin_kind_explore_for_gem_slot():
    logs = (shown(make_log("e_1", "a"), Relation.FOLLOWING),)

    assert label_pin_kind(Slot("p", 0.0, is_gem=True), logs) is PinKind.EXPLORE


# recommend


def test_recommend_end_to_end_on_fixture():
    items = recommend(fx.BASE_INPUT)

    assert [(i.place.id, i.kind) for i in items[:4]] == [
        ("p_01", PinKind.FRIEND),
        ("p_02", PinKind.SIMILAR_TASTE),
        ("p_10", PinKind.SIMILAR_TASTE),
        ("p_03", PinKind.FRIEND),
    ]
    assert sorted((i.place.id, i.kind) for i in items[4:]) == [
        ("p_05", PinKind.EXPLORE),
        ("p_06", PinKind.EXPLORE),
    ]
    assert all(i.score == 0.0 for i in items[4:])


def test_recommend_every_item_has_a_liked_shown_log():
    items = recommend(fx.BASE_INPUT)

    assert all(1 <= len(i.logs) <= LOGS_PER_PLACE for i in items)
    assert all(s.experience.verdict is not Verdict.AVOID for i in items for s in i.logs)


def test_recommend_shows_followee_logs_first():
    items = recommend(fx.BASE_INPUT)

    assert [s.experience.id for s in items[0].logs] == ["e_02", "e_01", "e_03"]


def test_recommend_never_returns_logged_or_bookmarked_places():
    ids = {i.place.id for i in recommend(fx.BASE_INPUT)}

    assert ids.isdisjoint({"p_08", "p_09", "p_11"})


def test_recommend_respects_limit():
    items = recommend(replace(fx.BASE_INPUT, limit=5))

    assert len(items) == 5
    assert sum(i.kind is PinKind.EXPLORE for i in items) == 1


def test_recommend_is_deterministic_for_same_viewer_and_day():
    small = replace(fx.BASE_INPUT, limit=5)

    assert recommend(small) == recommend(small)


def test_recommend_ignores_logs_at_places_outside_the_input():
    items = recommend(replace(fx.BASE_INPUT, places=fx.PLACES[1:]))

    assert "p_01" not in {i.place.id for i in items}


def test_recommend_cold_start_orders_explore_by_liked_count():
    items = recommend(fx.NEWCOMER_INPUT)

    assert all(i.kind is PinKind.EXPLORE for i in items)
    assert [i.place.id for i in items[:5]] == ["p_01", "p_02", "p_09", "p_03", "p_04"]
