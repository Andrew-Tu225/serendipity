from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, func, select

from app.models import (
    Bookmark,
    Experience,
    ExperienceBookmark,
    ExperienceComment,
    ExperienceLike,
    Follow,
    Place,
    TasteProfile,
    User,
)
from app.repositories.social import SocialRepository
from app.schemas.social import PlaceBookmarkCreate
from app.services.social import SocialService
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio
A, B, C = [UUID(int=n) for n in (101, 102, 103)]
P, Q = UUID(int=201), UUID(int=202)
E1, E2, E3 = [UUID(int=n) for n in (301, 302, 303)]
NEW_PLACE = {
    "name": "Quiet spot",
    "latitude": 43.6,
    "longitude": -79.4,
    "category": "park",
    "google_place_id": "quiet-spot",
}


@pytest.fixture
async def records(database_factory):
    async with database_factory() as session:
        session.add_all(
            [
                User(id=A, auth0_sub="test|a", display_name="Alex", email="private@example.com"),
                User(
                    id=B,
                    auth0_sub="test|b",
                    display_name="alex",
                    picture_url="https://example.com/a.png",
                ),
                User(id=C, auth0_sub="test|c", display_name="100%_local"),
                Place(id=P, name="Cafe", lat=43.6, lng=-79.4, category="cafe"),
                Place(id=Q, name="Park", lat=43.6, lng=-79.4, category="park"),
            ]
        )
        await session.flush()
        published = datetime(2026, 10, 1, tzinfo=UTC)
        session.add_all(
            [
                Experience(
                    id=E1,
                    user_id=A,
                    place_id=P,
                    rating=5,
                    verdict="recommend",
                    review="First publication",
                    visited_on=date(2026, 9, 20),
                    created_at=published,
                ),
                Experience(
                    id=E2,
                    user_id=A,
                    place_id=P,
                    rating=4,
                    verdict="recommend",
                    review="Published later about an older visit",
                    visited_on=date(2026, 9, 1),
                    created_at=published + timedelta(days=1),
                ),
                Experience(
                    id=E3,
                    user_id=B,
                    place_id=Q,
                    rating=3,
                    verdict="neutral",
                    visited_on=date(2026, 9, 1),
                    created_at=published + timedelta(days=1),
                ),
            ]
        )
        await session.commit()


@pytest.fixture
async def actor(client, identity_provider, records):
    await authenticate(client, identity_provider)
    identity = (await client.get("/api/auth/me")).json()
    return UUID(identity["user"]["id"]), {
        "origin": "http://localhost:3000",
        "x-csrf-token": identity["csrf_token"],
    }


async def test_public_reads_have_safe_shapes_and_anonymous_flags(client, records):
    profile = await client.get(f"/api/users/{A}")
    assert profile.status_code == 200
    assert profile.json() == {
        "id": str(A),
        "display_name": "Alex",
        "avatar_url": None,
        "character": None,
        "experience_count": 2,
        "follower_count": 0,
        "following_count": 0,
        "is_following": False,
        "follows_you": False,
        "is_self": False,
    }
    response = await client.get(f"/api/experiences/{E1}")
    assert response.status_code == 200
    assert response.json()["author"] == {
        "id": str(A),
        "display_name": "Alex",
        "avatar_url": None,
        "character": None,
    }
    assert response.json()["place"]["id"] == str(P)
    assert response.json()["like_count"] == response.json()["comment_count"] == 0
    assert not response.json()["is_liked"] and not response.json()["is_bookmarked"]
    assert not {"email", "auth0_sub", "email_verified"}.intersection(response.json()["author"])
    for path in (
        f"/api/users/{A}/followers",
        f"/api/users/{A}/following",
        f"/api/experiences/{E1}/likes",
        f"/api/experiences/{E1}/comments",
    ):
        result = await client.get(path)
        assert result.status_code == 200 and result.json() == {"items": [], "next_offset": None}
        assert result.headers["cache-control"] == "no-store"
    client.cookies.set("serendipity_session", "expired")
    assert (await client.get(f"/api/users/{A}")).json()["is_following"] is False


async def test_search_literal_case_insensitive_and_paginated(client, records):
    first = (await client.get("/api/users", params={"query": " ALEX ", "limit": 1})).json()
    second = (
        await client.get(
            "/api/users", params={"query": "alex", "limit": 1, "offset": first["next_offset"]}
        )
    ).json()
    assert [u["id"] for u in first["items"] + second["items"]] == [str(A), str(B)]
    assert second["next_offset"] is None
    assert (await client.get("/api/users", params={"query": "%_"})).json()["items"][0]["id"] == str(
        C
    )
    assert (await client.get("/api/users", params={"query": "nobody"})).json()["items"] == []


