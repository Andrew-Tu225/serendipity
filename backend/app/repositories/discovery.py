from uuid import UUID, uuid4

from sqlalchemy import exists, func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import Experience, Follow, Place, User
from app.schemas.discovery import NewPlace
from app.schemas.recommendations import BBox


class DiscoveryRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def places_in_bounds(self, bounds: BBox, cursor: UUID | None, limit: int):
        query = select(Place).where(
            Place.lat.between(bounds.min_lat, bounds.max_lat),
            Place.lng.between(bounds.min_lng, bounds.max_lng),
            exists().where(Experience.place_id == Place.id),
        )
        if cursor is not None:
            query = query.where(Place.id > cursor)
        return (await self.session.scalars(query.order_by(Place.id).limit(limit))).all()

    async def get(self, place_id: UUID):
        return await self.session.get(Place, place_id)

    async def by_google_id(self, google_place_id: str):
        return await self.session.scalar(
            select(Place).where(Place.google_place_id == google_place_id)
        )

    async def latest_logs(self, place_ids: list[UUID]):
        # Match the recommender: one vote per author, using their most recent visit.
        ranked = (
            select(
                Experience,
                func.row_number()
                .over(
                    partition_by=(Experience.user_id, Experience.place_id),
                    order_by=(
                        Experience.visited_on.desc(),
                        Experience.created_at.desc(),
                        Experience.id.desc(),
                    ),
                )
                .label("recency"),
            )
            .where(Experience.place_id.in_(place_ids))
            .subquery()
        )
        latest = aliased(Experience, ranked)
        return (
            await self.session.execute(
                select(latest, User)
                .join(User, User.id == latest.user_id)
                .where(ranked.c.recency == 1)
                .order_by(latest.visited_on.desc(), latest.created_at.desc(), latest.id.desc())
            )
        ).all()

    async def followees(self, viewer_id: UUID | None) -> set[UUID]:
        if viewer_id is None:
            return set()
        return set(
            await self.session.scalars(
                select(Follow.followee_id).where(Follow.follower_id == viewer_id)
            )
        )

    async def create_place(self, data: NewPlace) -> Place:
        values = dict(
            id=uuid4(),
            name=data.name,
            lat=data.latitude,
            lng=data.longitude,
            category=data.category.value,
            google_place_id=data.google_place_id,
        )
        if data.google_place_id:
            # Concurrent reviews of the same provider place must converge on one app Place.
            insert = (
                postgresql.insert
                if self.session.get_bind().dialect.name == "postgresql"
                else sqlite.insert
            )
            await self.session.execute(
                insert(Place)
                .values(**values)
                .on_conflict_do_nothing(index_elements=[Place.google_place_id])
            )
            return await self.by_google_id(data.google_place_id)
        place = Place(**values)
        self.session.add(place)
        await self.session.flush()
        return place
