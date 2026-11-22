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

    def set_character(self, user: User, character: dict[str, str]) -> None:
        user.character = character

    async def upsert_from_auth0(self, claims: dict[str, Any]) -> User:
        user, _ = await self.upsert_from_auth0_with_creation(claims)
        return user

    async def upsert_from_auth0_with_creation(self, claims: dict[str, Any]) -> tuple[User, bool]:
        profile = {
            "email": claims.get("email"),
            "email_verified": claims.get("email_verified"),
            "display_name": claims.get("name") or claims.get("nickname"),
            "picture_url": claims.get("picture"),
        }
        proposed_id = uuid4()
        statement = (
            insert(User)
            .values(id=proposed_id, auth0_sub=claims["sub"], **profile)
            .on_conflict_do_update(
                index_elements=[User.auth0_sub], set_={**profile, "updated_at": func.now()}
            )
            .returning(User)
        )
        user = (
            await self.session.scalars(statement.execution_options(populate_existing=True))
        ).one()
        return user, user.id == proposed_id