async def test_follow_profile_counts_lists_and_feed(client, actor, database_factory):
    user_id, headers = actor
    assert (await client.get("/api/feed")).json()["items"] == []
    for _ in range(2):
        follow = await client.put(f"/api/users/{A}/follow", headers=headers)
        assert follow.status_code == 200 and follow.json()["is_following"] is True
    async with database_factory() as session:
        session.add(Follow(follower_id=A, followee_id=user_id))
        await session.commit()
    profile = (await client.get(f"/api/users/{A}")).json()
    assert profile["follower_count"] == 1 and profile["following_count"] == 1
    assert profile["is_following"] and profile["follows_you"] and not profile["is_self"]
    assert (await client.get(f"/api/users/{user_id}")).json()["is_self"]
    assert (await client.get(f"/api/users/{A}/followers")).json()["items"][0]["id"] == str(user_id)
    assert (await client.get(f"/api/users/{user_id}/following")).json()["items"][0]["id"] == str(A)
    first = (await client.get("/api/feed?limit=1")).json()
    second = (await client.get(f"/api/feed?limit=1&offset={first['next_offset']}")).json()
    assert [e["id"] for e in first["items"] + second["items"]] == [str(E2), str(E1)]
    assert second["next_offset"] is None
    history = (await client.get(f"/api/users/{A}/experiences")).json()["items"]
    assert [e["id"] for e in history] == [str(E2), str(E1)]
    assert (await client.put(f"/api/users/{user_id}/follow", headers=headers)).status_code == 422
    for _ in range(2):
        assert (await client.delete(f"/api/users/{A}/follow", headers=headers)).status_code == 204
    assert (await client.get("/api/feed")).json()["items"] == []
    assert (await client.get(f"/api/users/{A}")).json()["follower_count"] == 0


async def test_like_and_separate_private_saves_lifecycle(client, actor, database_factory):
    user_id, headers = actor
    for _ in range(2):
        liked = await client.put(f"/api/experiences/{E1}/like", headers=headers)
        assert liked.status_code == 200 and liked.json()["like_count"] == 1
        saved = await client.put(f"/api/me/bookmarks/experiences/{E1}", headers=headers)
        assert saved.status_code == 200 and saved.json()["experience"]["is_bookmarked"]
    saved_at = saved.json()["saved_at"]
    detail = (await client.get(f"/api/experiences/{E1}")).json()
    assert detail["is_liked"] and detail["is_bookmarked"] and detail["like_count"] == 1
    assert (await client.get(f"/api/experiences/{E1}/likes")).json()["items"][0]["id"] == str(
        user_id
    )
    assert (await client.get("/api/me/bookmarks/places")).json()["items"] == []
    for _ in range(2):
        place = await client.post(
            "/api/me/bookmarks/places", json={"place_id": str(P)}, headers=headers
        )
        assert place.status_code == 200 and place.json()["place"]["id"] == str(P)
    assert (await client.get("/api/me/bookmarks/experiences")).json()["items"][0][
        "saved_at"
    ] == saved_at
    assert (await client.get("/api/me/bookmarks/places")).json()["items"][0]["place"]["id"] == str(
        P
    )
    async with database_factory() as session:
        assert await session.scalar(select(func.count()).select_from(TasteProfile)) == 0
        assert await session.scalar(select(func.count()).select_from(Bookmark)) == 1
        assert await session.scalar(select(func.count()).select_from(ExperienceBookmark)) == 1
    for _ in range(2):
        assert (
            await client.delete(f"/api/me/bookmarks/experiences/{E1}", headers=headers)
        ).status_code == 204
        assert (
            await client.delete(f"/api/experiences/{E1}/like", headers=headers)
        ).status_code == 204
    assert len((await client.get("/api/me/bookmarks/places")).json()["items"]) == 1
    for _ in range(2):
        assert (
            await client.delete(f"/api/me/bookmarks/places/{P}", headers=headers)
        ).status_code == 204
    detail = (await client.get(f"/api/experiences/{E1}")).json()
    assert not detail["is_liked"] and not detail["is_bookmarked"] and detail["like_count"] == 0


