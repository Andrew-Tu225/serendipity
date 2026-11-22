"""Explicit local-fixture relationships; the caller owns commit/rollback."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.demo.london import PEOPLE, demo_id
from app.models import Follow
from app.repositories.demo_data import DemoDataRepository

logger = logging.getLogger(__name__)
SAMPLE_FRIEND_IDS = tuple(demo_id(f"user:{name}") for name in PEOPLE[:6])


class SampleFriendsService:
    def __init__(self, session: AsyncSession):
        self.repository = DemoDataRepository(session)

    async def connect(self, user_id: UUID) -> int:
        friends = await self.repository.existing_users(SAMPLE_FRIEND_IDS)
        if len(friends) != len(SAMPLE_FRIEND_IDS):
            logger.warning("Local sample friends are incomplete; run npm run db:seed")
        rows = [
            {"follower_id": follower, "followee_id": followee}
            for friend_id in friends
            if friend_id != user_id
            for follower, followee in ((user_id, friend_id), (friend_id, user_id))
        ]
        return len(await self.repository.insert_missing(Follow, rows))
