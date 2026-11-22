from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Place


class PlaceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, place_id: UUID) -> Place | None:
        return await self.session.get(Place, place_id)