async def test_saves_are_viewer_scoped_and_not_exposed_publicly(client, actor, database_factory):
    _, headers = actor
    async with database_factory() as session:
        session.add_all(
            [ExperienceBookmark(user_id=A, experience_id=E1), Bookmark(user_id=A, place_id=P)]
        )
        await session.commit()
    assert (await client.get("/api/me/bookmarks/experiences")).json()["items"] == []
    assert (await client.get("/api/me/bookmarks/places")).json()["items"] == []
    assert not (await client.get(f"/api/experiences/{E1}")).json()["is_bookmarked"]
    assert (
        await client.delete(f"/api/me/bookmarks/places/{P}", headers=headers)
    ).status_code == 204
    async with database_factory() as session:
        assert await session.get(Bookmark, (A, P)) is not None
    client.cookies.clear()
    assert not (await client.get(f"/api/experiences/{E1}")).json()["is_bookmarked"]
    assert (await client.get(f"/api/users/{A}/bookmarks")).status_code == 404


async def test_save_new_place_deduplicates_without_creating_review(client, actor, database_factory):
    _, headers = actor
    first = await client.post(
        "/api/me/bookmarks/places", json={"new_place": NEW_PLACE}, headers=headers
    )
    assert first.status_code == 200
    second = await client.post(
        "/api/me/bookmarks/places",
        json={"new_place": {**NEW_PLACE, "name": "Other"}},
        headers=headers,
    )
    assert second.json() == first.json()
    async with database_factory() as session:
        assert await session.scalar(select(func.count()).select_from(Place)) == 3
        assert await session.scalar(select(func.count()).select_from(Experience)) == 3
        assert await session.scalar(select(func.count()).select_from(Bookmark)) == 1
    discovery = (await client.get("/api/discovery/places?bbox=-80,43,-79,44")).json()
    assert first.json()["place"]["id"] not in [p["id"] for p in discovery["places"]]


async def test_comments_create_edit_delete_and_ownership(client, actor, database_factory):
    user_id, headers = actor
    created = await client.post(
        f"/api/experiences/{E1}/comments", json={"body": " Nice! "}, headers=headers
    )
    assert created.status_code == 201
    body = created.json()
    assert body["body"] == "Nice!" and body["author"]["id"] == str(user_id)
    edited = await client.patch(
        f"/api/comments/{body['id']}", json={"body": "Updated"}, headers=headers
    )
    assert edited.status_code == 200 and edited.json()["body"] == "Updated"
    assert edited.json()["created_at"] == body["created_at"]
    assert edited.json()["updated_at"] >= body["updated_at"]
    async with database_factory() as session:
        foreign = ExperienceComment(user_id=A, experience_id=E1, body="Mine")
        session.add(foreign)
        await session.commit()
        foreign_id = foreign.id
    assert (
        await client.patch(f"/api/comments/{foreign_id}", json={"body": "Stolen"}, headers=headers)
    ).status_code == 403
    assert (await client.delete(f"/api/comments/{foreign_id}", headers=headers)).status_code == 403
    assert (await client.get(f"/api/experiences/{E1}")).json()["comment_count"] == 2
    assert (await client.delete(f"/api/comments/{body['id']}", headers=headers)).status_code == 204
    assert (await client.get(f"/api/experiences/{E1}")).json()["comment_count"] == 1
    assert (await client.delete(f"/api/comments/{body['id']}", headers=headers)).status_code == 404
    client.cookies.clear()
    comments = (await client.get(f"/api/experiences/{E1}/comments")).json()["items"]
    assert comments[0]["body"] == "Mine"


MUTATIONS = [
    ("PUT", f"/api/users/{A}/follow", None),
    ("DELETE", f"/api/users/{A}/follow", None),
    ("PUT", f"/api/experiences/{E1}/like", None),
    ("DELETE", f"/api/experiences/{E1}/like", None),
    ("POST", f"/api/experiences/{E1}/comments", {"body": "Test"}),
    ("PATCH", f"/api/comments/{E1}", {"body": "Test"}),
    ("DELETE", f"/api/comments/{E1}", None),
    ("PUT", f"/api/me/bookmarks/experiences/{E1}", None),
    ("DELETE", f"/api/me/bookmarks/experiences/{E1}", None),
    ("POST", "/api/me/bookmarks/places", {"place_id": str(P)}),
    ("DELETE", f"/api/me/bookmarks/places/{P}", None),
]


