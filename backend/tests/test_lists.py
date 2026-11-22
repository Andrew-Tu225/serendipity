from datetime import date
from uuid import UUID, uuid4

import pytest

from app.models import Experience, ExperienceList, Place, User
from app.services import lists as list_service
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio
OTHER = UUID(int=201)
PLACE = UUID(int=301)
E1, E2 = UUID(int=401), UUID(int=402)
OTHERS_LIST = UUID(int=501)


@pytest.fixture
async def records(database_factory):
    async with database_factory() as session:
        session.add(User(id=OTHER, auth0_sub="test|other", display_name="Elena"))
        session.add(Place(id=PLACE, name="Cafe", lat=43.6, lng=-79.3, category="cafe"))
        await session.flush()
        session.add_all(
            [
                Experience(
                    id=E1,
                    user_id=OTHER,
                    place_id=PLACE,
                    rating=4.5,
                    verdict="recommend",
                    review="Great pastries",
                    visited_on=date(2026, 11, 1),
                ),
                Experience(
                    id=E2, user_id=OTHER, place_id=PLACE, rating=3, visited_on=date(2026, 11, 2)
                ),
                ExperienceList(id=OTHERS_LIST, user_id=OTHER, name="Elena's picks"),
            ]
        )
        await session.commit()


async def signed_in(client, identity_provider) -> dict:
    await authenticate(client, identity_provider)
    csrf = (await client.get("/api/auth/me")).json()["csrf_token"]
    return {"origin": "http://localhost:3000", "x-csrf-token": csrf}


async def test_create_rename_and_list_own_lists(client, records, identity_provider):
    headers = await signed_in(client, identity_provider)
    created = await client.post(
        "/api/lists", json={"name": "  Date night  ", "description": "Cozy"}, headers=headers
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Date night"
    assert body["description"] == "Cozy"
    assert body["items"] == [] and body["item_count"] == 0
    assert created.headers["cache-control"] == "no-store"

    renamed = await client.patch(
        f"/api/lists/{body['id']}", json={"name": "Rainy days", "description": ""}, headers=headers
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Rainy days"
    assert renamed.json()["description"] is None

    mine = (await client.get("/api/lists")).json()["lists"]
    assert [entry["id"] for entry in mine] == [body["id"]]


async def test_experiences_are_added_once_and_removed(client, records, identity_provider):
    headers = await signed_in(client, identity_provider)
    list_id = (await client.post("/api/lists", json={"name": "Brunch"}, headers=headers)).json()[
        "id"
    ]
    url = f"/api/lists/{list_id}/experiences"
    for experience_id in (E1, E2, E1):
        response = await client.post(
            url, json={"experience_id": str(experience_id)}, headers=headers
        )
        assert response.status_code == 200
    detail = (await client.get(f"/api/lists/{list_id}")).json()
    assert detail["item_count"] == 2
    first = detail["items"][0]
    assert first["experience_id"] == str(E1)
    assert first["place_name"] == "Cafe" and first["author_name"] == "Elena"
    assert first["rating"] == 4.5 and first["review"] == "Great pastries"

    removed = await client.delete(f"{url}/{E1}", headers=headers)
    assert removed.status_code == 204
    assert (await client.delete(f"{url}/{E1}", headers=headers)).status_code == 404
    items = (await client.get(f"/api/lists/{list_id}")).json()["items"]
    assert [item["experience_id"] for item in items] == [str(E2)]


async def test_unknown_experience_and_list_return_404(client, records, identity_provider):
    headers = await signed_in(client, identity_provider)
    list_id = (await client.post("/api/lists", json={"name": "Brunch"}, headers=headers)).json()[
        "id"
    ]
    missing = await client.post(
        f"/api/lists/{list_id}/experiences", json={"experience_id": str(uuid4())}, headers=headers
    )
    assert missing.status_code == 404
    assert (await client.get(f"/api/lists/{uuid4()}")).status_code == 404


async def test_full_list_rejects_more_experiences(client, records, identity_provider, monkeypatch):
    monkeypatch.setattr(list_service, "MAX_LIST_ITEMS", 1)
    headers = await signed_in(client, identity_provider)
    list_id = (await client.post("/api/lists", json={"name": "One"}, headers=headers)).json()["id"]
    url = f"/api/lists/{list_id}/experiences"
    assert (
        await client.post(url, json={"experience_id": str(E1)}, headers=headers)
    ).status_code == 200
    full = await client.post(url, json={"experience_id": str(E2)}, headers=headers)
    assert full.status_code == 409


async def test_only_the_owner_can_change_a_list(client, records, identity_provider):
    headers = await signed_in(client, identity_provider)
    url = f"/api/lists/{OTHERS_LIST}"
    assert (await client.patch(url, json={"name": "Mine"}, headers=headers)).status_code == 403
    assert (await client.delete(url, headers=headers)).status_code == 403
    added = await client.post(
        f"{url}/experiences", json={"experience_id": str(E1)}, headers=headers
    )
    assert added.status_code == 403
    public = await client.get(url)
    assert public.status_code == 200 and public.json()["owner_name"] == "Elena"


async def test_public_reads_need_no_session(client, records):
    assert (await client.get(f"/api/lists/{OTHERS_LIST}")).status_code == 200
    lists = (await client.get(f"/api/users/{OTHER}/lists")).json()["lists"]
    assert [entry["name"] for entry in lists] == ["Elena's picks"]
    assert (await client.get("/api/lists")).status_code == 401


async def test_mutations_require_csrf(client, records, identity_provider):
    assert (await client.post("/api/lists", json={"name": "x"})).status_code == 401
    await authenticate(client, identity_provider)
    assert (await client.post("/api/lists", json={"name": "x"})).status_code == 403


async def test_delete_removes_the_list(client, records, identity_provider):
    headers = await signed_in(client, identity_provider)
    list_id = (await client.post("/api/lists", json={"name": "Temp"}, headers=headers)).json()["id"]
    await client.post(
        f"/api/lists/{list_id}/experiences", json={"experience_id": str(E1)}, headers=headers
    )
    assert (await client.delete(f"/api/lists/{list_id}", headers=headers)).status_code == 204
    assert (await client.get(f"/api/lists/{list_id}")).status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 81},
        {"name": "ok", "description": "x" * 501},
        {"name": "ok", "owner_id": str(OTHER)},
    ],
)
async def test_invalid_list_payloads_are_rejected(client, records, identity_provider, payload):
    headers = await signed_in(client, identity_provider)
    assert (await client.post("/api/lists", json=payload, headers=headers)).status_code == 422


async def test_empty_update_is_rejected(client, records, identity_provider):
    headers = await signed_in(client, identity_provider)
    list_id = (await client.post("/api/lists", json={"name": "A"}, headers=headers)).json()["id"]
    assert (
        await client.patch(f"/api/lists/{list_id}", json={}, headers=headers)
    ).status_code == 422
