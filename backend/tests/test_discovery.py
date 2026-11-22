import asyncio
from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.models import Experience, Follow, Place, TasteProfile, User
from app.schemas.discovery import ExperienceCreate
from app.services.discovery import DiscoveryService
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio
BBOX = "-79.5,43.5,-79.2,43.8"
A, B = UUID(int=101), UUID(int=102)
P1, P2, P3, OUTSIDE = [UUID(int=n) for n in range(1, 5)]


@pytest.fixture
async def records(database_factory):
    async with database_factory() as session:
        session.add_all(
            [
                User(id=A, auth0_sub="test|a", display_name="Elena"),
                User(id=B, auth0_sub="test|b", display_name="James"),
            ]
        )
        session.add_all(
            [
                Place(
                    id=P1,
                    name="Restaurant",
                    lat=43.65,
                    lng=-79.4,
                    category="restaurant",
                    google_place_id="google-restaurant",
                ),
                Place(id=P2, name="Cafe", lat=43.6, lng=-79.3, category="cafe"),
                Place(id=P3, name="Unreviewed", lat=43.65, lng=-79.4, category="park"),
                Place(id=OUTSIDE, name="Far away", lat=45, lng=-79.4, category="restaurant"),
            ]
        )
        await session.flush()
        session.add_all(
            [
                Experience(
                    user_id=A,
                    place_id=P1,
                    rating=5,
                    verdict="recommend",
                    review="Old review",
                    visited_on=date.today() - timedelta(days=2),
                ),
                Experience(
                    user_id=A,
                    place_id=P1,
                    rating=1,
                    verdict="avoid",
                    review="Not for me",
                    visited_on=date.today(),
                ),
                Experience(
                    user_id=B,
                    place_id=P1,
                    rating=4,
                    verdict="recommend",
                    review="Loved it",
                    visited_on=date.today(),
                ),
                Experience(
                    user_id=A, place_id=P2, rating=3, verdict="neutral", visited_on=date.today()
                ),
                Experience(
                    user_id=A,
                    place_id=OUTSIDE,
                    rating=5,
                    verdict="recommend",
                    visited_on=date.today(),
                ),
            ]
        )
        await session.commit()


async def test_public_bounds_include_low_ratings_and_latest_vote_only(client, records):
    response = await client.get("/api/discovery/places", params={"bbox": BBOX})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert [p["id"] for p in data["places"]] == [str(P1), str(P2)]
    restaurant = data["places"][0]
    assert restaurant["rating_summary"] == {"average": 2.5, "count": 2}
    assert restaurant["friends"] == [] and restaurant["friend_count"] == 0
    assert data["next_cursor"] is None
    details = await client.get(f"/api/discovery/places/{P1}")
    assert {e["review"] for e in details.json()["experiences"]} == {"Not for me", "Loved it"}
    assert all(not e["is_self"] and not e["is_friend"] for e in details.json()["experiences"])


async def test_friend_enrichment_uses_the_cookie_viewer(
    client, records, database_factory, identity_provider
):
    await authenticate(client, identity_provider)
    viewer_id = UUID((await client.get("/api/auth/me")).json()["user"]["id"])
    async with database_factory() as session:
        session.add(Follow(follower_id=viewer_id, followee_id=A))
        await session.commit()
    response = await client.get("/api/discovery/places", params={"bbox": BBOX})
    restaurant = response.json()["places"][0]
    assert restaurant["friend_count"] == 1
    assert restaurant["friends"][0]["author_name"] == "Elena"
    assert restaurant["friends"][0]["verdict"] == "avoid"
    assert response.headers["cache-control"] == "no-store"
    client.cookies.clear()
    client.cookies.set("serendipity_session", "expired")
    public = await client.get("/api/discovery/places", params={"bbox": BBOX})
    assert public.json()["places"][0]["friend_count"] == 0


async def test_cursor_and_review_pagination_are_complete(client, records):
    first = (await client.get("/api/discovery/places", params={"bbox": BBOX, "limit": 1})).json()
    second = (
        await client.get(
            "/api/discovery/places",
            params={"bbox": BBOX, "limit": 1, "cursor": first["next_cursor"]},
        )
    ).json()
    assert [p["id"] for p in first["places"] + second["places"]] == [str(P1), str(P2)]
    assert second["next_cursor"] is None
    page1 = (await client.get(f"/api/discovery/places/{P1}?limit=1")).json()
    page2 = (
        await client.get(f"/api/discovery/places/{P1}?limit=1&offset={page1['next_offset']}")
    ).json()
    assert page2["next_offset"] is None
    assert len({e["id"] for e in page1["experiences"] + page2["experiences"]}) == 2


@pytest.mark.parametrize(
    "params",
    [
        {"bbox": "bad"},
        {"bbox": "-79,44,-80,43"},
        {"bbox": "nan,43,10,44"},
        {"bbox": "-181,43,10,44"},
        {"bbox": BBOX, "cursor": "invalid"},
        {"bbox": BBOX, "limit": 501},
    ],
)
async def test_invalid_queries_are_rejected(client, params):
    result = await client.get("/api/discovery/places", params=params)
    assert result.status_code == 422
    assert result.headers["cache-control"] == "no-store"


async def test_provider_identity_is_exact_and_missing_places_404(client, records):
    response = await client.get("/api/discovery/places/by-google-id/google-restaurant")
    assert response.json()["id"] == str(P1)
    assert (await client.get("/api/discovery/places/by-google-id/Restaurant")).status_code == 404
    assert (await client.get(f"/api/discovery/places/{uuid4()}")).status_code == 404
    assert (await client.get("/api/discovery/places/not-a-uuid")).status_code == 422


