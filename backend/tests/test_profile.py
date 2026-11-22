from datetime import UTC, date, datetime
from uuid import UUID

import pytest

from app.models import Bookmark, Experience, Follow, Place, User
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio
PROFILE = "/api/profile/experiences"


async def test_profile_requires_a_session_and_empty_profiles_are_valid(client, identity_provider):
    response = await client.get(PROFILE)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"

    await authenticate(client, identity_provider)
    response = await client.get(PROFILE)
    assert response.status_code == 200
    assert response.json() == {
        "display_name": "Alex Example",
        "total": 0,
        "follower_count": 0,
        "following_count": 0,
        "bookmark_count": 0,
        "favorites": [],
        "recent": [],
        "next_offset": None,
    }


async def test_profile_ranks_and_paginates_only_the_viewers_experiences(
    client, identity_provider, database_factory
):
    await authenticate(client, identity_provider)
    viewer_id = UUID((await client.get("/api/auth/me")).json()["user"]["id"])
    other = User(id=UUID(int=100), auth0_sub="test|someone-else")
    place = Place(id=UUID(int=10), name="Tea house", lat=43, lng=-81, category="cafe")
    async with database_factory() as database:
        database.add_all([place, other])
        await database.flush()
        for number, rating in enumerate([5, 2, 3.5, 5, 4, 1], start=1):
            database.add(
                Experience(
                    id=UUID(int=number),
                    user_id=viewer_id,
                    place_id=place.id,
                    rating=rating,
                    visited_on=date(2025, 6, 1),
                    created_at=datetime(2025, 6, number, tzinfo=UTC),
                )
            )
        database.add(
            Experience(
                id=UUID(int=100),
                user_id=other.id,
                place_id=place.id,
                rating=5,
                visited_on=date(2025, 6, 1),
                created_at=datetime(2025, 6, 10, tzinfo=UTC),
            )
        )
        await database.commit()

    response = await client.get(PROFILE)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    first = response.json()
    assert first["total"] == 6
    assert [entry["id"] for entry in first["favorites"]] == [str(UUID(int=n)) for n in [4, 1, 5, 3]]
    assert [entry["rating"] for entry in first["recent"]] == [1, 4, 5, 3.5]
    assert first["recent"][0]["rated_on"] == "2025-06-06"
    assert first["next_offset"] == 4

    last = (await client.get(PROFILE, params={"offset": first["next_offset"]})).json()
    assert [entry["rating"] for entry in last["recent"]] == [2, 5]
    assert last["next_offset"] is None


async def test_profile_bookmarks_include_only_the_viewers_places_and_locations(
    client, identity_provider, database_factory
):
    path = "/api/profile/bookmarks"
    response = await client.get(path)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    await authenticate(client, identity_provider)
    viewer = UUID((await client.get("/api/auth/me")).json()["user"]["id"])
    other, follower = UUID(int=40), UUID(int=41)
    river, cafe, private = (UUID(int=value) for value in (50, 51, 52))
    async with database_factory() as database:
        database.add_all(
            [
                User(id=other, auth0_sub="test|other"),
                User(id=follower, auth0_sub="test|follower"),
                Place(id=river, name="River Trail", lat=43.1, lng=-81.2, category="trail"),
                Place(id=cafe, name="Tea House", lat=43.2, lng=-81.3, category="cafe"),
                Place(id=private, name="Other bookmark", lat=43.3, lng=-81.4, category="cafe"),
            ]
        )
        await database.flush()
        database.add_all(
            [
                Follow(follower_id=other, followee_id=viewer),
                Follow(follower_id=follower, followee_id=viewer),
                Follow(follower_id=viewer, followee_id=other),
                Bookmark(user_id=viewer, place_id=river),
                Bookmark(user_id=viewer, place_id=cafe),
                Bookmark(user_id=other, place_id=private),
            ]
        )
        await database.commit()

    profile = (await client.get(PROFILE)).json()
    assert (profile["follower_count"], profile["following_count"], profile["bookmark_count"]) == (
        2,
        1,
        2,
    )
    response = await client.get(path, params={"limit": 1})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    first = response.json()
    assert first == {
        "places": [{"id": str(river), "name": "River Trail", "latitude": 43.1, "longitude": -81.2}],
        "next_offset": 1,
    }
    last = (await client.get(path, params={"limit": 1, "offset": 1})).json()
    assert last == {
        "places": [{"id": str(cafe), "name": "Tea House", "latitude": 43.2, "longitude": -81.3}],
        "next_offset": None,
    }
