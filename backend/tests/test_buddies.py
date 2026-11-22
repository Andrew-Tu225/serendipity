from uuid import UUID

import pytest

from app.models import TasteProfile, User
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio
API = "/api/buddies"
BOB, CASEY = UUID(int=1001), UUID(int=1002)


async def sign_in(client, identity_provider, name):
    client.cookies.clear()
    identity_provider.claims.update(sub=f"test|{name}", name=name)
    await authenticate(client, identity_provider)
    session = (await client.get("/api/auth/me")).json()
    headers = {"origin": "http://localhost:3000", "x-csrf-token": session["csrf_token"]}
    return UUID(session["user"]["id"]), headers


async def test_buddy_suggestions_rank_taste_and_remember_skips(
    client, identity_provider, database_factory
):
    assert (await client.get(f"{API}/suggestions")).status_code == 401
    alice, headers = await sign_in(client, identity_provider, "Alice")
    async with database_factory() as database:
        database.add_all(
            [
                User(id=BOB, auth0_sub="test|Bob", display_name="Bob"),
                User(id=CASEY, auth0_sub="test|Casey", display_name="Casey"),
            ]
        )
        await database.flush()
        database.add_all(
            [
                TasteProfile(user_id=alice, category="cafe", score=2),
                TasteProfile(user_id=BOB, category="cafe", score=1),
                TasteProfile(user_id=CASEY, category="park", score=1),
            ]
        )
        await database.commit()

    response = await client.get(f"{API}/suggestions")
    assert response.headers["cache-control"] == "no-store"
    assert [(row["id"], row["match_percent"]) for row in response.json()] == [
        (str(BOB), 100),
        (str(CASEY), None),
    ]
    assert (await client.put(f"{API}/skips/{BOB}")).status_code == 403
    for _ in range(2):
        assert (await client.put(f"{API}/skips/{BOB}", headers=headers)).status_code == 204
    assert [row["id"] for row in (await client.get(f"{API}/suggestions")).json()] == [str(CASEY)]


async def test_private_conversation_replies_pagination_and_idempotency(
    client, identity_provider, database_factory
):
    alice, headers = await sign_in(client, identity_provider, "Alice")
    async with database_factory() as database:
        database.add(
            User(id=BOB, auth0_sub="test|Bob", display_name="Bob", email="private@example.org")
        )
        await database.commit()

    path = f"{API}/chats/{BOB}"
    hello = {"id": str(UUID(int=70)), "body": "Want to try that café?"}
    assert (await client.get(path)).json() == {"messages": [], "next_before": None}
    assert (await client.get(f"{API}/inbox")).json()["threads"] == []
    assert (await client.post(path, json=hello)).status_code == 403
    assert (
        await client.post(path, json={**hello, "body": "  "}, headers=headers)
    ).status_code == 422
    first = await client.post(path, json=hello, headers=headers)
    assert first.status_code == 201
    assert (await client.post(path, json=hello, headers=headers)).json() == first.json()
    assert (
        await client.post(path, json={**hello, "body": "Different"}, headers=headers)
    ).status_code == 409
    assert len((await client.get(path)).json()["messages"]) == 1
    assert (await client.get(f"{API}/suggestions")).json() == []

    bob, bob_headers = await sign_in(client, identity_provider, "Bob")
    assert bob == BOB
    inbox = await client.get(f"{API}/inbox")
    assert inbox.headers["cache-control"] == "no-store"
    assert inbox.json()["threads"][0]["buddy"]["id"] == str(alice)
    assert inbox.json()["threads"][0]["latest"]["from_you"] is False
    reply = {"id": str(UUID(int=71)), "body": "I’m in!"}
    bob_chat = f"{API}/chats/{alice}"
    assert (await client.post(bob_chat, json=reply, headers=bob_headers)).status_code == 201
    newest = (await client.get(bob_chat, params={"limit": 1})).json()
    assert [row["body"] for row in newest["messages"]] == [reply["body"]]
    older = (
        await client.get(bob_chat, params={"limit": 1, "before": newest["next_before"]})
    ).json()
    assert [row["body"] for row in older["messages"]] == [hello["body"]]
    assert older["next_before"] is None

    await sign_in(client, identity_provider, "Casey")
    assert (await client.get(f"{API}/inbox")).json()["threads"] == []
    assert (await client.get(path)).json()["messages"] == []
    assert (await client.get(path, params={"before": reply["id"]})).status_code == 404
