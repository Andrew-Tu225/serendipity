"""Domain models for docs/recommendations.md section 1."""

from datetime import date
from enum import StrEnum
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

MAX_REVIEW_CHARS = 2000
MAX_PHOTOS = 10
NEUTRAL_RATING = 3.0
RATING_HALF_RANGE = 2.0


class Category(StrEnum):
    RESTAURANT = "restaurant"
    CAFE = "cafe"
    BAR = "bar"
    TRAIL = "trail"
    PARK = "park"
    VIEWPOINT = "viewpoint"
    GYM = "gym"
    CLIMBING = "climbing"
    MUSEUM = "museum"
    GALLERY = "gallery"
    BOOKSTORE = "bookstore"
    SHOP = "shop"
    ATTRACTION = "attraction"
    OTHER = "other"


class Verdict(StrEnum):
    RECOMMEND = "recommend"
    AVOID = "avoid"
    NEUTRAL = "neutral"


def verdict_value(verdict: Verdict, rating: float) -> float:
    """A log's positivity in [-1, 1] (docs/recommendations.md 2.1)."""
    if verdict is Verdict.RECOMMEND:
        return 1.0
    if verdict is Verdict.AVOID:
        return -1.0
    return (rating - NEUTRAL_RATING) / RATING_HALF_RANGE


def _check_half_step(rating: float) -> float:
    if (rating * 2) % 1 != 0:
        raise ValueError("rating must be in steps of 0.5")
    return rating


def _check_not_future(day: date) -> date:
    if day > date.today():
        raise ValueError("visited_on cannot be in the future")
    return day


Rating = Annotated[float, Field(ge=1.0, le=5.0), AfterValidator(_check_half_step)]


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True)


class User(FrozenModel):
    id: str
    display_name: str = Field(min_length=1, max_length=60)
    avatar_url: str | None = None


class Follow(FrozenModel):
    follower_id: str
    followee_id: str

    @model_validator(mode="after")
    def _no_self_follow(self) -> Self:
        if self.follower_id == self.followee_id:
            raise ValueError("a user cannot follow themselves")
        return self


class Place(FrozenModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    category: Category


class Experience(FrozenModel):
    id: str
    user_id: str
    place_id: str
    rating: Rating
    verdict: Verdict = Verdict.NEUTRAL
    review: str | None = Field(default=None, max_length=MAX_REVIEW_CHARS)
    photo_urls: tuple[str, ...] = Field(default=(), max_length=MAX_PHOTOS)
    visited_on: Annotated[date, AfterValidator(_check_not_future)]
    # The value stored when the log was written; None until it is stored.
    value: float | None = Field(default=None, ge=-1, le=1)


class Bookmark(FrozenModel):
    user_id: str
    place_id: str


class TasteProfile(FrozenModel):
    """One row per (user, category); score is the sum of log values (doc 2.2)."""

    user_id: str
    category: Category
    score: float
