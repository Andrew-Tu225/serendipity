from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BuddyMessage, User
from app.models.conversions import to_domain_profile
from app.recommend.taste import taste_sim, vectors_from_rows
from app.repositories.buddies import BuddyRepository
from app.repositories.users import UserRepository
from app.schemas.buddies import (
    BuddyConversation,
    BuddyInbox,
    BuddyMessageOut,
    BuddyMessageWrite,
    BuddyPerson,
    BuddySuggestion,
    BuddyThread,
)


class BuddyService:
    def __init__(self, database: AsyncSession):
        self.database = database
        self.buddies = BuddyRepository(database)
        self.users = UserRepository(database)

    async def suggestions(self, user: User) -> list[BuddySuggestion]:
        candidates = await self.buddies.candidates(user.id, limit=100)
        rows = await self.buddies.tastes([user.id, *(person.id for person in candidates)])
        vectors = vectors_from_rows(to_domain_profile(row) for row in rows)
        viewer = vectors.get(str(user.id), {})
        ranked = sorted(
            ((person, taste_sim(viewer, vectors.get(str(person.id), {}))) for person in candidates),
            key=lambda candidate: -candidate[1],
        )
        return [
            BuddySuggestion(
                **person_summary(person).model_dump(),
                match_percent=round(score * 100) if score else None,
            )
            for person, score in ranked[:24]
        ]

    async def skip(self, user: User, buddy_id: UUID) -> None:
        await self._require_buddy(user, buddy_id)
        await self.buddies.skip(user.id, buddy_id)
        await self.database.commit()

    async def inbox(self, user: User, offset: int, limit: int) -> BuddyInbox:
        rows = await self.buddies.inbox(user.id, offset, limit + 1)
        return BuddyInbox(
            threads=[
                BuddyThread(buddy=person_summary(person), latest=message_summary(message, user.id))
                for person, message in rows[:limit]
            ],
            next_offset=offset + limit if len(rows) > limit else None,
        )

    async def history(
        self, user: User, buddy_id: UUID, before: UUID | None, limit: int
    ) -> BuddyConversation:
        await self._require_buddy(user, buddy_id)
        boundary = None
        if before is not None:
            boundary = await self.buddies.history_cursor(user.id, buddy_id, before)
            if boundary is None:
                raise HTTPException(404, "Message unavailable")
        rows = await self.buddies.history(user.id, buddy_id, boundary, limit + 1)
        return BuddyConversation(
            messages=[message_summary(message, user.id) for message in reversed(rows[:limit])],
            next_before=rows[limit - 1].id if len(rows) > limit else None,
        )

    async def send(self, user: User, buddy_id: UUID, data: BuddyMessageWrite) -> BuddyMessageOut:
        await self._require_buddy(user, buddy_id)
        message = await self.buddies.send(data.id, user.id, buddy_id, data.body, datetime.now(UTC))
        if (message.sender_id, message.recipient_id, message.body) != (
            user.id,
            buddy_id,
            data.body,
        ):
            raise HTTPException(409, "This message ID was already used")
        result = message_summary(message, user.id)
        await self.database.commit()
        return result

    async def _require_buddy(self, user: User, buddy_id: UUID) -> None:
        if user.id == buddy_id or await self.users.get(buddy_id) is None:
            raise HTTPException(404, "Buddy unavailable")


def person_summary(person: User) -> BuddyPerson:
    return BuddyPerson(
        id=person.id,
        display_name=(person.display_name or "").strip() or "Serendipity user",
        character=person.character,
    )


def message_summary(message: BuddyMessage, viewer: UUID) -> BuddyMessageOut:
    timestamp = message.sent_at
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return BuddyMessageOut(
        id=message.id, body=message.body, from_you=message.sender_id == viewer, sent_at=timestamp
    )
