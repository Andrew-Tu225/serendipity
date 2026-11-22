from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.models.domain import Category, Verdict
from app.models.lists import MAX_LIST_DESCRIPTION_CHARS, MAX_LIST_NAME_CHARS

ListName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_LIST_NAME_CHARS)
]
ListDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=MAX_LIST_DESCRIPTION_CHARS)
]


class ListCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ListName
    description: ListDescription = ""


class ListUpdate(BaseModel):
    """Omitted fields are unchanged; an empty description clears it."""

    model_config = ConfigDict(extra="forbid")

    name: ListName | None = None
    description: ListDescription | None = None

    @model_validator(mode="after")
    def has_change(self) -> Self:
        if self.name is None and self.description is None:
            raise ValueError("Supply name or description")
        return self


class ListItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    experience_id: UUID


class ListSummary(BaseModel):
    id: UUID
    owner_id: UUID
    owner_name: str
    name: str
    description: str | None
    item_count: int
    created_at: datetime
    updated_at: datetime


class ListExperienceOut(BaseModel):
    experience_id: UUID
    place_id: UUID
    place_name: str
    place_category: Category
    latitude: float
    longitude: float
    author_id: UUID
    author_name: str
    rating: float
    verdict: Verdict
    review: str | None
    visited_on: date
    added_at: datetime


class ListDetail(ListSummary):
    items: list[ListExperienceOut]


class ListsResponse(BaseModel):
    lists: list[ListSummary]