@pytest.mark.parametrize("method,path,payload", MUTATIONS)
async def test_every_mutation_requires_session_csrf_and_origin(
    client, records, identity_provider, method, path, payload
):
    assert (await client.request(method, path, json=payload)).status_code == 401
    await authenticate(client, identity_provider)
    assert (await client.request(method, path, json=payload)).status_code == 403
    csrf = (await client.get("/api/auth/me")).json()["csrf_token"]
    result = await client.request(
        method, path, json=payload, headers={"x-csrf-token": csrf, "origin": "https://evil.example"}
    )
    assert result.status_code == 403 and result.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "path", ["/api/feed", "/api/me/bookmarks/places", "/api/me/bookmarks/experiences"]
)
async def test_private_reads_require_login(client, path):
    result = await client.get(path)
    assert result.status_code == 401 and result.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("body", ["", " \t\n ", "x" * 2001])
async def test_invalid_comment_bodies_do_not_write(client, actor, database_factory, body):
    _, headers = actor
    response = await client.post(
        f"/api/experiences/{E1}/comments", json={"body": body}, headers=headers
    )
    assert response.status_code == 422
    async with database_factory() as session:
        assert await session.scalar(select(func.count()).select_from(ExperienceComment)) == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"place_id": str(P), "new_place": NEW_PLACE},
        {"place_id": "bad"},
        {"new_place": {**NEW_PLACE, "latitude": 91}},
        {"new_place": {**NEW_PLACE, "name": " "}},
        {"place_id": str(P), "user_id": str(A)},
    ],
)
async def test_invalid_place_bookmarks_are_rejected(client, actor, payload):
    _, headers = actor
    assert (
        await client.post("/api/me/bookmarks/places", json=payload, headers=headers)
    ).status_code == 422


