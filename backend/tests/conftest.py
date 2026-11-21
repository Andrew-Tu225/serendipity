import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from time import time
from urllib.parse import parse_qs, urlsplit

import httpx2
import pytest
from httpx import ASGITransport, AsyncClient, Response
from joserfc import jwt
from joserfc.jwk import RSAKey
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings, get_settings
from app.database import Base, get_database_session
from app.integrations.auth0 import create_auth0_client, get_auth0_client
from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
def signing_key():
    return RSAKey.generate_key(parameters={"kid": "test-key"})


@dataclass
class IdentityProvider:
    key: RSAKey
    settings: Settings
    nonce: str = ""
    challenge: str = ""
    claims: dict = field(default_factory=dict)
    broken_signature: bool = False
    unavailable: bool = False
    exchanges: int = 0

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        if self.unavailable:
            return httpx2.Response(503)
        issuer = self.settings.auth0_issuer
        if request.url.path == "/.well-known/openid-configuration":
            return httpx2.Response(
                200,
                json={
                    "issuer": issuer,
                    "authorization_endpoint": f"{issuer}authorize",
                    "token_endpoint": f"{issuer}oauth/token",
                    "jwks_uri": f"{issuer}.well-known/jwks.json",
                    "id_token_signing_alg_values_supported": ["RS256"],
                    "response_types_supported": ["code"],
                    "token_endpoint_auth_methods_supported": ["client_secret_basic"],
                },
            )
        if request.url.path == "/.well-known/jwks.json":
            return httpx2.Response(200, json={"keys": [self.key.as_dict(private=False)]})
        if request.url.path == "/oauth/token":
            import base64
            import hashlib

            body = parse_qs(request.content.decode())
            assert body["code"] == ["valid-code"]
            assert request.headers["authorization"].startswith("Basic ")
            verifier = body["code_verifier"][0]
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            assert challenge.decode().rstrip("=") == self.challenge
            self.exchanges += 1
            claims = {
                "iss": issuer,
                "aud": self.settings.auth0_client_id,
                "sub": "auth0|test-user",
                "iat": int(time()),
                "exp": int(time()) + 3600,
                "nonce": self.nonce,
                "email": "alex@example.com",
                "email_verified": False,
                "name": "Alex Example",
                "picture": "https://example.com/avatar.png",
                **self.claims,
            }
            key = RSAKey.generate_key() if self.broken_signature else self.key
            encoded = jwt.encode({"alg": "RS256", "kid": "test-key"}, claims, key)
            return httpx2.Response(
                200,
                json={
                    "id_token": encoded,
                    "access_token": "server-only-access-token",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                },
            )
        raise AssertionError(f"Unexpected provider request: {request.url}")

    def remember_login(self, response: Response) -> dict:
        params = parse_qs(urlsplit(response.headers["location"]).query)
        self.nonce = params["nonce"][0]
        self.challenge = params["code_challenge"][0]
        assert params["code_challenge_method"] == ["S256"]
        return params


@pytest.fixture
async def database_factory(tmp_path) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    # Portable service/API tests; PostgreSQL-specific concurrency is tested separately.
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/test.db")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        auth0_domain="tenant.example.com",
        auth0_client_id="test-client",
        auth0_client_secret="test-client-secret",
    )


@pytest.fixture
def identity_provider(signing_key, settings):
    return IdentityProvider(signing_key, settings)


@pytest.fixture
async def client(database_factory, settings, identity_provider):
    provider = create_auth0_client(settings)
    provider.client_kwargs["transport"] = httpx2.MockTransport(identity_provider.handle)

    async def database_override():
        async with database_factory() as database:
            yield database

    app.dependency_overrides[get_database_session] = database_override
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_auth0_client] = lambda: provider
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url=settings.app_base_url
    ) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
async def postgres_factory():
    """An isolated schema; never creates or deletes application tables."""
    from uuid import uuid4

    from sqlalchemy import text

    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to run PostgreSQL integration tests")
    schema = f"test_{uuid4().hex}"
    admin = create_async_engine(url)
    async with admin.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        from alembic import command
        from alembic.config import Config

        def migrate(connection):
            config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

        async with engine.begin() as connection:
            await connection.run_sync(migrate)
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()
