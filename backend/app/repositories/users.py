from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, user_id: UUID) -> User | None:
        return await self.session.get(User, user_id, populate_existing=True)

    async def upsert_from_auth0(self, claims: dict[str, Any]) -> User:
        profile = {
            "email": claims.get("email"),
            "email_verified": claims.get("email_verified"),
            "display_name": claims.get("name") or claims.get("nickname"),
            "picture_url": claims.get("picture"),
        }
        statement = (
            insert(User)
            .values(id=uuid4(), auth0_sub=claims["sub"], **profile)
            .on_conflict_do_update(
                index_elements=[User.auth0_sub], set_={**profile, "updated_at": func.now()}
            )
            .returning(User)
        )
        return (
            await self.session.scalars(statement.execution_options(populate_existing=True))
        ).one()
