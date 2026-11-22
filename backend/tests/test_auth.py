from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuthSession, User
from app.services.auth import hash_token
from tests.auth_helpers import authenticate

pytestmark = pytest.mark.anyio


async def test_login_provisions_user_and_rotates_session(
    client, identity_provider, database_factory
):
    login = await client.get("/api/auth/login")
    params = identity_provider.remember_login(login)
    temporary_cookie = client.cookies["serendipity_session"]
    cookie_header = login.headers["set-cookie"]
    assert "HttpOnly" in cookie_header and "SameSite=lax" in cookie_header
    assert "Max-Age=600" in cookie_header
    assert params["redirect_uri"] == ["http://localhost:3000/api/auth/callback"]
    assert set(params["scope"][0].split()) == {"openid", "profile", "email"}

    response = await client.get(
        "/api/auth/callback", params={"state": params["state"][0], "code": "valid-code"}
    )
    assert response.headers["location"] == "http://localhost:3000/"
    session_cookie = client.cookies["serendipity_session"]
    assert session_cookie != temporary_cookie
    assert "Max-Age=28800" in response.headers["set-cookie"]
    response = await client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["auth0"]["sub"] == data["user"]["auth0_sub"] == "auth0|test-user"
    assert data["user"]["email_verified"] is False
    assert data["user"]["display_name"] == "Alex Example"
    assert "server-only-access-token" not in response.text
    assert "id_token" not in data and "token_hash" not in response.text
    async with database_factory() as database:
        stored = await database.get(AuthSession, hash_token(session_cookie))
        assert stored and stored.user_id
        assert await database.get(AuthSession, hash_token(temporary_cookie)) is None
        assert session_cookie not in str(stored.data)
        assert "code_verifier" not in str(stored.data)


async def test_repeated_login_reuses_user_and_reads_database(
    client, identity_provider, database_factory
):
    await authenticate(client, identity_provider)
    first = (await client.get("/api/auth/me")).json()
    identity_provider.claims = {"name": "Updated Name"}
    await authenticate(client, identity_provider)
    second = (await client.get("/api/auth/me")).json()
    assert first["user"]["id"] == second["user"]["id"]
    assert second["user"]["display_name"] == "Updated Name"
    async with database_factory() as database:
        assert await database.scalar(select(func.count()).select_from(User)) == 1
        await database.execute(update(User).values(display_name="Changed in Postgres"))
        await database.commit()
    third = (await client.get("/api/auth/me")).json()
    assert third["user"]["display_name"] == "Changed in Postgres"
    assert third["auth0"]["name"] == "Updated Name"


async def test_optional_profile_fields(client, identity_provider):
    identity_provider.claims = {
        "email": None,
        "email_verified": None,
        "name": None,
        "picture": None,
    }
    await authenticate(client, identity_provider)
    user = (await client.get("/api/auth/me")).json()["user"]
    assert user["email"] is None
    assert user["email_verified"] is None
    assert user["display_name"] is None
    assert user["picture_url"] is None


@pytest.mark.parametrize(
    "claims",
    [
        {"iss": "https://attacker.example/"},
        {"aud": "another-client"},
        {"exp": 1},
        {"nonce": "wrong-nonce"},
        {"sub": ""},
    ],
)
async def test_rejects_invalid_identity(client, identity_provider, database_factory, claims):
    identity_provider.claims = claims
    login = await client.get("/api/auth/login")
    params = identity_provider.remember_login(login)
    callback = await client.get(
        "/api/auth/callback", params={"state": params["state"][0], "code": "valid-code"}
    )
    assert callback.headers["location"].endswith("/login?error=authentication_failed")
    assert (await client.get("/api/auth/me")).status_code == 401
    async with database_factory() as database:
        assert await database.scalar(select(func.count()).select_from(User)) == 0


async def test_rejects_wrong_signature(client, identity_provider):
    identity_provider.broken_signature = True
    params = identity_provider.remember_login(await client.get("/api/auth/login"))
    response = await client.get(
        "/api/auth/callback", params={"state": params["state"][0], "code": "valid-code"}
    )
    assert response.headers["location"].endswith("/login?error=authentication_failed")


async def test_rejects_wrong_state_and_consumes_attempt(client, identity_provider):
    params = identity_provider.remember_login(await client.get("/api/auth/login"))
    original_cookie = client.cookies["serendipity_session"]
    response = await client.get(
        "/api/auth/callback", params={"state": "wrong-state", "code": "valid-code"}
    )
    assert response.headers["location"].endswith("/login?error=authentication_failed")
    assert identity_provider.exchanges == 0
    client.cookies.set("serendipity_session", original_cookie)
    response = await client.get(
        "/api/auth/callback", params={"state": params["state"][0], "code": "valid-code"}
    )
    assert response.headers["location"].endswith("/login?error=authentication_failed")
    assert identity_provider.exchanges == 0


