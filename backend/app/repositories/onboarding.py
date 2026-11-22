from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bookmark, Experience, Follow, User, UserInterest
from app.models.domain import Category


class OnboardingRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def interests(self, user_id: UUID):
        return list(
            await self.session.scalars(
                select(UserInterest.category)
                .where(UserInterest.user_id == user_id)
                .order_by(UserInterest.category)
            )
        )

    async def counts(self, user_id: UUID):
        return (
            await self.session.execute(
                select(
                    select(func.count())
                    .select_from(Experience)
                    .where(Experience.user_id == user_id)
                    .scalar_subquery(),
                    select(func.count())
                    .select_from(Bookmark)
                    .where(Bookmark.user_id == user_id)
                    .scalar_subquery(),
                    select(func.count())
                    .select_from(Follow)
                    .where(Follow.follower_id == user_id)
                    .scalar_subquery(),
                )
            )
        ).one()

    async def replace_interests(self, user_id: UUID, categories: list[Category]):
        # Serialize repeated/concurrent setup submissions for the same account.
        user = (
            await self.session.scalars(
                select(User)
                .where(User.id == user_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).one()
        await self.session.execute(delete(UserInterest).where(UserInterest.user_id == user_id))
        self.session.add_all(UserInterest(user_id=user_id, category=k) for k in categories)
        if user.onboarding_completed_at is None:
            user.onboarding_completed_at = datetime.now(UTC)
        await self.session.flush()
        return user
