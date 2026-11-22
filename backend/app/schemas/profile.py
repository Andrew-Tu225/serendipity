from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.models.domain import Category, Verdict


class ProfileExperience(BaseModel):
    id: UUID
    place_name: str
    category: Category
    rating: float
    verdict: Verdict
    rated_on: date


class ProfileExperiences(BaseModel):
    display_name: str | None
    total: int
    follower_count: int
    following_count: int
    bookmark_count: int
    favorites: list[ProfileExperience]
    recent: list[ProfileExperience]
    next_offset: int | None


class ProfileBookmark(BaseModel):
    id: UUID
    name: str
    latitude: float
    longitude: float


class ProfileBookmarks(BaseModel):
    places: list[ProfileBookmark]
    next_offset: int | None
