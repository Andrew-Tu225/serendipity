from datetime import date
from uuid import UUID, uuid4

import pytest

from app.models import Experience, User, domain
from app.repositories import recommendations as repository_module
from app.repositories.recommendations import SqlRecommendationRepository
from app.schemas.recommendations import BBox
from tests.recommend import fixtures as fx
from tests.recommend.db_seed import seed_fixture

pytestmark = pytest.mark.anyio

AROUND_FIXTURE = BBox.parse("-80,43,-79,44")
VIEWER = domain.User(id=fx.VIEWER.id, display_name="Viewer")


@pytest.fixture
async def seeded(database_factory):
    async with database_factory() as session:
        ids = await seed_fixture(session)
    return ids


@pytest.fixture
async def repository(database_factory):
    async with database_factory() as session:
        yield SqlRecommendationRepository(session)


def fixture_ids(ids: dict[str, UUID], db_ids) -> set[str]:
    back = {str(v): k for k, v in ids.items()}
    return {back[i] for i in db_ids}


async def test_load_input_keeps_only_places_inside_the_bbox(seeded, repository):
    data = await repository.load_input(VIEWER, BBox.parse("-80,43.615,-79,44"), 30, fx.TODAY)

    places = fixture_ids(seeded, (p.id for p in data.places))
    assert places == {p.id for p in fx.PLACES} - {"p_01"}
    assert all(log.place_id != str(seeded["p_01"]) for log in data.logs)


async def test_load_input_caps_places_in_view(seeded, repository, monkeypatch):
    monkeypatch.setattr(repository_module, "MAX_PLACES_IN_VIEW", 3)

    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    assert len(data.places) == 3


async def test_load_input_passes_viewer_limit_and_today_through(seeded, repository):
    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 7, fx.TODAY)

    assert (data.viewer, data.limit, data.today) == (VIEWER, 7, fx.TODAY)


async def test_load_input_converts_rows_to_domain_models(seeded, repository):
    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    log = next(log for log in data.logs if log.id == str(seeded["e_02"]))
    assert log == domain.Experience(
        id=str(seeded["e_02"]),
        user_id=str(seeded["u_leo"]),
        place_id=str(seeded["p_01"]),
        rating=4.5,
        verdict=domain.Verdict.RECOMMEND,
        visited_on=date(2026, 10, 5),
        value=1.0,
    )
    place = next(p for p in data.places if p.id == str(seeded["p_01"]))
    assert (place.name, place.category) == ("Place 1", domain.Category.TRAIL)


async def test_load_input_returns_only_the_latest_log_per_user_and_place(
    seeded, repository, database_factory
):
    async with database_factory() as session:
        session.add(
            Experience(
                id=uuid4(),
                user_id=seeded["u_maya"],
                place_id=seeded["p_01"],
                rating=2.0,
                verdict="avoid",
                photo_urls=[],
                visited_on=date(2026, 11, 1),
            )
        )
        await session.commit()

    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    maya_at_p01 = [
        log
        for log in data.logs
        if log.user_id == str(seeded["u_maya"]) and log.place_id == str(seeded["p_01"])
    ]
    assert [log.verdict for log in maya_at_p01] == [domain.Verdict.AVOID]
    assert len(data.logs) == len(fx.LOGS)


async def test_load_input_loads_viewer_follows_bookmarks_and_every_profile(seeded, repository):
    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    assert fixture_ids(seeded, (f.followee_id for f in data.follows)) == {"u_maya", "u_leo"}
    assert fixture_ids(seeded, (b.place_id for b in data.bookmarks)) == {"p_08", "p_11"}
    assert len(data.profiles) == len(fx.PROFILES)


async def test_load_input_includes_log_authors(seeded, repository):
    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    assert data.users[str(seeded["u_maya"])] == domain.User(
        id=str(seeded["u_maya"]), display_name="Maya"
    )
    assert {log.user_id for log in data.logs} <= set(data.users)


async def test_load_input_with_an_empty_database_is_empty(repository):
    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    assert (data.places, data.logs, data.follows, data.profiles) == ((), (), (), ())


async def test_load_place_logs_returns_place_logs_and_viewer_context(seeded, repository):
    data = await repository.load_place_logs(VIEWER, str(seeded["p_04"]))

    assert data.place.id == str(seeded["p_04"])
    assert fixture_ids(seeded, (log.id for log in data.logs)) == {"e_10", "e_11"}
    assert {str(seeded["u_leo"]), str(seeded["u_rin"])} <= set(data.users)
    assert len(data.follows) == 2
    assert len(data.profiles) == len(fx.PROFILES)


@pytest.mark.parametrize("place_id", [str(UUID(int=0)), "not-a-uuid", "p_01"])
async def test_load_place_logs_unknown_or_malformed_place_is_none(seeded, repository, place_id):
    assert await repository.load_place_logs(VIEWER, place_id) is None


async def test_unnamed_author_is_anonymous(database_factory, repository, seeded):
    async with database_factory() as session:
        user = await session.get(User, seeded["u_zed"])
        user.display_name = None
        await session.commit()

    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    assert data.users[str(seeded["u_zed"])].display_name == "Anonymous"


async def test_load_input_returns_the_stored_value_not_a_recomputed_one(
    seeded, repository, database_factory
):
    async with database_factory() as session:
        row = await session.get(Experience, seeded["e_02"])
        row.value = 0.3
        await session.commit()

    data = await repository.load_input(VIEWER, AROUND_FIXTURE, 30, fx.TODAY)

    log = next(log for log in data.logs if log.id == str(seeded["e_02"]))
    assert (log.verdict, log.value) == (domain.Verdict.RECOMMEND, 0.3)
