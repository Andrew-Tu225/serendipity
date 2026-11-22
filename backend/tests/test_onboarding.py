from datetime import date
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.models import Bookmark, Experience, Follow, Place, TasteProfile, User, UserInterest
from app.repositories.recommendations import SqlRecommendationRepository
from app.schemas.onboarding import OnboardingWrite
from app.services.onboarding import OnboardingService
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio


async def credentials(client, identity_provider):
    await authenticate(client, identity_provider)
    session = (await client.get("/api/auth/me")).json()
    return UUID(session["user"]["id"]), {
        "origin": "http://localhost:3000",
        "x-csrf-token": session["csrf_token"],
    }


async def test_setup_persists_without_fabricating_activity(
    client, identity_provider, database_factory
):
    user_id, headers = await credentials(client, identity_provider)
    before = (await client.get("/api/me/profile")).json()
    assert before["onboarding_completed_at"] is None
    assert before["interests"] == []
    assert (
        before["experience_count"] == before["saved_place_count"] == before["following_count"] == 0
    )
    response = await client.put(
        "/api/me/onboarding", json={"interests": ["cafe", "trail"]}, headers=headers
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    profile = response.json()
    assert profile["interests"] == ["cafe", "trail"]
    assert profile["onboarding_completed_at"] is not None
    assert profile["user"]["id"] == str(user_id)
    assert "auth0_sub" not in profile["user"] and "email" not in profile["user"]
    assert (await client.get("/api/auth/me")).json()["user"]["onboarding_completed_at"] is not None
    async with database_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Experience)) == 0
        assert await db.scalar(select(func.count()).select_from(TasteProfile)) == 0
    identity_provider.claims = {"name": "New Auth0 Name"}
    await authenticate(client, identity_provider)
    assert (await client.get("/api/me/profile")).json()["interests"] == ["cafe", "trail"]
    assert (await client.get("/api/me/profile")).json()["user"]["display_name"] == "New Auth0 Name"


async def test_repeat_setup_replaces_interests_and_preserves_reviews(
    client, identity_provider, database_factory
):
    user_id, headers = await credentials(client, identity_provider)
    async with database_factory() as db:
        db.add(TasteProfile(user_id=user_id, category="cafe", score=2.5))
        await db.commit()
    first = (
        await client.put("/api/me/onboarding", json={"interests": ["cafe"]}, headers=headers)
    ).json()
    for _ in range(2):
        response = await client.put(
            "/api/me/onboarding", json={"interests": ["park"]}, headers=headers
        )
        assert response.json()["interests"] == ["park"]
        assert response.json()["onboarding_completed_at"].removesuffix("Z") == first[
            "onboarding_completed_at"
        ].removesuffix("Z")
    async with database_factory() as db:
        assert await db.scalar(select(func.count()).select_from(UserInterest)) == 1
        assert await db.scalar(select(TasteProfile.score)) == 2.5
        rows = await SqlRecommendationRepository(db)._profiles()
        assert {(r.category, r.score) for r in rows} == {("park", 1.0), ("cafe", 2.5)}


@pytest.mark.parametrize(
    "body",
    [
        {"interests": []},
        {"interests": ["pizza"]},
        {"interests": ["cafe", "cafe"]},
        {"interests": ["park"] * 15},
        {"interests": ["park"], "user_id": str(uuid4())},
    ],
)
async def test_invalid_setup_is_rejected(client, identity_provider, body):
    _, headers = await credentials(client, identity_provider)
    assert (await client.put("/api/me/onboarding", json=body, headers=headers)).status_code == 422
    assert (await client.get("/api/me/profile")).json()["onboarding_completed_at"] is None


async def test_setup_requires_session_and_csrf(client, identity_provider):
    assert (await client.get("/api/me/profile")).status_code == 401
    assert (await client.put("/api/me/onboarding", json={"interests": ["cafe"]})).status_code == 401
    _, headers = await credentials(client, identity_provider)
    for bad_headers in [
        {},
        {**headers, "origin": "https://other.example"},
        {**headers, "x-csrf-token": "wrong"},
    ]:
        assert (
            await client.put(
                "/api/me/onboarding", json={"interests": ["cafe"]}, headers=bad_headers
            )
        ).status_code == 403


