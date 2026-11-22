from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.models.domain import (
    Bookmark,
    Category,
    Experience,
    Follow,
    Place,
    TasteProfile,
    User,
    Verdict,
    verdict_value,
)


def make_experience(**overrides) -> Experience:
    fields = {
        "id": "e_1",
        "user_id": "u_1",
        "place_id": "p_1",
        "rating": 4.0,
        "visited_on": date(2026, 10, 1),
    }
    return Experience(**{**fields, **overrides})


def make_place(**overrides) -> Place:
    fields = {"id": "p_1", "name": "High Park", "lat": 43.64, "lng": -79.46, "category": "park"}
    return Place(**{**fields, **overrides})


@pytest.mark.parametrize("rating", [1.0, 3.5, 5.0])
def test_experience_accepts_half_step_ratings_in_range(rating):
    assert make_experience(rating=rating).rating == rating


@pytest.mark.parametrize("rating", [0.5, 5.5, 3.25])
def test_experience_rejects_ratings_off_scale(rating):
    with pytest.raises(ValidationError):
        make_experience(rating=rating)


def test_experience_verdict_defaults_to_neutral():
    assert make_experience().verdict is Verdict.NEUTRAL


def test_experience_rejects_future_visit_date():
    with pytest.raises(ValidationError):
        make_experience(visited_on=date.today() + timedelta(days=1))


def test_experience_rejects_review_over_2000_chars():
    with pytest.raises(ValidationError):
        make_experience(review="x" * 2001)


def test_experience_rejects_more_than_10_photos():
    with pytest.raises(ValidationError):
        make_experience(photo_urls=[f"https://img/{i}.jpg" for i in range(11)])


def test_experience_is_immutable():
    experience = make_experience()

    with pytest.raises(ValidationError):
        experience.rating = 2.0


def test_place_parses_category():
    assert make_place().category is Category.PARK


@pytest.mark.parametrize(("lat", "lng"), [(-90.1, 0), (90.1, 0), (0, -180.1), (0, 180.1)])
def test_place_rejects_out_of_range_coordinates(lat, lng):
    with pytest.raises(ValidationError):
        make_place(lat=lat, lng=lng)


def test_place_rejects_empty_name():
    with pytest.raises(ValidationError):
        make_place(name="")


def test_place_rejects_unknown_category():
    with pytest.raises(ValidationError):
        make_place(category="casino")


@pytest.mark.parametrize("name", ["", "x" * 61])
def test_user_rejects_display_name_outside_1_to_60_chars(name):
    with pytest.raises(ValidationError):
        User(id="u_1", display_name=name)


def test_user_avatar_defaults_to_none():
    assert User(id="u_1", display_name="Maya").avatar_url is None


def test_follow_rejects_self_follow():
    with pytest.raises(ValidationError):
        Follow(follower_id="u_1", followee_id="u_1")


def test_follow_accepts_distinct_users():
    follow = Follow(follower_id="u_1", followee_id="u_2")

    assert (follow.follower_id, follow.followee_id) == ("u_1", "u_2")


def test_bookmark_requires_user_and_place():
    with pytest.raises(ValidationError):
        Bookmark(user_id="u_1")


def test_taste_profile_allows_negative_score():
    assert TasteProfile(user_id="u_1", category="cafe", score=-1.5).score == -1.5


def test_taste_profile_rejects_unknown_category():
    with pytest.raises(ValidationError):
        TasteProfile(user_id="u_1", category="casino", score=1.0)


def test_experience_value_defaults_to_none():
    assert make_experience().value is None


@pytest.mark.parametrize("value", [-1.5, 1.01])
def test_experience_rejects_value_outside_minus_one_to_one(value):
    with pytest.raises(ValidationError):
        make_experience(value=value)


@pytest.mark.parametrize(
    ("verdict", "rating", "expected"),
    [
        (Verdict.RECOMMEND, 2.0, 1.0),
        (Verdict.AVOID, 5.0, -1.0),
        (Verdict.NEUTRAL, 4.0, 0.5),
        (Verdict.NEUTRAL, 1.0, -1.0),
    ],
)
def test_verdict_value_maps_verdict_and_rating_to_minus_one_to_one(verdict, rating, expected):
    assert verdict_value(verdict, rating) == expected
