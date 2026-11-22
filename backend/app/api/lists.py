from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database_session
from app.dependencies import CurrentUser, VerifiedMutation
from app.schemas.lists import ListCreate, ListDetail, ListItemCreate, ListsResponse, ListUpdate
from app.services.lists import ListService

router = APIRouter(tags=["lists"])


def get_service(database: Annotated[AsyncSession, Depends(get_database_session)]):
    return ListService(database)


Service = Annotated[ListService, Depends(get_service)]


@router.get("/lists", response_model=ListsResponse)
async def my_lists(user: CurrentUser, service: Service):
    return ListsResponse(lists=await service.lists_of(user.id))


@router.get("/users/{user_id}/lists", response_model=ListsResponse)
async def user_lists(user_id: UUID, service: Service):
    return ListsResponse(lists=await service.lists_of(user_id))


@router.post("/lists", response_model=ListDetail, status_code=201)
async def create_list(
    data: ListCreate, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    return await service.create(data, user)


@router.get("/lists/{list_id}", response_model=ListDetail)
async def get_list(list_id: UUID, service: Service):
    return await service.detail(list_id)


@router.patch("/lists/{list_id}", response_model=ListDetail)
async def update_list(
    list_id: UUID,
    data: ListUpdate,
    user: CurrentUser,
    verified: VerifiedMutation,
    service: Service,
):
    return await service.update(list_id, data, user)


@router.delete("/lists/{list_id}", status_code=204)
async def delete_list(
    list_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    await service.delete(list_id, user)
    return Response(status_code=204)


@router.post("/lists/{list_id}/experiences", response_model=ListDetail)
async def add_experience(
    list_id: UUID,
    data: ListItemCreate,
    user: CurrentUser,
    verified: VerifiedMutation,
    service: Service,
):
    return await service.add_experience(list_id, data.experience_id, user)


@router.delete("/lists/{list_id}/experiences/{experience_id}", status_code=204)
async def remove_experience(
    list_id: UUID,
    experience_id: UUID,
    user: CurrentUser,
    verified: VerifiedMutation,
    service: Service,
):
    await service.remove_experience(list_id, experience_id, user)
    return Response(status_code=204)
