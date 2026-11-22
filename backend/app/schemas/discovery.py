from datetime import date
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.domain import Category, Rating, Verdict
from app.schemas.places import PlaceId


class NewPlace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    category: Category = Category.RESTAURANT
    google_place_id: PlaceId | None = None


class ExperienceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    place_id: UUID | None = None
    new_place: NewPlace | None = None
    rating: Rating
    verdict: Verdict = Verdict.NEUTRAL
    review: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
    visited_on: date

    @model_validator(mode="after")
    def validate_visit(self) -> Self:
        if (self.place_id is None) == (self.new_place is None):
            raise ValueError("Supply either place_id or new_place")
        if self.visited_on > date.today():
            raise ValueError("visited_on cannot be in the future")
        return self


class RatingSummary(BaseModel):
    average: float
    count: int


class ExperienceOut(BaseModel):
    id: UUID
    author_id: UUID
    author_name: str
    rating: float
    verdict: Verdict
    review: str | None
    visited_on: date
    is_friend: bool
    is_self: bool


class DiscoveryPlace(BaseModel):
    id: UUID
    name: str
    latitude: float
    longitude: float
    category: Category
    google_place_id: str | None
    rating_summary: RatingSummary
    friend_count: int
    friends: list[ExperienceOut]


class DiscoveryPage(BaseModel):
    places: list[DiscoveryPlace]
    next_cursor: UUID | None


class PlaceExperiences(BaseModel):
    place: DiscoveryPlace
    experiences: list[ExperienceOut]
    next_offset: int | None
