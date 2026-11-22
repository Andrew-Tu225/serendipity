from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

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
    list_count: int | None
    favorites: list[ProfileExperience]
    recent: list[ProfileExperience]
    next_offset: int | None


class ProfileListEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    location: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class ProfileListCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    first_entry: ProfileListEntry | None = None


class ProfileListSummary(BaseModel):
    id: UUID
    name: str
    entry_count: int


class ProfileLists(BaseModel):
    lists: list[ProfileListSummary]
    next_offset: int | None


class ProfileListEntries(BaseModel):
    entries: list[ProfileListEntry]
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
