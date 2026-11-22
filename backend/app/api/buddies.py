from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database_session
from app.dependencies import CurrentUser, VerifiedMutation
from app.schemas.buddies import (
    BuddyConversation,
    BuddyInbox,
    BuddyMessageOut,
    BuddyMessageWrite,
    BuddySuggestion,
)
from app.services.buddies import BuddyService

router = APIRouter(prefix="/buddies", tags=["buddies"])


def get_buddy_service(
    database: Annotated[AsyncSession, Depends(get_database_session)],
) -> BuddyService:
    return BuddyService(database)


Service = Annotated[BuddyService, Depends(get_buddy_service)]
PageLimit = Annotated[int, Query(ge=1, le=100)]


@router.get("/suggestions", response_model=list[BuddySuggestion])
async def suggestions(user: CurrentUser, service: Service):
    return await service.suggestions(user)


@router.put("/skips/{buddy_id}", status_code=204)
async def skip(buddy_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service):
    await service.skip(user, buddy_id)


@router.get("/inbox", response_model=BuddyInbox)
async def inbox(
    user: CurrentUser,
    service: Service,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: PageLimit = 30,
):
    return await service.inbox(user, offset, limit)


@router.get("/chats/{buddy_id}", response_model=BuddyConversation)
async def history(
    buddy_id: UUID,
    user: CurrentUser,
    service: Service,
    before: UUID | None = None,
    limit: PageLimit = 40,
):
    return await service.history(user, buddy_id, before, limit)


@router.post("/chats/{buddy_id}", response_model=BuddyMessageOut, status_code=201)
async def send(
    buddy_id: UUID,
    data: BuddyMessageWrite,
    user: CurrentUser,
    verified: VerifiedMutation,
    service: Service,
):
    return await service.send(user, buddy_id, data)
