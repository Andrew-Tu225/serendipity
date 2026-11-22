"""The 8-user scenario through the real write and read paths on SQLite.

Logs go in through `ExperienceService`, so stored taste profiles come from the
production write path; recommendations come from `SqlRecommendationRepository`.
"""

from uuid import NAMESPACE_URL, UUID, uuid5

import pytest
from sqlalchemy import select

from app.models import Bookmark, Follow, Place, TasteProfile, User
from app.models.conversions import to_domain_user
from app.recommend.service import PinKind, recommend
from app.repositories.recommendations import SqlRecommendationRepository
from app.schemas.recommendations import BBox
from app.services.experiences import ExperienceService
from tests.recommend import scenario as sc

pytestmark = pytest.mark.anyio


def db_id(scenario_id: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"serendipity-scenario:{scenario_id}")


SCENARIO_ID = {str(db_id(i)): i for i in (*sc.USERS, *(p.id for p in sc.PLACES))}


@pytest.fixture
async def seeded(database_factory):
    async with database_factory() as session:
        users = {
            uid: User(id=db_id(uid), auth0_sub=f"scenario|{uid}", display_name=u.display_name)
            for uid, u in sc.USERS.items()
        }
        session.add_all(users.values())
        session.add_all(
            Place(id=db_id(p.id), name=p.name, lat=p.lat, lng=p.lng, category=p.category.value)
            for p in sc.PLACES
        )
        await session.flush()
        session.add_all(
            Follow(follower_id=db_id(f.follower_id), followee_id=db_id(f.followee_id))
            for f in sc.FOLLOWS
        )
        session.add_all(
            Bookmark(user_id=db_id(b.user_id), place_id=db_id(b.place_id)) for b in sc.BOOKMARKS
        )
        await session.commit()

    for log in sc.ALL_LOGS:
        async with database_factory() as session:
            await ExperienceService(session).create_experience(
                users[log.user_id],
                str(db_id(log.place_id)),
                rating=log.rating,
                verdict=log.verdict,
                visited_on=log.visited_on,
            )
    return users


async def test_stored_taste_profiles_match_the_scenario(database_factory, seeded):
    async with database_factory() as session:
        rows = (await session.scalars(select(TasteProfile))).all()

    stored = {(SCENARIO_ID[str(r.user_id)], r.category): r.score for r in rows if r.score}
    expected = {(r.user_id, r.category.value): r.score for r in sc.PROFILES}
    assert stored == pytest.approx(expected)


def main_items(items, to_scenario_id):
    return [
        (to_scenario_id(i.place.id), i.kind, round(i.score, 9))
        for i in items
        if i.kind is not PinKind.EXPLORE
    ]


async def load(database_factory, user: User, limit: int):
    async with database_factory() as session:
        return await SqlRecommendationRepository(session).load_input(
            to_domain_user(user), BBox.parse(sc.BBOX_ALL), limit, sc.TODAY
        )


@pytest.mark.parametrize("viewer", tuple(sc.USERS))
async def test_database_recommendations_match_the_pure_algorithm(database_factory, seeded, viewer):
    data = await load(database_factory, seeded[viewer], 60)
    from_db = main_items(recommend(data), SCENARIO_ID.__getitem__)
    pure = main_items(recommend(sc.input_for(viewer, 60)), str)

    # Equal scores are ordered by place id, and database ids are UUIDs, so only
    # the set of (place, kind, score) and the descending scores must agree.
    assert sorted(from_db) == sorted(pure)
    assert [score for _, _, score in from_db] == sorted(
        (score for _, _, score in from_db), reverse=True
    )
    assert len(data.logs) == len(sc.LATEST_LOGS)


@pytest.mark.parametrize("viewer", tuple(sc.USERS))
async def test_database_recommendations_fill_the_same_slots_at_limit_10(
    database_factory, seeded, viewer
):
    from_db = recommend(await load(database_factory, seeded[viewer], 10))
    pure = recommend(sc.input_for(viewer, 10))

    assert sorted(i.score for i in from_db) == pytest.approx(sorted(i.score for i in pure))
    assert [i.kind is PinKind.EXPLORE for i in from_db].count(True) == [
        i.kind is PinKind.EXPLORE for i in pure
    ].count(True)
