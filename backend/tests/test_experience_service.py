from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select

from app.models import Experience, Place, TasteProfile, User
from app.models.domain import Category, Verdict
from app.recommend.taste import apply_log, empty_profile
from app.repositories.experiences import TasteProfileRepository
from app.services.experiences import ExperienceService

pytestmark = pytest.mark.anyio

USER_ID = UUID("00000000-0000-0000-0000-0000000000aa")
TRAIL_ID = UUID("00000000-0000-0000-0000-0000000000b1")
CAFE_ID = UUID("00000000-0000-0000-0000-0000000000b2")
DAY = date(2026, 10, 1)


@pytest.fixture
async def user(database_factory):
    async with database_factory() as session:
        session.add(User(id=USER_ID, auth0_sub="auth0|writer", display_name="Writer"))
        session.add_all(
            [
                Place(id=TRAIL_ID, name="Trail", lat=43.7, lng=-79.4, category="trail"),
                Place(id=CAFE_ID, name="Cafe", lat=43.6, lng=-79.4, category="cafe"),
            ]
        )
        await session.commit()
        return await session.get(User, USER_ID)


async def stored_scores(database_factory) -> dict[Category, float]:
    async with database_factory() as session:
        rows = (await session.scalars(select(TasteProfile))).all()
    return {Category(row.category): row.score for row in rows}


async def count(database_factory, model) -> int:
    async with database_factory() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def test_create_experience_stores_the_log(database_factory, user):
    async with database_factory() as session:
        log = await ExperienceService(session).create_experience(
            user, str(TRAIL_ID), rating=4.5, visited_on=DAY, review="Great views"
        )

    async with database_factory() as session:
        row = await session.get(Experience, UUID(log.id))
    assert (row.user_id, row.place_id, row.rating, row.review) == (
        USER_ID,
        TRAIL_ID,
        4.5,
        "Great views",
    )
    assert log.user_id == str(USER_ID) and log.place_id == str(TRAIL_ID)


async def test_create_experience_scores_match_folding_apply_log(database_factory, user):
    entries = [
        (TRAIL_ID, Category.TRAIL, 5.0, Verdict.RECOMMEND),
        (TRAIL_ID, Category.TRAIL, 4.0, Verdict.NEUTRAL),
        (CAFE_ID, Category.CAFE, 1.5, Verdict.AVOID),
        (CAFE_ID, Category.CAFE, 3.5, Verdict.NEUTRAL),
    ]
    expected = empty_profile()
    for place_id, category, rating, verdict in entries:
        async with database_factory() as session:
            log = await ExperienceService(session).create_experience(
                user, str(place_id), rating=rating, visited_on=DAY, verdict=verdict
            )
        expected = apply_log(expected, log, category)

    stored = await stored_scores(database_factory)

    assert stored == pytest.approx({k: v for k, v in expected.items() if k in stored})
    assert set(stored) == {Category.TRAIL, Category.CAFE}


async def test_create_experience_repeat_visit_adds_again(database_factory, user):
    for _ in range(2):
        async with database_factory() as session:
            await ExperienceService(session).create_experience(
                user, str(TRAIL_ID), rating=3.0, visited_on=DAY, verdict=Verdict.RECOMMEND
            )

    assert await stored_scores(database_factory) == {Category.TRAIL: 2.0}


@pytest.mark.parametrize("place_id", [str(uuid4()), "not-a-uuid"])
async def test_create_experience_unknown_place_writes_nothing(database_factory, user, place_id):
    async with database_factory() as session:
        with pytest.raises(HTTPException) as error:
            await ExperienceService(session).create_experience(
                user, place_id, rating=4.0, visited_on=DAY
            )

    assert error.value.status_code == 404
    assert await count(database_factory, Experience) == 0
    assert await count(database_factory, TasteProfile) == 0


@pytest.mark.parametrize(
    "fields",
    [
        {"rating": 5.5, "visited_on": DAY},
        {"rating": 3.25, "visited_on": DAY},
        {"rating": 4.0, "visited_on": date.today() + timedelta(days=1)},
        {"rating": 4.0, "visited_on": DAY, "review": "x" * 2001},
    ],
)
async def test_create_experience_invalid_input_writes_nothing(database_factory, user, fields):
    async with database_factory() as session:
        with pytest.raises(ValidationError):
            await ExperienceService(session).create_experience(user, str(TRAIL_ID), **fields)

    assert await count(database_factory, Experience) == 0


async def test_create_experience_rolls_back_the_log_when_the_score_update_fails(
    database_factory, user, monkeypatch
):
    async def fail(*args, **kwargs):
        raise RuntimeError("profile update failed")

    monkeypatch.setattr(TasteProfileRepository, "add_score", fail)

    async with database_factory() as session:
        with pytest.raises(RuntimeError):
            await ExperienceService(session).create_experience(
                user, str(TRAIL_ID), rating=4.0, visited_on=DAY
            )

    assert await count(database_factory, Experience) == 0


async def test_add_score_creates_then_increments_the_row(database_factory, user):
    async with database_factory() as session:
        profiles = TasteProfileRepository(session)
        await profiles.add_score(USER_ID, "museum", 0.5)
        await profiles.add_score(USER_ID, "museum", -1.5)
        await session.commit()

    assert await stored_scores(database_factory) == {Category.MUSEUM: -1.0}