async def test_profile_counts_only_current_account(client, identity_provider, database_factory):
    user_id, _ = await credentials(client, identity_provider)
    other, place_id = uuid4(), uuid4()
    async with database_factory() as db:
        db.add_all(
            [
                User(id=other, auth0_sub="test|other"),
                Place(id=place_id, name="Cafe", lat=43, lng=-81, category="cafe"),
            ]
        )
        await db.flush()
        db.add_all(
            [
                Experience(user_id=user_id, place_id=place_id, rating=4, visited_on=date.today()),
                Experience(user_id=other, place_id=place_id, rating=5, visited_on=date.today()),
                Bookmark(user_id=user_id, place_id=place_id),
                Follow(follower_id=user_id, followee_id=other),
            ]
        )
        await db.commit()
    profile = (await client.get("/api/me/profile")).json()
    assert (
        profile["experience_count"]
        == profile["saved_place_count"]
        == profile["following_count"]
        == 1
    )
    identity_provider.claims = {"sub": "auth0|another-account"}
    await authenticate(client, identity_provider)
    other_profile = (await client.get("/api/me/profile")).json()
    assert other_profile["interests"] == [] and other_profile["onboarding_completed_at"] is None
    assert (
        other_profile["experience_count"]
        == other_profile["saved_place_count"]
        == other_profile["following_count"]
        == 0
    )


async def test_interests_change_matching_and_keep_real_evidence(
    client, identity_provider, database_factory
):
    _, headers = await credentials(client, identity_provider)
    author, place_id, experience_id = uuid4(), uuid4(), uuid4()
    async with database_factory() as db:
        db.add_all(
            [
                User(id=author, auth0_sub="test|author", display_name="Cafe regular"),
                Place(id=place_id, name="Little Cafe", lat=43, lng=-81.2, category="cafe"),
            ]
        )
        await db.flush()
        db.add_all(
            [
                Experience(
                    id=experience_id,
                    user_id=author,
                    place_id=place_id,
                    rating=5,
                    verdict="recommend",
                    review="A lovely little cafe",
                    visited_on=date.today(),
                ),
                TasteProfile(user_id=author, category="cafe", score=1),
            ]
        )
        await db.commit()
    url = "/api/recommendations?bbox=-81.4,42.85,-81.1,43.12"
    assert (await client.get(url)).json()["items"][0]["kind"] == "explore"
    await client.put("/api/me/onboarding", json={"interests": ["cafe"]}, headers=headers)
    item = (await client.get(url)).json()["items"][0]
    assert item["kind"] == "similar_taste"
    assert item["logs"][0]["experience_id"] == str(experience_id)
    assert item["logs"][0]["relation"] == "similar_taste"
    logs = (await client.get(f"/api/places/{place_id}/logs")).json()["logs"]
    assert logs[0]["relation"] == "similar_taste"
    async with database_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Experience)) == 1
        assert await db.scalar(select(func.count()).select_from(TasteProfile)) == 1


async def test_completion_rolls_back_if_profile_read_fails(
    client, identity_provider, database_factory, monkeypatch
):
    user_id, _ = await credentials(client, identity_provider)
    async with database_factory() as db:
        service = OnboardingService(db)
        user = await db.get(User, user_id)

        async def unavailable(_):
            raise RuntimeError("failed before commit")

        monkeypatch.setattr(service, "profile", unavailable)
        with pytest.raises(RuntimeError):
            await service.complete(user, OnboardingWrite(interests=["cafe"]))
    async with database_factory() as db:
        assert (await db.get(User, user_id)).onboarding_completed_at is None
        assert await db.scalar(select(func.count()).select_from(UserInterest)) == 0


async def test_postgres_migration_and_repeated_submission(postgres_factory):
    user_id = uuid4()
    async with postgres_factory() as db:
        user = User(id=user_id, auth0_sub="test|onboarding")
        db.add(user)
        await db.commit()
        service = OnboardingService(db)
        first = await service.complete(user, OnboardingWrite(interests=["cafe", "trail"]))
        second = await service.complete(user, OnboardingWrite(interests=["park"]))
        assert first.onboarding_completed_at == second.onboarding_completed_at
        assert second.interests == ["park"]


async def test_concurrent_setup_keeps_one_complete_interest_set(postgres_factory):
    import asyncio

    user_id = uuid4()
    async with postgres_factory() as db:
        db.add(User(id=user_id, auth0_sub="test|concurrent-onboarding"))
        await db.commit()

    async def complete(categories):
        async with postgres_factory() as db:
            user = await db.get(User, user_id)
            return await OnboardingService(db).complete(user, OnboardingWrite(interests=categories))

    choices = [["cafe", "trail"], ["park"], ["museum", "gallery"]]
    results = await asyncio.gather(*(complete(categories) for categories in choices))
    assert len({result.onboarding_completed_at for result in results}) == 1
    async with postgres_factory() as db:
        final = await OnboardingService(db).profile(await db.get(User, user_id))
        assert sorted(final.interests) in [sorted(categories) for categories in choices]
        assert await db.scalar(select(func.count()).select_from(TasteProfile)) == 0
        await db.delete(await db.get(User, user_id))
        await db.commit()
        assert await db.scalar(select(func.count()).select_from(UserInterest)) == 0
