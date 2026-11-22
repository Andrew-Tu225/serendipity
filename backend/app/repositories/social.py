"""SQL queries for social interactions. Transaction ownership stays in the service."""

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Bookmark,
    Experience,
    ExperienceBookmark,
    ExperienceComment,
    ExperienceLike,
    Follow,
    Place,
    User,
)


class SocialRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, model, identity):
        return await self.session.get(model, identity)

    async def add_relation(self, model, **values):
        insert = (
            postgresql.insert
            if self.session.get_bind().dialect.name == "postgresql"
            else sqlite.insert
        )
        await self.session.execute(insert(model).values(**values).on_conflict_do_nothing())
        return await self.session.scalar(select(model).filter_by(**values))

    async def remove_relation(self, model, **values):
        await self.session.execute(delete(model).filter_by(**values))

    async def count(self, model, *conditions):
        return await self.session.scalar(select(func.count()).select_from(model).where(*conditions))

    async def profile_stats(self, user_id: UUID):
        return (
            await self.session.execute(
                select(
                    select(func.count()).where(Experience.user_id == user_id).scalar_subquery(),
                    select(func.count()).where(Follow.followee_id == user_id).scalar_subquery(),
                    select(func.count()).where(Follow.follower_id == user_id).scalar_subquery(),
                )
            )
        ).one()

    async def search_users(self, query: str, offset: int, limit: int):
        return (
            await self.session.scalars(
                select(User)
                .where(func.lower(User.display_name).contains(query.lower(), autoescape=True))
                .order_by(func.lower(User.display_name), User.id)
                .offset(offset)
                .limit(limit)
            )
        ).all()

    async def connections(self, user_id: UUID, followers: bool, offset: int, limit: int):
        target = Follow.follower_id if followers else Follow.followee_id
        owner = Follow.followee_id if followers else Follow.follower_id
        return (
            await self.session.scalars(
                select(User)
                .join(Follow, User.id == target)
                .where(owner == user_id)
                .order_by(Follow.created_at.desc(), User.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()

    async def experiences(
        self,
        offset: int,
        limit: int,
        *,
        author_id: UUID | None = None,
        follower_id: UUID | None = None,
        experience_id: UUID | None = None,
        saved_by: UUID | None = None,
    ):
        query = (
            select(Experience, User, Place)
            .join(User, Experience.user_id == User.id)
            .join(Place, Experience.place_id == Place.id)
        )
        if author_id is not None:
            query = query.where(Experience.user_id == author_id)
        if follower_id is not None:
            query = query.where(
                Experience.user_id.in_(
                    select(Follow.followee_id).where(Follow.follower_id == follower_id)
                )
            )
        if experience_id is not None:
            query = query.where(Experience.id == experience_id)
        if saved_by is not None:
            query = (
                query.add_columns(ExperienceBookmark.created_at)
                .join(ExperienceBookmark, ExperienceBookmark.experience_id == Experience.id)
                .where(ExperienceBookmark.user_id == saved_by)
                .order_by(ExperienceBookmark.created_at.desc(), Experience.id.desc())
            )
        else:
            query = query.order_by(Experience.created_at.desc(), Experience.id.desc())
        return (await self.session.execute(query.offset(offset).limit(limit))).all()

    async def social_stats(self, ids: list[UUID], viewer_id: UUID | None):
        """A bounded batch of queries regardless of the number of Experiences on the page."""
        counts = []
        for model in (ExperienceLike, ExperienceComment):
            counts.append(
                dict(
                    (
                        await self.session.execute(
                            select(model.experience_id, func.count())
                            .where(model.experience_id.in_(ids))
                            .group_by(model.experience_id)
                        )
                    ).all()
                )
            )
        states = []
        for model in (ExperienceLike, ExperienceBookmark):
            states.append(
                set(
                    await self.session.scalars(
                        select(model.experience_id).where(
                            model.experience_id.in_(ids), model.user_id == viewer_id
                        )
                    )
                )
                if viewer_id is not None
                else set()
            )
        return *counts, *states

    async def likers(self, experience_id: UUID, offset: int, limit: int):
        return (
            await self.session.scalars(
                select(User)
                .join(ExperienceLike, ExperienceLike.user_id == User.id)
                .where(ExperienceLike.experience_id == experience_id)
                .order_by(ExperienceLike.created_at.desc(), User.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()

    async def comments(self, experience_id: UUID, offset: int, limit: int):
        return (
            await self.session.execute(
                select(ExperienceComment, User)
                .join(User, ExperienceComment.user_id == User.id)
                .where(ExperienceComment.experience_id == experience_id)
                .order_by(ExperienceComment.created_at, ExperienceComment.id)
                .offset(offset)
                .limit(limit)
            )
        ).all()

    async def add_comment(self, user_id: UUID, experience_id: UUID, body: str):
        comment = ExperienceComment(user_id=user_id, experience_id=experience_id, body=body)
        self.session.add(comment)
        await self.session.flush()
        return comment

    async def edit_comment(self, comment: ExperienceComment, body: str):
        comment.body = body
        comment.updated_at = func.now()
        await self.session.flush()
        await self.session.refresh(comment)

    async def delete_comment(self, comment: ExperienceComment):
        await self.session.delete(comment)

    async def saved_places(self, user_id: UUID, offset: int, limit: int):
        return (
            await self.session.execute(
                select(Place, Bookmark.created_at)
                .join(Bookmark, Bookmark.place_id == Place.id)
                .where(Bookmark.user_id == user_id)
                .order_by(Bookmark.created_at.desc(), Place.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
