from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.models.domain import Category, Verdict
from app.schemas.character import CharacterAppearance


class ProfileExperience(BaseModel):
    id: UUID
    place_name: str
    category: Category
    rating: float
    verdict: Verdict
    rated_on: date


class ProfileExperiences(BaseModel):
    user_id: UUID
    display_name: str | None
    character: CharacterAppearance | None = None
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


ConnectionDirection = Literal["followers", "following"]


class ProfileConnection(BaseModel):
    id: UUID
    display_name: str
    character: CharacterAppearance | None = None


class ProfileConnections(BaseModel):
    people: list[ProfileConnection]
    next_offset: int | None
