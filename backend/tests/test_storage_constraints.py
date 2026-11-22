from datetime import date
from uuid import UUID

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Experience, Follow, Place, TasteProfile, User

pytestmark = pytest.mark.anyio

USER_ID = UUID(int=1)
PLACE_ID = UUID(int=2)


@pytest.fixture
async def session(database_factory):
    async with database_factory() as session:
        session.add(User(id=USER_ID, auth0_sub="auth0|constraints"))
        session.add(Place(id=PLACE_ID, name="Spot", lat=43.6, lng=-79.4, category="park"))
        await session.commit()
        yield session


def experience(**overrides) -> Experience:
    fields = {
        "user_id": USER_ID,
        "place_id": PLACE_ID,
        "rating": 4.0,
        "verdict": "neutral",
        "photo_urls": [],
        "visited_on": date(2026, 10, 1),
    }
    return Experience(**{**fields, **overrides})


async def assert_rejected(session, row) -> None:
    session.add(row)
    with pytest.raises(IntegrityError):
        await session.flush()
    await session.rollback()


async def test_valid_experience_is_accepted(session):
    session.add(experience(rating=3.5))
    await session.flush()


@pytest.mark.parametrize("rating", [0.5, 5.5, 3.3])
async def test_experience_rating_outside_range_or_half_steps_is_rejected(session, rating):
    await assert_rejected(session, experience(rating=rating))


async def test_experience_unknown_verdict_is_rejected(session):
    await assert_rejected(session, experience(verdict="love"))


async def test_experience_review_over_2000_chars_is_rejected(session):
    await assert_rejected(session, experience(review="x" * 2001))


@pytest.mark.parametrize(
    "fields",
    [
        {"lat": 91.0},
        {"lng": -181.0},
        {"category": "spaceport"},
        {"name": ""},
    ],
)
async def test_invalid_place_is_rejected(session, fields):
    place = {"name": "Other", "lat": 43.0, "lng": -79.0, "category": "park", **fields}
    await assert_rejected(session, Place(id=UUID(int=3), **place))


async def test_self_follow_is_rejected(session):
    await assert_rejected(session, Follow(follower_id=USER_ID, followee_id=USER_ID))


async def test_taste_profile_unknown_category_is_rejected(session):
    await assert_rejected(session, TasteProfile(user_id=USER_ID, category="spaceport", score=1.0))
