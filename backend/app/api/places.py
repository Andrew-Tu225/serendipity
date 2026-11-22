from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.integrations.google_places import GooglePlacesClient
from app.schemas.places import (
    AutocompleteQuery,
    AutocompleteResponse,
    NearbyQuery,
    NearbyResponse,
    PlaceDetails,
    PlaceId,
    PlacePhotoResponse,
)
from app.services.places import PlacesRateLimiter, PlacesService

router = APIRouter(prefix="/places", tags=["places"])


@lru_cache
def get_places_limiter() -> PlacesRateLimiter:
    return PlacesRateLimiter()


def get_places_service(
    settings: Annotated[Settings, Depends(get_settings)],
    limiter: Annotated[PlacesRateLimiter, Depends(get_places_limiter)],
) -> PlacesService:
    return PlacesService(GooglePlacesClient(settings.backend_api_key_google), limiter)


Service = Annotated[PlacesService, Depends(get_places_service)]


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete(query: Annotated[AutocompleteQuery, Query()], service: Service):
    return await service.autocomplete(query)


@router.get("/nearby", response_model=NearbyResponse)
async def nearby(query: Annotated[NearbyQuery, Query()], service: Service):
    return await service.nearby(query)


@router.get("/{place_id}", response_model=PlaceDetails)
async def details(place_id: PlaceId, session_token: UUID, service: Service):
    return await service.details(place_id, session_token)


@router.get("/{place_id}/photo", response_model=PlacePhotoResponse)
async def photo(place_id: PlaceId, service: Service):
    return await service.photo(place_id)
