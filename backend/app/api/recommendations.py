from collections.abc import Iterable
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from fastapi.exceptions import RequestValidationError

from app.dependencies import CurrentUser, RecommendationServiceDependency, Today
from app.models import domain
from app.recommend.service import RecommendationItem, ShownLog
from app.schemas.recommendations import (
    AuthorOut,
    BBox,
    LogOut,
    PlaceLogsResponse,
    PlaceOut,
    RecommendationItemOut,
    RecommendationsResponse,
)

DEFAULT_LIMIT = 30
MAX_LIMIT = 100


def no_store(response: Response) -> None:
    """Results are per viewer and must not be cached or shared."""
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(tags=["recommendations"], dependencies=[Depends(no_store)])


def parse_bbox(
    bbox: Annotated[str, Query(description="min_lng,min_lat,max_lng,max_lat")],
) -> BBox:
    try:
        return BBox.parse(bbox)
    except ValueError as error:
        raise RequestValidationError(
            [{"loc": ("query", "bbox"), "msg": str(error), "type": "value_error"}]
        ) from error


@router.get("/recommendations", response_model=RecommendationsResponse)
async def get_recommendations(
    user: CurrentUser,
    service: RecommendationServiceDependency,
    today: Today,
    bbox: Annotated[BBox, Depends(parse_bbox)],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
) -> RecommendationsResponse:
    items = await service.recommendations(user, bbox, limit, today)
    return RecommendationsResponse(items=[item_out(item) for item in items])


@router.get("/places/{place_id}/logs", response_model=PlaceLogsResponse)
async def get_place_logs(
    place_id: str, user: CurrentUser, service: RecommendationServiceDependency
) -> PlaceLogsResponse:
    result = await service.place_logs(user, place_id)
    return PlaceLogsResponse(place=place_out(result.place), logs=logs_out(result.logs))


def item_out(item: RecommendationItem) -> RecommendationItemOut:
    return RecommendationItemOut(
        place=place_out(item.place), kind=item.kind, score=item.score, logs=logs_out(item.logs)
    )


def place_out(place: domain.Place) -> PlaceOut:
    return PlaceOut(
        id=place.id, name=place.name, lat=place.lat, lng=place.lng, category=place.category
    )


def logs_out(logs: Iterable[ShownLog]) -> list[LogOut]:
    return [
        LogOut(
            experience_id=s.experience.id,
            author=AuthorOut(
                id=s.author.id, display_name=s.author.display_name, avatar_url=s.author.avatar_url
            ),
            relation=s.relation,
            rating=s.experience.rating,
            verdict=s.experience.verdict,
            review=s.experience.review,
            photo_urls=list(s.experience.photo_urls),
            visited_on=s.experience.visited_on,
        )
        for s in logs
    ]
