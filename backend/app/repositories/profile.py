from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bookmark, Follow, Place, User


class ProfileRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def counts(self, user_id: UUID) -> tuple[int, int, int]:
        statement = select(
            select(func.count()).where(Follow.followee_id == user_id).scalar_subquery(),
            select(func.count()).where(Follow.follower_id == user_id).scalar_subquery(),
            select(func.count()).where(Bookmark.user_id == user_id).scalar_subquery(),
        )
        followers, following, bookmarks = (await self.session.execute(statement)).one()
        return followers, following, bookmarks

    async def bookmarked_places(self, user_id: UUID, offset: int, limit: int) -> Sequence[Place]:
        statement = (
            select(Place)
            .join(Bookmark, Place.id == Bookmark.place_id)
            .where(Bookmark.user_id == user_id)
            .order_by(Bookmark.created_at.desc(), Bookmark.place_id)
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.scalars(statement)).all()

    async def connections(
        self, user_id: UUID, *, followers: bool, offset: int, limit: int
    ) -> Sequence[User]:
        owner, person = (
            (Follow.followee_id, Follow.follower_id)
            if followers
            else (
                Follow.follower_id,
                Follow.followee_id,
            )
        )
        statement = (
            select(User)
            .join(Follow, User.id == person)
            .where(owner == user_id)
            .order_by(Follow.created_at.desc(), User.id)
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.scalars(statement)).all()
