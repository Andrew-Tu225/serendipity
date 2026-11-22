import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import AuthSession, User
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.schemas.auth import SessionResponse, UserResponse


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AuthService:
    def __init__(self, database: AsyncSession, settings: Settings):
        self.database = database
        self.settings = settings
        self.users = UserRepository(database)
        self.sessions = SessionRepository(database)

    def cookie_token(self, request: Request) -> str:
        token = request.cookies.get(self.settings.session_cookie_name, "")
        if not token or len(token) > 128:
            raise HTTPException(401, "Sign in to continue")
        return token

    async def start_login(self, request: Request, provider: Any):
        # Authlib's request.session contains only transient OIDC state, stored in Postgres.
        request.scope["session"] = {}
        response = await provider.authorize_redirect(
            request, f"{self.settings.app_base_url}/api/auth/callback"
        )
        raw_token = secrets.token_urlsafe(32)
        old_token = request.cookies.get(self.settings.session_cookie_name)
        if old_token:
            await self.sessions.delete(hash_token(old_token))
        await self.sessions.delete_expired()
        await self.sessions.add(
            AuthSession(
                token_hash=hash_token(raw_token),
                data=request.session,
                expires_at=datetime.now(UTC)
                + timedelta(seconds=self.settings.login_lifetime_seconds),
            )
        )
        await self.database.commit()
        return response, raw_token

    async def finish_login(self, request: Request, provider: Any) -> str:
        token = self.cookie_token(request)
        state = await self.sessions.consume_login(hash_token(token))
        # Consume before the network exchange so a callback can never be replayed.
        await self.database.commit()
        if not state:
            raise HTTPException(400, "Login has expired or was already used")
        request.scope["session"] = state
        token_response = await provider.authorize_access_token(
            request,
            leeway=30,
            claims_options={
                "iss": {"essential": True, "value": self.settings.auth0_issuer},
                "aud": {"essential": True, "value": self.settings.auth0_client_id},
                "sub": {"essential": True},
                "exp": {"essential": True},
            },
        )
        claims = dict(token_response.get("userinfo") or {})
        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise HTTPException(400, "Auth0 did not return a valid identity")
        if len(claims["sub"]) > 255:
            raise HTTPException(400, "Auth0 returned an invalid subject")
        user, created = await self.users.upsert_from_auth0_with_creation(claims)
        if created and self.settings.local_sample_friends_enabled:
            from app.services.sample_friends import SampleFriendsService

            await SampleFriendsService(self.database).connect(user.id)
        raw_token = secrets.token_urlsafe(32)
        await self.sessions.add(
            AuthSession(
                token_hash=hash_token(raw_token),
                user_id=user.id,
                data={"auth0": claims},
                csrf_token=secrets.token_urlsafe(32),
                expires_at=datetime.now(UTC)
                + timedelta(seconds=self.settings.session_lifetime_seconds),
            )
        )
        await self.database.commit()
        return raw_token

    async def current_session(self, request: Request) -> AuthSession:
        auth_session = await self.sessions.get_active(hash_token(self.cookie_token(request)))
        if not auth_session or not auth_session.user_id:
            raise HTTPException(401, "Sign in to continue")
        return auth_session

    async def current_user(self, request: Request) -> User:
        auth_session = await self.current_session(request)
        user = await self.users.get(auth_session.user_id)
        if user is None:
            raise HTTPException(401, "Sign in to continue")
        return user

    async def get_session(self, request: Request) -> SessionResponse:
        auth_session = await self.current_session(request)
        user = await self.users.get(auth_session.user_id)
        if user is None or not auth_session.csrf_token:
            raise HTTPException(401, "Sign in to continue")
        return SessionResponse(
            auth0=auth_session.data["auth0"],
            user=UserResponse.model_validate(user),
            csrf_token=auth_session.csrf_token,
        )

    async def validate_csrf(self, request: Request) -> AuthSession:
        auth_session = await self.current_session(request)
        csrf_token = request.headers.get("x-csrf-token", "")
        if (
            request.headers.get("origin") != self.settings.app_base_url
            or not csrf_token
            or not secrets.compare_digest(csrf_token, auth_session.csrf_token or "")
        ):
            raise HTTPException(403, "Request verification failed")
        return auth_session

    async def logout(self, request: Request) -> str:
        auth_session = await self.validate_csrf(request)
        await self.sessions.delete(auth_session.token_hash)
        await self.database.commit()
        parameters = urlencode(
            {
                "client_id": self.settings.auth0_client_id,
                "returnTo": f"{self.settings.app_base_url}/login",
            }
        )
        return f"{self.settings.auth0_issuer}v2/logout?{parameters}"
