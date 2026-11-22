from collections import defaultdict
from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.demo.london import PEOPLE, PLACES, demo_id, experiences
from app.models import Bookmark, Experience, Follow, Place, User
from app.recommend.taste import log_value
from app.repositories.demo_data import DemoDataRepository
from app.repositories.experiences import TasteProfileRepository
from app.services.sample_friends import SampleFriendsService


class DemoDataService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = DemoDataRepository(session)

    async def seed_london(self, today: date, viewer_id: UUID | None = None) -> dict[str, int]:
        if viewer_id is not None and await self.repository.user(viewer_id) is None:
            raise ValueError(
                "The supplied viewer ID does not exist. Sign in first or omit --viewer-id."
            )
        logs = experiences(today)
        user_ids = [demo_id(f"user:{name}") for name in PEOPLE]
        place_ids = [demo_id(f"place:{place.slug}") for place in PLACES]
        try:
            users = await self.repository.insert_missing(
                User,
                [
                    {
                        "id": user_ids[index],
                        "auth0_sub": f"demo:london:{name.lower()}",
                        "display_name": name,
                    }
                    for index, name in enumerate(PEOPLE)
                ],
            )
            places = await self.repository.insert_missing(
                Place,
                [
                    {
                        "id": place_ids[index],
                        "name": place.name,
                        "lat": place.lat,
                        "lng": place.lng,
                        "category": place.category.value,
                    }
                    for index, place in enumerate(PLACES)
                ],
            )
            inserted_logs = await self.repository.insert_missing(
                Experience,
                [
                    {
                        "id": UUID(log.id),
                        "user_id": UUID(log.user_id),
                        "place_id": UUID(log.place_id),
                        "rating": log.rating,
                        "verdict": log.verdict.value,
                        "value": log_value(log),
                        "review": log.review,
                        "visited_on": log.visited_on,
                        "photo_urls": [],
                    }
                    for log in logs
                ],
            )
            categories = {
                str(place_ids[index]): place.category.value for index, place in enumerate(PLACES)
            }
            scores = defaultdict(float)
            for log in logs:
                if UUID(log.id) in inserted_logs:
                    scores[(UUID(log.user_id), categories[log.place_id])] += log_value(log)
            profiles = TasteProfileRepository(self.session)
            for (user_id, category), delta in scores.items():
                await profiles.add_score(user_id, category, delta)
            follows = [
                {"follower_id": user_id, "followee_id": user_ids[(index + offset) % len(user_ids)]}
                for index, user_id in enumerate(user_ids)
                for offset in (1, 2)
            ]
            added_follows = await self.repository.insert_missing(Follow, follows)
            connected = 0
            for account_id in await self.repository.non_fixture_users(user_ids):
                connected += await SampleFriendsService(self.session).connect(account_id)
            await self.repository.refresh_labels(zip(user_ids, PEOPLE, strict=True), logs)
            bookmarks = await self.repository.insert_missing(
                Bookmark,
                [
                    {
                        "user_id": user_id,
                        "place_id": place_ids[(index * 3 + offset) % len(place_ids)],
                    }
                    for index, user_id in enumerate(user_ids)
                    for offset in (1, 3, 5)
                ],
            )
            await self.session.commit()
            return {
                "users": len(users),
                "places": len(places),
                "experiences": len(inserted_logs),
                "follows": len(added_follows) + connected,
                "bookmarks": len(bookmarks),
            }
        except Exception:
            await self.session.rollback()
            raise

    async def clear(self) -> dict[str, int]:
        try:
            counts = await self.repository.counts()
            await self.repository.clear()
            await self.session.commit()
            return counts
        except Exception:
            await self.session.rollback()
            raise
