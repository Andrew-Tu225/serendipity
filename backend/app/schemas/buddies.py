from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.domain import Category
from app.schemas.character import CharacterAppearance


class BuddyPerson(BaseModel):
    id: UUID
    display_name: str
    character: CharacterAppearance | None


class BuddySuggestion(BuddyPerson):
    match_percent: int | None
    liked_categories: list[Category]


class BuddyMessageWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class BuddyMessageOut(BaseModel):
    id: UUID
    from_you: bool
    body: str
    sent_at: datetime
    unread: bool


class BuddyConversation(BaseModel):
    messages: list[BuddyMessageOut]
    next_before: UUID | None


class BuddyThread(BaseModel):
    buddy: BuddyPerson
    latest: BuddyMessageOut
    unread_count: int


class BuddyInbox(BaseModel):
    threads: list[BuddyThread]
    next_offset: int | None
    unread_count: int
