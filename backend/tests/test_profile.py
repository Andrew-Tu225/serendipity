from datetime import UTC, date, datetime
from uuid import UUID

import pytest

from app.models import Experience, Place, User
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
