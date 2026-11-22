from collections.abc import Awaitable
from typing import TypeVar
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Bookmark,
    Experience,
    ExperienceBookmark,
    ExperienceComment,
    ExperienceLike,
    Follow,
    Place,
    User,
)
from app.repositories.discovery import DiscoveryRepository
from app.repositories.social import SocialRepository
from app.schemas.social import (
    CommentResponse,
    ExperienceResponse,
    FollowState,
    LikeState,
    Page,
    PlaceBookmarkCreate,
    PlaceSummary,
    SavedExperience,
    SavedPlace,
    UserProfile,
    UserSummary,
)

T = TypeVar("T")


def user_summary(user: User) -> UserSummary:
    return UserSummary(
        id=user.id,
        display_name=(user.display_name or "").strip()[:60] or "Anonymous",
        avatar_url=user.picture_url,
        character=user.character,
    )


def place_summary(place: Place) -> PlaceSummary:
    return PlaceSummary(
        id=place.id,
        name=place.name,
        latitude=place.lat,
        longitude=place.lng,
        category=place.category,
        google_place_id=place.google_place_id,
    )


def page(items: list[T], offset: int, limit: int) -> Page[T]:
    return Page(items=items[:limit], next_offset=offset + limit if len(items) > limit else None)


def comment_response(comment: ExperienceComment, author: User) -> CommentResponse:
    return CommentResponse(
        id=comment.id,
        experience_id=comment.experience_id,
        author=user_summary(author),
        body=comment.body,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


class SocialService:
    def __init__(self, database: AsyncSession):
        self.database = database
        self.repository = SocialRepository(database)
        self.places = DiscoveryRepository(database)

    async def _required(self, model, identity, label: str):
        row = await self.repository.get(model, identity)
        if row is None:
            raise HTTPException(404, f"{label} not found")
        return row

    async def _commit(self, operation: Awaitable[T]) -> T:
        try:
            result = await operation
            await self.database.commit()
            return result
        except Exception:
            await self.database.rollback()
            raise

    async def profile(self, user_id: UUID, viewer: User | None):
        user = await self._required(User, user_id, "User")
        experiences, followers, following = await self.repository.profile_stats(user_id)
        is_following = follows_you = False
        if viewer is not None:
            is_following = await self.repository.get(Follow, (viewer.id, user_id)) is not None
            follows_you = await self.repository.get(Follow, (user_id, viewer.id)) is not None
        return UserProfile(
            **user_summary(user).model_dump(),
            experience_count=experiences,
            follower_count=followers,
            following_count=following,
            is_following=is_following,
            follows_you=follows_you,
            is_self=viewer is not None and viewer.id == user_id,
        )

    async def search(self, query: str, offset: int, limit: int):
        rows = await self.repository.search_users(query, offset, limit + 1)
        return page([user_summary(u) for u in rows], offset, limit)

    async def connections(self, user_id: UUID, followers: bool, offset: int, limit: int):
        await self._required(User, user_id, "User")
        rows = await self.repository.connections(user_id, followers, offset, limit + 1)
        return page([user_summary(u) for u in rows], offset, limit)

    async def follow(self, user: User, user_id: UUID):
        await self._required(User, user_id, "User")
        if user.id == user_id:
            raise HTTPException(422, "Cannot follow yourself")
        await self._commit(
            self.repository.add_relation(Follow, follower_id=user.id, followee_id=user_id)
        )
        return FollowState(user_id=user_id, is_following=True)

    async def unfollow(self, user: User, user_id: UUID):
        await self._required(User, user_id, "User")
        await self._commit(
            self.repository.remove_relation(Follow, follower_id=user.id, followee_id=user_id)
        )

    async def _experience_responses(self, rows, viewer: User | None):
        if not rows:
            return []
        likes, comments, liked, saved = await self.repository.social_stats(
            [row[0].id for row in rows], viewer.id if viewer else None
        )
        return [
            ExperienceResponse(
                id=log.id,
                author=user_summary(author),
                place=place_summary(place),
                rating=log.rating,
                verdict=log.verdict,
                review=log.review,
                photo_urls=log.photo_urls,
                visited_on=log.visited_on,
                created_at=log.created_at,
                like_count=likes.get(log.id, 0),
                comment_count=comments.get(log.id, 0),
                is_liked=log.id in liked,
                is_bookmarked=log.id in saved,
            )
            for log, author, place, *_ in rows
        ]

    async def experience(self, experience_id: UUID, viewer: User | None):
        rows = await self.repository.experiences(0, 1, experience_id=experience_id)
        if not rows:
            raise HTTPException(404, "Experience not found")
        return (await self._experience_responses(rows, viewer))[0]

    async def experiences(
        self,
        viewer: User | None,
        offset: int,
        limit: int,
        *,
        author_id: UUID | None = None,
        follower_id: UUID | None = None,
    ):
        if author_id is not None:
            await self._required(User, author_id, "User")
        rows = await self.repository.experiences(
            offset, limit + 1, author_id=author_id, follower_id=follower_id
        )
        return page(await self._experience_responses(rows, viewer), offset, limit)

    async def like(self, user: User, experience_id: UUID):
        await self._required(Experience, experience_id, "Experience")
        await self._commit(
            self.repository.add_relation(
                ExperienceLike, user_id=user.id, experience_id=experience_id
            )
        )
        count = await self.repository.count(
            ExperienceLike, ExperienceLike.experience_id == experience_id
        )
        return LikeState(experience_id=experience_id, is_liked=True, like_count=count)

    async def unlike(self, user: User, experience_id: UUID):
        await self._required(Experience, experience_id, "Experience")
        await self._commit(
            self.repository.remove_relation(
                ExperienceLike, user_id=user.id, experience_id=experience_id
            )
        )

    async def likers(self, experience_id: UUID, offset: int, limit: int):
        await self._required(Experience, experience_id, "Experience")
        rows = await self.repository.likers(experience_id, offset, limit + 1)
        return page([user_summary(u) for u in rows], offset, limit)

    async def comments(self, experience_id: UUID, offset: int, limit: int):
        await self._required(Experience, experience_id, "Experience")
        rows = await self.repository.comments(experience_id, offset, limit + 1)
        return page([comment_response(c, u) for c, u in rows], offset, limit)

    async def create_comment(self, user: User, experience_id: UUID, body: str):
        await self._required(Experience, experience_id, "Experience")
        comment = await self._commit(self.repository.add_comment(user.id, experience_id, body))
        return comment_response(comment, user)

    async def _owned_comment(self, user: User, comment_id: UUID):
        comment = await self._required(ExperienceComment, comment_id, "Comment")
        if comment.user_id != user.id:
            raise HTTPException(403, "Only the comment author can change this comment")
        return comment

    async def edit_comment(self, user: User, comment_id: UUID, body: str):
        comment = await self._owned_comment(user, comment_id)
        await self._commit(self.repository.edit_comment(comment, body))
        return comment_response(comment, user)

    async def delete_comment(self, user: User, comment_id: UUID):
        comment = await self._owned_comment(user, comment_id)
        await self._commit(self.repository.delete_comment(comment))

    async def save_experience(self, user: User, experience_id: UUID):
        await self._required(Experience, experience_id, "Experience")
        bookmark = await self._commit(
            self.repository.add_relation(
                ExperienceBookmark, user_id=user.id, experience_id=experience_id
            )
        )
        return SavedExperience(
            experience=await self.experience(experience_id, user), saved_at=bookmark.created_at
        )

    async def unsave_experience(self, user: User, experience_id: UUID):
        await self._required(Experience, experience_id, "Experience")
        await self._commit(
            self.repository.remove_relation(
                ExperienceBookmark, user_id=user.id, experience_id=experience_id
            )
        )

    async def saved_experiences(self, user: User, offset: int, limit: int):
        rows = await self.repository.experiences(offset, limit + 1, saved_by=user.id)
        logs = await self._experience_responses(rows, user)
        return page(
            [
                SavedExperience(experience=log, saved_at=row[3])
                for log, row in zip(logs, rows, strict=True)
            ],
            offset,
            limit,
        )

    async def save_place(self, user: User, data: PlaceBookmarkCreate):
        async def operation():
            place = (
                await self.places.create_place(data.new_place)
                if data.new_place
                else (await self._required(Place, data.place_id, "Place"))
            )
            bookmark = await self.repository.add_relation(
                Bookmark, user_id=user.id, place_id=place.id
            )
            return SavedPlace(place=place_summary(place), saved_at=bookmark.created_at)

        return await self._commit(operation())

    async def unsave_place(self, user: User, place_id: UUID):
        await self._required(Place, place_id, "Place")
        await self._commit(
            self.repository.remove_relation(Bookmark, user_id=user.id, place_id=place_id)
        )

    async def saved_places(self, user: User, offset: int, limit: int):
        rows = await self.repository.saved_places(user.id, offset, limit + 1)
        return page(
            [SavedPlace(place=place_summary(p), saved_at=t) for p, t in rows], offset, limit
        )
