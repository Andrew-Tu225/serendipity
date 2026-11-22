"""Request and response shapes for docs/recommendations.md section 3."""

from datetime import date
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.models.domain import Category, Verdict
from app.recommend.service import PinKind, Relation

BBOX_PARTS = 4


class BBox(BaseModel):
    model_config = ConfigDict(frozen=True)

    min_lng: float = Field(ge=-180, le=180)
    min_lat: float = Field(ge=-90, le=90)
    max_lng: float = Field(ge=-180, le=180)
    max_lat: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def _min_below_max(self) -> Self:
        if self.min_lng >= self.max_lng or self.min_lat >= self.max_lat:
            raise ValueError("bbox minimums must be below maximums")
        return self

    @classmethod
    def parse(cls, text: str) -> Self:
        """Parse `min_lng,min_lat,max_lng,max_lat`; raises ValueError when malformed."""
        parts = text.split(",")
        if len(parts) != BBOX_PARTS:
            raise ValueError("bbox must be min_lng,min_lat,max_lng,max_lat")
        try:
            return cls.model_validate(dict(zip(cls.model_fields, parts, strict=True)))
        except ValidationError as error:
            raise ValueError(f"invalid bbox: {error.errors()[0]['msg']}") from error

    def contains(self, lat: float, lng: float) -> bool:
        return self.min_lat <= lat <= self.max_lat and self.min_lng <= lng <= self.max_lng


class PlaceOut(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    category: Category


class AuthorOut(BaseModel):
    id: str
    display_name: str
    avatar_url: str | None


class LogOut(BaseModel):
    experience_id: str
    author: AuthorOut
    relation: Relation
    rating: float
    verdict: Verdict
    review: str | None
    photo_urls: list[str]
    visited_on: date


class RecommendationItemOut(BaseModel):
    place: PlaceOut
    kind: PinKind
    score: float
    logs: list[LogOut]


class RecommendationsResponse(BaseModel):
    items: list[RecommendationItemOut]


class PlaceLogsResponse(BaseModel):
    place: PlaceOut
    logs: list[LogOut]