def draft(**fields):
    return {
        "place_id": str(P1),
        "rating": 4.5,
        "review": "Worth the visit",
        "verdict": "recommend",
        "visited_on": str(date.today()),
        **fields,
    }


async def test_create_requires_auth_and_csrf(client, records, identity_provider):
    assert (await client.post("/api/discovery/experiences", json=draft())).status_code == 401
    await authenticate(client, identity_provider)
    assert (await client.post("/api/discovery/experiences", json=draft())).status_code == 403
    csrf = (await client.get("/api/auth/me")).json()["csrf_token"]
    forged = await client.post(
        "/api/discovery/experiences",
        json=draft(user_id=str(A)),
        headers={"origin": "http://localhost:3000", "x-csrf-token": csrf},
    )
    assert forged.status_code == 422
    bad_origin = await client.post(
        "/api/discovery/experiences",
        json=draft(),
        headers={"origin": "https://evil.example", "x-csrf-token": csrf},
    )
    assert bad_origin.status_code == 403


async def test_create_persists_authenticated_author_and_taste_score(
    client, records, identity_provider, database_factory
):
    await authenticate(client, identity_provider)
    identity = (await client.get("/api/auth/me")).json()
    response = await client.post(
        "/api/discovery/experiences",
        json=draft(),
        headers={"origin": "http://localhost:3000", "x-csrf-token": identity["csrf_token"]},
    )
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    own = [log for log in response.json()["experiences"] if log["is_self"]]
    assert len(own) == 1 and own[0]["author_id"] == identity["user"]["id"]
    async with database_factory() as session:
        assert await session.scalar(select(func.count()).select_from(TasteProfile)) == 1
    public = (await client.get("/api/discovery/places", params={"bbox": BBOX})).json()
    assert public["places"][0]["rating_summary"]["count"] == 3


async def test_new_places_and_provider_id_reuse(
    client, records, identity_provider, database_factory
):
    await authenticate(client, identity_provider)
    identity = (await client.get("/api/auth/me")).json()
    headers = {"origin": "http://localhost:3000", "x-csrf-token": identity["csrf_token"]}
    payload = draft()
    del payload["place_id"]
    payload["new_place"] = {
        "name": "My spot",
        "latitude": 43.66,
        "longitude": -79.39,
        "category": "restaurant",
        "google_place_id": "new-google-id",
    }
    first = await client.post("/api/discovery/experiences", json=payload, headers=headers)
    assert first.status_code == 201
    payload["new_place"]["name"] = "Do not overwrite the existing place"
    second = await client.post("/api/discovery/experiences", json=payload, headers=headers)
    assert second.status_code == 201
    assert first.json()["place"]["id"] == second.json()["place"]["id"]
    assert second.json()["place"]["name"] == "My spot"
    async with database_factory() as session:
        assert await session.scalar(select(func.count()).select_from(Place)) == 5


@pytest.mark.parametrize(
    "fields",
    [
        {"rating": 4.2},
        {"rating": 0},
        {"review": "x" * 2001},
        {"visited_on": str(date.today() + timedelta(days=1))},
        {"place_id": None},
        {"new_place": {"name": "X", "latitude": 43, "longitude": -79}},
    ],
)
async def test_bad_reviews_do_not_write(
    client, records, identity_provider, database_factory, fields
):
    await authenticate(client, identity_provider)
    csrf = (await client.get("/api/auth/me")).json()["csrf_token"]
    result = await client.post(
        "/api/discovery/experiences",
        json=draft(**fields),
        headers={"origin": "http://localhost:3000", "x-csrf-token": csrf},
    )
    assert result.status_code == 422
    async with database_factory() as session:
        assert await session.scalar(select(func.count()).select_from(Experience)) == 5


async def test_failed_taste_update_rolls_back_new_place_and_review(database_factory, monkeypatch):
    from app.repositories.experiences import TasteProfileRepository

    async def fail(*args):
        raise RuntimeError("Failed taste update")

    monkeypatch.setattr(TasteProfileRepository, "add_score", fail)
    async with database_factory() as session:
        user = User(auth0_sub="test|rollback")
        session.add(user)
        await session.commit()
        data = ExperienceCreate(
            new_place={"name": "Rollback", "latitude": 43.6, "longitude": -79.4},
            rating=4,
            visited_on=date.today(),
        )
        with pytest.raises(RuntimeError, match="Failed taste"):
            await DiscoveryService(session).create_experience(data, user)
        assert await session.scalar(select(func.count()).select_from(Place)) == 0
        assert await session.scalar(select(func.count()).select_from(Experience)) == 0


async def test_concurrent_provider_place_creation_converges(postgres_factory):
    async with postgres_factory() as session:
        user = User(auth0_sub="test|concurrent-discovery")
        session.add(user)
        await session.commit()
    data = ExperienceCreate(
        new_place={
            "name": "Shared place",
            "latitude": 43.6,
            "longitude": -79.4,
            "google_place_id": "shared-id",
        },
        rating=4,
        visited_on=date.today(),
    )

    async def write():
        async with postgres_factory() as session:
            result = await DiscoveryService(session).create_experience(data, user)
            return result.place.id

    ids = await asyncio.gather(write(), write())
    assert ids[0] == ids[1]
    async with postgres_factory() as session:
        assert await session.scalar(select(func.count()).select_from(Place)) == 1
        assert await session.scalar(select(func.count()).select_from(Experience)) == 2
