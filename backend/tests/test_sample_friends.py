from datetime import date
from uuid import UUID

import pytest
from pydantic import ValidationError
from sqlalchemy import delete, func, select

from app.config import Settings
from app.demo.london import demo_id
from app.models import Follow, User
from app.services.demo_data import DemoDataService
from app.services.sample_friends import SAMPLE_FRIEND_IDS, SampleFriendsService
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio


async def test_seed_connects_all_accounts_and_is_repeatable(database_factory):
    async with database_factory() as session:
        users = [User(auth0_sub=f"auth0|viewer-{i}", display_name=f"Viewer {i}") for i in range(2)]
        session.add_all(users)
        await session.commit()
        await DemoDataService(session).seed_london(date.today())
        for user in users:
            assert (
                await session.scalar(
                    select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)
                )
                == 6
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(Follow).where(Follow.followee_id == user.id)
                )
                == 6
            )
        assert all(
            value == 0
            for value in (await DemoDataService(session).seed_london(date.today())).values()
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(Follow)
                .where(Follow.follower_id == Follow.followee_id)
            )
            == 0
        )


async def test_refreshes_only_expected_legacy_fixture_text(database_factory):
    from app.models import Experience

    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        elena = await session.get(User, demo_id("user:Elena"))
        james = await session.get(User, demo_id("user:James"))
        elena.display_name = "Demo Elena"
        james.display_name = "Custom name"
        logs = (await session.scalars(select(Experience).limit(2))).all()
        original = logs[0].review
        logs[0].review = f"[Mock review] {original}"
        logs[1].review = "A personal edit"
        visited_on = logs[0].visited_on
        await session.commit()
        await DemoDataService(session).seed_london(date.today())
        await session.refresh(elena)
        await session.refresh(james)
        for log in logs:
            await session.refresh(log)
        assert elena.display_name == "Elena"
        assert james.display_name == "Custom name"
        assert logs[0].review == original and logs[0].visited_on == visited_on
        assert logs[1].review == "A personal edit"


async def test_new_account_gets_friends_once(client, identity_provider, database_factory, settings):
    settings.local_sample_friends_enabled = True
    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
    await authenticate(client, identity_provider)
    viewer = UUID((await client.get("/api/auth/me")).json()["user"]["id"])
    async with database_factory() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Follow).where(Follow.follower_id == viewer)
            )
            == 6
        )
        assert (
            await session.scalar(
                select(func.count()).select_from(Follow).where(Follow.followee_id == viewer)
            )
            == 6
        )
        await session.execute(
            delete(Follow).where(
                Follow.follower_id == viewer, Follow.followee_id == SAMPLE_FRIEND_IDS[0]
            )
        )
        await session.commit()
    await authenticate(client, identity_provider)
    async with database_factory() as session:
        assert await session.get(Follow, (viewer, SAMPLE_FRIEND_IDS[0])) is None


async def test_disabled_flag_leaves_new_account_unconnected(
    client, identity_provider, database_factory
):
    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
    await authenticate(client, identity_provider)
    viewer = UUID((await client.get("/api/auth/me")).json()["user"]["id"])
    async with database_factory() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Follow).where(Follow.follower_id == viewer)
            )
            == 0
        )


async def test_missing_fixtures_do_not_block_login(client, identity_provider, settings, caplog):
    settings.local_sample_friends_enabled = True
    await authenticate(client, identity_provider)
    assert "run npm run db:seed" in caplog.text


async def test_sample_friend_helper_never_follows_self(database_factory):
    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        await SampleFriendsService(session).connect(SAMPLE_FRIEND_IDS[0])
        assert await session.get(Follow, (SAMPLE_FRIEND_IDS[0], SAMPLE_FRIEND_IDS[0])) is None


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://remote.example/app",
        "postgresql+psycopg://localhost/app?hostaddr=8.8.8.8",
        "sqlite:///test.db",
    ],
)
async def test_local_flag_rejects_remote_or_overridden_database(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, local_sample_friends_enabled=True, database_url=url)


async def test_local_flag_rejects_remote_app():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            local_sample_friends_enabled=True,
            database_url="postgresql+psycopg://localhost/app",
            app_base_url="https://example.com",
            cookie_secure=True,
        )


async def test_sample_friends_supply_map_evidence_and_browsable_profiles(
    client, identity_provider, database_factory
):
    from app.demo.london import PLACES

    await authenticate(client, identity_provider)
    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
    response = await client.get(
        "/api/discovery/places",
        params={
            "bbox": "-81.35,42.93,-81.20,43.03",
            "limit": 200,
        },
    )
    places = response.json()["places"]
    assert len(places) == len(PLACES)
    assert all(place["friend_count"] > 0 for place in places)
    assert all(place["friends"] for place in places)
    recommendations = await client.get(
        "/api/recommendations",
        params={
            "bbox": "-81.35,42.93,-81.20,43.03",
            "limit": 30,
        },
    )
    friends = [item for item in recommendations.json()["items"] if item["kind"] == "friend"]
    assert friends
    for item in friends:
        assert any(log["relation"] == "following" for log in item["logs"])
    author = places[0]["friends"][0]["author_id"]
    profile = (await client.get(f"/api/users/{author}")).json()
    assert profile["is_following"] and profile["follows_you"]
    assert profile["experience_count"] >= 5
    history = (await client.get(f"/api/users/{author}/experiences")).json()
    assert history["items"]
    assert all(item["author"]["id"] == author for item in history["items"])
    assert all("Demo " not in item["author"]["display_name"] for item in history["items"])
    assert all("[Mock review]" not in (item["review"] or "") for item in history["items"])