async def test_comment_author_cannot_be_forged(client, actor):
    _, headers = actor
    response = await client.post(
        f"/api/experiences/{E1}/comments",
        json={"body": "Forged", "user_id": str(A)},
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.parametrize("suffix", ["", "/experiences", "/followers", "/following"])
async def test_unknown_users_are_404(client, suffix):
    result = await client.get(f"/api/users/{uuid4()}{suffix}")
    assert result.status_code == 404 and result.headers["cache-control"] == "no-store"


async def test_unknown_mutation_targets_are_404(client, actor):
    _, headers = actor
    missing = uuid4()
    for method, path, payload in MUTATIONS:
        path = (
            path.replace(str(A), str(missing))
            .replace(str(E1), str(missing))
            .replace(str(P), str(missing))
        )
        if path == "/api/me/bookmarks/places":
            payload = {"place_id": str(missing)}
        response = await client.request(method, path, json=payload, headers=headers)
        assert response.status_code == 404, (method, path, response.text)


@pytest.mark.parametrize(
    "path",
    [
        "/api/users?query=x",
        "/api/users?query=" + "x" * 101,
        "/api/users?query=%20%20",
        f"/api/users/{A}/experiences?offset=-1",
        f"/api/users/{A}/followers?limit=101",
        f"/api/experiences/{E1}/likes?limit=0",
        f"/api/experiences/{E1}/comments?offset=-1",
        "/api/experiences/bad",
        "/api/users/bad",
    ],
)
async def test_invalid_public_queries_are_422(client, path):
    result = await client.get(path)
    assert result.status_code == 422 and result.headers["cache-control"] == "no-store"


async def test_atomic_new_place_save_rolls_back_on_failure(actor, database_factory, monkeypatch):
    user_id, _ = actor

    async def fail(*args, **kwargs):
        raise RuntimeError("Failed bookmark")

    monkeypatch.setattr(SocialRepository, "add_relation", fail)
    async with database_factory() as session:
        user = await session.get(User, user_id)
        with pytest.raises(RuntimeError, match="Failed bookmark"):
            await SocialService(session).save_place(user, PlaceBookmarkCreate(new_place=NEW_PLACE))
        assert await session.scalar(select(func.count()).select_from(Place)) == 2


async def test_follows_and_place_saves_affect_recommendations(client, actor):
    _, headers = actor
    path = "/api/recommendations?bbox=-80,43,-79,44"
    await client.put(f"/api/users/{A}/follow", headers=headers)
    items = (await client.get(path)).json()["items"]
    assert next(i for i in items if i["place"]["id"] == str(P))["kind"] == "friend"
    await client.put(f"/api/experiences/{E1}/like", headers=headers)
    await client.post(f"/api/experiences/{E1}/comments", json={"body": "Great"}, headers=headers)
    await client.put(f"/api/me/bookmarks/experiences/{E1}", headers=headers)
    assert str(P) in [i["place"]["id"] for i in (await client.get(path)).json()["items"]]
    await client.post("/api/me/bookmarks/places", json={"place_id": str(P)}, headers=headers)
    assert str(P) not in [i["place"]["id"] for i in (await client.get(path)).json()["items"]]
    await client.delete(f"/api/me/bookmarks/places/{P}", headers=headers)
    await client.delete(f"/api/users/{A}/follow", headers=headers)
    assert (
        next(i for i in (await client.get(path)).json()["items"] if i["place"]["id"] == str(P))[
            "kind"
        ]
        == "explore"
    )


async def test_social_enrichment_queries_do_not_grow_per_review(actor, database_factory):
    user_id, _ = actor
    engine = database_factory.kw["bind"].sync_engine
    statements = []

    def record(*args):
        statements.append(args[2])

    event.listen(engine, "before_cursor_execute", record)
    try:
        async with database_factory() as session:
            user = await session.get(User, user_id)
            session.add_all(
                [
                    Experience(user_id=A, place_id=P, rating=4, visited_on=date.today())
                    for _ in range(5)
                ]
            )
            await session.commit()
            service = SocialService(session)
            statements.clear()
            await service.experiences(user, 0, 1, author_id=A)
            small = len(statements)
            statements.clear()
            await service.experiences(user, 0, 100, author_id=A)
            assert len(statements) == small
    finally:
        event.remove(engine, "before_cursor_execute", record)


@pytest.mark.parametrize(
    "collection",
    ["followers", "following", "likes", "comments", "saved_places", "saved_experiences"],
)
async def test_collection_pagination_with_timestamp_ties(
    client, actor, database_factory, collection
):
    user_id, _ = actor
    tied = datetime(2026, 10, 2, tzinfo=UTC)
    async with database_factory() as session:
        for other in (A, B):
            session.add_all(
                [
                    Follow(follower_id=user_id, followee_id=other, created_at=tied),
                    Follow(follower_id=other, followee_id=user_id, created_at=tied),
                    ExperienceLike(user_id=other, experience_id=E1, created_at=tied),
                    ExperienceComment(
                        id=other, user_id=other, experience_id=E1, body="Comment", created_at=tied
                    ),
                ]
            )
        for place_id in (P, Q):
            session.add(Bookmark(user_id=user_id, place_id=place_id, created_at=tied))
        for experience_id in (E1, E2):
            session.add(
                ExperienceBookmark(user_id=user_id, experience_id=experience_id, created_at=tied)
            )
        await session.commit()
    paths = {
        "followers": f"/api/users/{user_id}/followers",
        "following": f"/api/users/{user_id}/following",
        "likes": f"/api/experiences/{E1}/likes",
        "comments": f"/api/experiences/{E1}/comments",
        "saved_places": "/api/me/bookmarks/places",
        "saved_experiences": "/api/me/bookmarks/experiences",
    }
    first = (await client.get(paths[collection], params={"limit": 1})).json()
    assert first["next_offset"] == 1
    second = (await client.get(paths[collection], params={"limit": 1, "offset": 1})).json()
    assert second["next_offset"] is None

    def identity(item):
        return item.get("place", item.get("experience", item))["id"]

    actual = [identity(item) for item in first["items"] + second["items"]]
    expected = (
        (P, Q)
        if collection == "saved_places"
        else ((E1, E2) if collection == "saved_experiences" else (A, B))
    )
    if collection != "comments":
        expected = tuple(reversed(expected))
    assert actual == [str(value) for value in expected]


async def test_database_failures_are_sanitized_and_not_cached(client, records, monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError

    async def unavailable(*args, **kwargs):
        raise SQLAlchemyError("Sensitive connection details")

    monkeypatch.setattr(SocialRepository, "get", unavailable)
    result = await client.get(f"/api/users/{A}")
    assert result.status_code == 503
    assert result.json() == {"detail": "Database is unavailable"}
    assert result.headers["cache-control"] == "no-store"


async def test_public_profile_and_history_share_character_without_private_fields(
    client, records, database_factory
):
    appearance = {
        "features": "feminine",
        "hairStyle": "curly",
        "hairColor": "#211d20",
        "skinTone": "#dca985",
        "shirt": "#8664a0",
        "pants": "#4d526b",
        "shoes": "#eee8f2",
        "hat": "none",
    }
    async with database_factory() as session:
        user = await session.get(User, A)
        user.character = appearance
        await session.commit()
    profile = await client.get(f"/api/users/{A}")
    history = await client.get(f"/api/users/{A}/experiences")
    assert profile.json()["character"] == appearance
    assert all(row["author"]["character"] == appearance for row in history.json()["items"])
    assert profile.headers["cache-control"] == "no-store"
    for response in (profile, history):
        assert "private@example.com" not in response.text
        assert "test|a" not in response.text
        assert "email" not in response.text
