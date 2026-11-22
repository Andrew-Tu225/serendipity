from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.repositories.onboarding import OnboardingRepository
from app.schemas.onboarding import MyProfile, OnboardingWrite
from app.schemas.social import UserSummary


class OnboardingService:
    def __init__(self, database: AsyncSession):
        self.database = database
        self.repository = OnboardingRepository(database)

    async def profile(self, user: User) -> MyProfile:
        experiences, saved, following = await self.repository.counts(user.id)
        return MyProfile(
            user=UserSummary(
                id=user.id,
                display_name=user.display_name or "Explorer",
                avatar_url=user.picture_url,
            ),
            interests=await self.repository.interests(user.id),
            onboarding_completed_at=user.onboarding_completed_at,
            experience_count=experiences,
            saved_place_count=saved,
            following_count=following,
        )

    async def complete(self, user: User, data: OnboardingWrite) -> MyProfile:
        try:
            user = await self.repository.replace_interests(user.id, data.interests)
            result = await self.profile(user)
            await self.database.commit()
            return result
        except Exception:
            await self.database.rollback()
            raise
