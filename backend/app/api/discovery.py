from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.recommendations import parse_bbox
from app.database import get_database_session
from app.dependencies import CurrentUser, OptionalUser, VerifiedMutation
from app.schemas.discovery import DiscoveryPage, DiscoveryPlace, ExperienceCreate, PlaceExperiences
from app.schemas.places import PlaceId
from app.schemas.recommendations import BBox
from app.services.discovery import DiscoveryService

router = APIRouter(prefix="/discovery", tags=["discovery"])


def get_service(database: Annotated[AsyncSession, Depends(get_database_session)]):
    return DiscoveryService(database)


Service = Annotated[DiscoveryService, Depends(get_service)]


@router.get("/places", response_model=DiscoveryPage)
async def places(
    bounds: Annotated[BBox, Depends(parse_bbox)],
    viewer: OptionalUser,
    service: Service,
    cursor: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
):
    return await service.discover(bounds, cursor, limit, viewer)


@router.get("/places/by-google-id/{google_place_id}", response_model=DiscoveryPlace)
async def resolve(google_place_id: PlaceId, viewer: OptionalUser, service: Service):
    return await service.resolve(google_place_id, viewer)


@router.get("/places/{place_id}", response_model=PlaceExperiences)
async def details(
    place_id: UUID,
    viewer: OptionalUser,
    service: Service,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return await service.details(place_id, viewer, offset, limit)


@router.post("/experiences", response_model=PlaceExperiences, status_code=201)
async def create_experience(
    data: ExperienceCreate,
    user: CurrentUser,
    verified: VerifiedMutation,
    service: Service,
):
    return await service.create_experience(data, user)
