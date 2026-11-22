"""Public social contracts intentionally exclude diagnostic identity fields."""

from datetime import date, datetime
from typing import Annotated, Generic, Self, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.models.domain import Category, Verdict
from app.schemas.character import CharacterAppearance
from app.schemas.discovery import NewPlace

T = TypeVar("T")
CommentBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]
SearchQuery = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_offset: int | None


class UserSummary(BaseModel):
    id: UUID
    display_name: str
    avatar_url: str | None
    character: CharacterAppearance | None = None


class UserProfile(UserSummary):
    experience_count: int
    follower_count: int
    following_count: int
    is_following: bool
    follows_you: bool
    is_self: bool


class PlaceSummary(BaseModel):
    id: UUID
    name: str
    latitude: float
    longitude: float
    category: Category
    google_place_id: str | None


class ExperienceResponse(BaseModel):
    id: UUID
    author: UserSummary
    place: PlaceSummary
    rating: float
    verdict: Verdict
    review: str | None
    photo_urls: list[str]
    visited_on: date
    created_at: datetime
    like_count: int
    comment_count: int
    is_liked: bool
    is_bookmarked: bool


class CommentWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: CommentBody


class CommentResponse(BaseModel):
    id: UUID
    experience_id: UUID
    author: UserSummary
    body: str
    created_at: datetime
    updated_at: datetime


class PlaceBookmarkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    place_id: UUID | None = None
    new_place: NewPlace | None = None

    @model_validator(mode="after")
    def exactly_one_place(self) -> Self:
        if (self.place_id is None) == (self.new_place is None):
            raise ValueError("Supply either place_id or new_place")
        return self


class SavedPlace(BaseModel):
    place: PlaceSummary
    saved_at: datetime


class SavedExperience(BaseModel):
    experience: ExperienceResponse
    saved_at: datetime


class LikeState(BaseModel):
    experience_id: UUID
    is_liked: bool
    like_count: int


class FollowState(BaseModel):
    user_id: UUID
    is_following: bool
