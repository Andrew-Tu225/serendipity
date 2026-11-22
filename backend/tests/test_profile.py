from datetime import UTC, date, datetime
from uuid import UUID

import pytest
from sqlalchemy import text

from app.models import Bookmark, Experience, Follow, Place, User
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio
PROFILE = "/api/profile/experiences"
CHARACTER = {
    "features": "feminine",
    "hairStyle": "curly",
    "hairColor": "#5a392c",
    "skinTone": "#c38963",
    "shirt": "#4e8379",
    "pants": "#4d526b",
    "shoes": "#eee8f2",
    "hat": "none",
}


async def test_profile_requires_a_session_and_empty_profiles_are_valid(client, identity_provider):
    response = await client.get(PROFILE)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"

    await authenticate(client, identity_provider)
    user_id = (await client.get("/api/auth/me")).json()["user"]["id"]
    response = await client.get(PROFILE)
    assert response.status_code == 200
    assert response.json() == {
        "user_id": user_id,
        "display_name": "Alex Example",
        "character": None,
        "total": 0,
        "follower_count": 0,
        "following_count": 0,
        "bookmark_count": 0,
        "list_count": 1,
        "favorites": [],
        "recent": [],
        "next_offset": None,
    }


async def test_profile_and_bookmarks_load_before_custom_list_migration(
    client, identity_provider, database_factory
):
    async with database_factory() as database:
        await database.execute(text("DROP TABLE profile_list_entries"))
        await database.execute(text("DROP TABLE profile_lists"))
        await database.commit()

    await authenticate(client, identity_provider)
    response = await client.get(PROFILE)
    assert response.status_code == 200
    assert response.json()["list_count"] is None
    assert response.json()["favorites"] == []
    assert (await client.get("/api/profile/connections/followers")).status_code == 200
    assert (await client.get("/api/profile/bookmarks")).json() == {
        "places": [],
        "next_offset": None,
    }

    lists = "/api/profile/lists"
    response = await client.get(lists)
    assert response.status_code == 503
    assert response.json()["detail"] == "Custom lists need the database update."
    session = (await client.get("/api/auth/me")).json()
    response = await client.post(
        lists,
        json={"id": str(UUID(int=999)), "name": "Weekend"},
        headers={"origin": "http://localhost:3000", "x-csrf-token": session["csrf_token"]},
    )
    assert response.status_code == 503


async def test_custom_lists_are_private_and_writes_can_be_retried(client, identity_provider):
    lists = "/api/profile/lists"
    list_id = str(UUID(int=1000))
    entries = f"{lists}/{list_id}/entries"
    first = {"id": str(UUID(int=1001)), "name": "Sunset hike", "location": "London, ON"}
    second = {"id": str(UUID(int=1002)), "name": "Coffee after", "location": "Market Lane"}
    data = {"id": list_id, "name": "Weekend", "first_entry": first}
    assert (await client.get(lists)).status_code == 401

    await authenticate(client, identity_provider)
    session = (await client.get("/api/auth/me")).json()
    headers = {"origin": "http://localhost:3000", "x-csrf-token": session["csrf_token"]}
    assert (await client.post(lists, json=data)).status_code == 403
    for _ in range(2):
        response = await client.post(lists, json=data, headers=headers)
        assert response.status_code == 201
        assert response.json() == {"id": list_id, "name": "Weekend", "entry_count": 1}

    for _ in range(2):
        assert (await client.post(entries, json=second, headers=headers)).status_code == 201
    assert (await client.get(PROFILE)).json()["list_count"] == 2
    assert (await client.get(lists)).json()["lists"][0]["entry_count"] == 2
    page = await client.get(f"{entries}?limit=1")
    assert page.headers["cache-control"] == "no-store"
    assert page.json() == {"entries": [first], "next_offset": 1}
    assert (await client.get(f"{entries}?offset=1")).json()["entries"] == [second]

    client.cookies.clear()
    identity_provider.claims["sub"] = "auth0|other-list-viewer"
    await authenticate(client, identity_provider)
    session = (await client.get("/api/auth/me")).json()
    headers["x-csrf-token"] = session["csrf_token"]
    assert (await client.get(lists)).json()["lists"] == []
    assert (await client.get(entries)).status_code == 404
    assert (await client.post(entries, json=second, headers=headers)).status_code == 404


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


async def test_profile_connections_keep_followers_and_following_separate(
    client, identity_provider, database_factory
):
    path = "/api/profile/connections"
    response = await client.get(f"{path}/followers")
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    await authenticate(client, identity_provider)
    viewer = UUID((await client.get("/api/auth/me")).json()["user"]["id"])
    incoming, unnamed, outgoing, unrelated = (UUID(int=value) for value in range(60, 64))
    async with database_factory() as database:
        database.add_all(
            [
                User(
                    id=incoming,
                    auth0_sub="test|incoming",
                    display_name="Elena",
                    email="private@example.org",
                    character=CHARACTER,
                ),
                User(id=unnamed, auth0_sub="test|unnamed"),
                User(id=outgoing, auth0_sub="test|outgoing", display_name="Alex"),
                User(id=unrelated, auth0_sub="test|unrelated", display_name="Other"),
            ]
        )
        await database.flush()
        database.add_all(
            [
                Follow(follower_id=incoming, followee_id=viewer),
                Follow(follower_id=unnamed, followee_id=viewer),
                Follow(follower_id=viewer, followee_id=outgoing),
                Follow(follower_id=unrelated, followee_id=incoming),
            ]
        )
        await database.commit()

    response = await client.get(f"{path}/followers", params={"limit": 1})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "people": [{"id": str(incoming), "display_name": "Elena", "character": CHARACTER}],
        "next_offset": 1,
    }
    next_page = await client.get(f"{path}/followers", params={"limit": 1, "offset": 1})
    assert next_page.json() == {
        "people": [{"id": str(unnamed), "display_name": "Serendipity user", "character": None}],
        "next_offset": None,
    }
    following = await client.get(f"{path}/following")
    assert following.json() == {
        "people": [{"id": str(outgoing), "display_name": "Alex", "character": None}],
        "next_offset": None,
    }
    assert (await client.get(f"{path}/unknown")).status_code == 422


async def test_character_save_requires_csrf_and_appears_on_public_reviews(
    client, identity_provider
):
    path = "/api/profile/character"
    assert (await client.put(path, json=CHARACTER)).status_code == 401
    await authenticate(client, identity_provider)
    session = (await client.get("/api/auth/me")).json()
    assert (await client.put(path, json=CHARACTER)).status_code == 403
    headers = {"origin": "http://localhost:3000", "x-csrf-token": session["csrf_token"]}
    assert (
        await client.put(path, json={**CHARACTER, "shirt": "url(example)"}, headers=headers)
    ).status_code == 422
    assert (await client.get(PROFILE)).json()["character"] is None

    saved = await client.put(path, json=CHARACTER, headers=headers)
    assert saved.status_code == 200
    assert saved.headers["cache-control"] == "no-store"
    assert saved.json() == CHARACTER
    assert (await client.get(PROFILE)).json()["character"] == CHARACTER

    created = await client.post(
        "/api/discovery/experiences",
        json={
            "new_place": {"name": "Tea House", "latitude": 43, "longitude": -81},
            "rating": 4,
            "visited_on": "2025-06-01",
        },
        headers=headers,
    )
    assert created.status_code == 201
    client.cookies.clear()
    logged = await client.get(f"/api/discovery/places/{created.json()['place']['id']}")
    assert logged.json()["experiences"][0]["author_character"] == CHARACTER
