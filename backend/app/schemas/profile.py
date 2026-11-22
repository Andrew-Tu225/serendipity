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
    favorites: list[ProfileExperience]
    recent: list[ProfileExperience]
    next_offset: int | None