async def test_callback_replay_is_rejected(client, identity_provider):
    params = identity_provider.remember_login(await client.get("/api/auth/login"))
    original_cookie = client.cookies["serendipity_session"]
    await client.get(
        "/api/auth/callback", params={"state": params["state"][0], "code": "valid-code"}
    )
    client.cookies.clear()
    client.cookies.set("serendipity_session", original_cookie)
    response = await client.get(
        "/api/auth/callback", params={"state": params["state"][0], "code": "valid-code"}
    )
    assert response.headers["location"].endswith("/login?error=authentication_failed")
    assert identity_provider.exchanges == 1


async def test_session_expiry(client, identity_provider, database_factory):
    await authenticate(client, identity_provider)
    async with database_factory() as database:
        await database.execute(
            update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await database.commit()
    assert (await client.get("/api/auth/me")).status_code == 401


@pytest.mark.parametrize(
    "origin,csrf",
    [
        (None, None),
        ("http://localhost:3000", "wrong"),
        ("https://attacker.example", "correct"),
    ],
)
async def test_logout_requires_csrf_and_origin(client, identity_provider, origin, csrf):
    await authenticate(client, identity_provider)
    token = (await client.get("/api/auth/me")).json()["csrf_token"]
    headers = {}
    if origin:
        headers["origin"] = origin
    if csrf:
        headers["x-csrf-token"] = token if csrf == "correct" else csrf
    response = await client.post("/api/auth/logout", headers=headers)
    assert response.status_code == 403
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_logout_revokes_session(client, identity_provider):
    await authenticate(client, identity_provider)
    cookie = client.cookies["serendipity_session"]
    token = (await client.get("/api/auth/me")).json()["csrf_token"]
    response = await client.post(
        "/api/auth/logout",
        headers={
            "origin": "http://localhost:3000",
            "x-csrf-token": token,
        },
    )
    assert response.status_code == 200
    assert "Max-Age=0" in response.headers["set-cookie"]
    logout_url = urlsplit(response.json()["logout_url"])
    assert logout_url.netloc == "tenant.example.com"
    assert parse_qs(logout_url.query)["returnTo"] == ["http://localhost:3000/login"]
    client.cookies.set("serendipity_session", cookie)
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_unauthenticated_requests(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.post("/api/auth/logout")).status_code == 401


async def test_provider_unavailable(client, identity_provider):
    identity_provider.unavailable = True
    response = await client.get("/api/auth/login")
    assert response.status_code == 503
    assert "test-client-secret" not in response.text


async def test_cancel_login(client, identity_provider):
    params = identity_provider.remember_login(await client.get("/api/auth/login"))
    response = await client.get(
        "/api/auth/callback",
        params={
            "error": "access_denied",
            "state": params["state"][0],
        },
    )
    assert response.headers["location"].endswith("/login?error=authentication_failed")
    assert identity_provider.exchanges == 0


async def test_expired_login_never_exchanges_code(client, identity_provider, database_factory):
    params = identity_provider.remember_login(await client.get("/api/auth/login"))
    async with database_factory() as database:
        await database.execute(
            update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await database.commit()
    response = await client.get(
        "/api/auth/callback",
        params={
            "state": params["state"][0],
            "code": "valid-code",
        },
    )
    assert response.headers["location"].endswith("/login?error=authentication_failed")
    assert identity_provider.exchanges == 0


async def test_failed_commit_rolls_back_user_and_never_reports_success(
    client, identity_provider, database_factory, monkeypatch
):
    original_commit = AsyncSession.commit
    commits = 0

    async def failing_commit(database):
        nonlocal commits
        commits += 1
        if commits == 3:  # login state, consume state, then user + authenticated session
            raise SQLAlchemyError("simulated database write failure")
        await original_commit(database)

    monkeypatch.setattr(AsyncSession, "commit", failing_commit)
    params = identity_provider.remember_login(await client.get("/api/auth/login"))
    response = await client.get(
        "/api/auth/callback",
        params={
            "state": params["state"][0],
            "code": "valid-code",
        },
    )
    assert response.headers["location"].endswith("/login?error=authentication_unavailable")
    assert (await client.get("/api/auth/me")).status_code == 401
    async with database_factory() as database:
        assert await database.scalar(select(func.count()).select_from(User)) == 0
        assert await database.scalar(select(func.count()).select_from(AuthSession)) == 0
