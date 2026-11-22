from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuthSession


class SessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_active(self, token_hash: str) -> AuthSession | None:
        return await self.session.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == token_hash,
                AuthSession.expires_at > datetime.now(UTC),
            )
        )

    async def add(self, auth_session: AuthSession) -> None:
        self.session.add(auth_session)
        await self.session.flush()

    async def consume_login(self, token_hash: str) -> dict | None:
        # DELETE ... RETURNING makes callback consumption atomic across workers.
        return await self.session.scalar(
            delete(AuthSession)
            .where(
                AuthSession.token_hash == token_hash,
                AuthSession.user_id.is_(None),
                AuthSession.expires_at > datetime.now(UTC),
            )
            .returning(AuthSession.data)
        )

    async def delete(self, token_hash: str) -> None:
        await self.session.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash))

    async def delete_expired(self) -> None:
        await self.session.execute(
            delete(AuthSession).where(AuthSession.expires_at <= datetime.now(UTC))
        )
