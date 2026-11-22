from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database_session
from app.dependencies import CurrentUser, OptionalUser, VerifiedMutation
from app.schemas.social import (
    CommentResponse,
    CommentWrite,
    ExperienceResponse,
    FollowState,
    LikeState,
    Page,
    PlaceBookmarkCreate,
    SavedExperience,
    SavedPlace,
    SearchQuery,
    UserProfile,
    UserSummary,
)
from app.services.social import SocialService

router = APIRouter(tags=["social"])


def get_service(database: Annotated[AsyncSession, Depends(get_database_session)]):
    return SocialService(database)


Service = Annotated[SocialService, Depends(get_service)]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


@router.get("/users", response_model=Page[UserSummary])
async def search_users(
    service: Service, query: Annotated[SearchQuery, Query()], offset: Offset = 0, limit: Limit = 20
):
    return await service.search(query, offset, limit)


@router.get("/users/{user_id}", response_model=UserProfile)
async def profile(user_id: UUID, viewer: OptionalUser, service: Service):
    return await service.profile(user_id, viewer)


@router.get("/users/{user_id}/experiences", response_model=Page[ExperienceResponse])
async def user_experiences(
    user_id: UUID, viewer: OptionalUser, service: Service, offset: Offset = 0, limit: Limit = 20
):
    return await service.experiences(viewer, offset, limit, author_id=user_id)


@router.get("/users/{user_id}/followers", response_model=Page[UserSummary])
async def followers(user_id: UUID, service: Service, offset: Offset = 0, limit: Limit = 20):
    return await service.connections(user_id, True, offset, limit)


@router.get("/users/{user_id}/following", response_model=Page[UserSummary])
async def following(user_id: UUID, service: Service, offset: Offset = 0, limit: Limit = 20):
    return await service.connections(user_id, False, offset, limit)


@router.put("/users/{user_id}/follow", response_model=FollowState)
async def follow(user_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service):
    return await service.follow(user, user_id)


@router.delete("/users/{user_id}/follow", status_code=204)
async def unfollow(user_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service):
    await service.unfollow(user, user_id)
    return Response(status_code=204)


@router.get("/feed", response_model=Page[ExperienceResponse])
async def feed(user: CurrentUser, service: Service, offset: Offset = 0, limit: Limit = 20):
    return await service.experiences(user, offset, limit, follower_id=user.id)


@router.get("/experiences/{experience_id}", response_model=ExperienceResponse)
async def experience(experience_id: UUID, viewer: OptionalUser, service: Service):
    return await service.experience(experience_id, viewer)


@router.put("/experiences/{experience_id}/like", response_model=LikeState)
async def like(
    experience_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    return await service.like(user, experience_id)


@router.delete("/experiences/{experience_id}/like", status_code=204)
async def unlike(
    experience_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    await service.unlike(user, experience_id)
    return Response(status_code=204)


@router.get("/experiences/{experience_id}/likes", response_model=Page[UserSummary])
async def likers(experience_id: UUID, service: Service, offset: Offset = 0, limit: Limit = 20):
    return await service.likers(experience_id, offset, limit)


@router.get("/experiences/{experience_id}/comments", response_model=Page[CommentResponse])
async def comments(experience_id: UUID, service: Service, offset: Offset = 0, limit: Limit = 20):
    return await service.comments(experience_id, offset, limit)


@router.post(
    "/experiences/{experience_id}/comments", response_model=CommentResponse, status_code=201
)
async def create_comment(
    experience_id: UUID,
    data: CommentWrite,
    user: CurrentUser,
    verified: VerifiedMutation,
    service: Service,
):
    return await service.create_comment(user, experience_id, data.body)


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def edit_comment(
    comment_id: UUID,
    data: CommentWrite,
    user: CurrentUser,
    verified: VerifiedMutation,
    service: Service,
):
    return await service.edit_comment(user, comment_id, data.body)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    await service.delete_comment(user, comment_id)
    return Response(status_code=204)


@router.get("/me/bookmarks/experiences", response_model=Page[SavedExperience])
async def saved_experiences(
    user: CurrentUser, service: Service, offset: Offset = 0, limit: Limit = 20
):
    return await service.saved_experiences(user, offset, limit)


@router.put("/me/bookmarks/experiences/{experience_id}", response_model=SavedExperience)
async def save_experience(
    experience_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    return await service.save_experience(user, experience_id)


@router.delete("/me/bookmarks/experiences/{experience_id}", status_code=204)
async def unsave_experience(
    experience_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    await service.unsave_experience(user, experience_id)
    return Response(status_code=204)


@router.get("/me/bookmarks/places", response_model=Page[SavedPlace])
async def saved_places(user: CurrentUser, service: Service, offset: Offset = 0, limit: Limit = 20):
    return await service.saved_places(user, offset, limit)


@router.post("/me/bookmarks/places", response_model=SavedPlace)
async def save_place(
    data: PlaceBookmarkCreate, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    return await service.save_place(user, data)


@router.delete("/me/bookmarks/places/{place_id}", status_code=204)
async def unsave_place(
    place_id: UUID, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    await service.unsave_place(user, place_id)
    return Response(status_code=204)
