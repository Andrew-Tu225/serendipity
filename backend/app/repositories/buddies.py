from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BuddyMessage, BuddySkip, TasteProfile, User


class BuddyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def candidates(self, viewer: UUID, limit: int) -> Sequence[User]:
        skipped = select(BuddySkip.buddy_id).where(BuddySkip.user_id == viewer)
        contacts = select(other_participant(viewer)).where(participates(viewer))
        query = (
            select(User)
            .where(User.id != viewer, User.id.not_in(skipped), User.id.not_in(contacts))
            .order_by(User.created_at.desc(), User.id)
            .limit(limit)
        )
        return (await self.session.scalars(query)).all()

    async def tastes(self, user_ids: Sequence[UUID]) -> Sequence[TasteProfile]:
        query = select(TasteProfile).where(TasteProfile.user_id.in_(user_ids))
        return (await self.session.scalars(query)).all()

    async def skip(self, viewer: UUID, buddy: UUID) -> None:
        insert = (
            postgresql.insert
            if self.session.get_bind().dialect.name == "postgresql"
            else sqlite.insert
        )
        query = insert(BuddySkip).values(user_id=viewer, buddy_id=buddy).on_conflict_do_nothing()
        await self.session.execute(query)

    async def inbox(
        self, viewer: UUID, offset: int, limit: int
    ) -> list[tuple[User, BuddyMessage, int]]:
        partner = other_participant(viewer)
        latest = (
            select(
                partner.label("buddy_id"),
                BuddyMessage.id.label("message_id"),
                func.row_number()
                .over(
                    partition_by=partner,
                    order_by=(BuddyMessage.sent_at.desc(), BuddyMessage.id.desc()),
                )
                .label("position"),
                func.count().filter(unread_by(viewer)).over(partition_by=partner).label("unread"),
            )
            .where(participates(viewer))
            .subquery()
        )
        query = (
            select(User, BuddyMessage, latest.c.unread)
            .select_from(User)
            .join(latest, User.id == latest.c.buddy_id)
            .join(BuddyMessage, latest.c.message_id == BuddyMessage.id)
            .where(latest.c.position == 1)
            .order_by(BuddyMessage.sent_at.desc(), BuddyMessage.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = await self.session.execute(query)
        return [(person, message, unread) for person, message, unread in rows]

    async def unread_count(self, viewer: UUID) -> int:
        query = select(func.count()).select_from(BuddyMessage).where(unread_by(viewer))
        return (await self.session.execute(query)).scalar_one()

    async def mark_read(self, viewer: UUID, buddy: UUID | None, now: datetime) -> None:
        query = update(BuddyMessage).where(unread_by(viewer))
        if buddy is not None:
            query = query.where(BuddyMessage.sender_id == buddy)
        await self.session.execute(query.values(read_at=now))

    async def history(
        self, viewer: UUID, buddy: UUID, before: BuddyMessage | None, limit: int
    ) -> Sequence[BuddyMessage]:
        query = select(BuddyMessage).where(between_users(viewer, buddy))
        if before is not None:
            query = query.where(
                or_(
                    BuddyMessage.sent_at < before.sent_at,
                    and_(BuddyMessage.sent_at == before.sent_at, BuddyMessage.id < before.id),
                )
            )
        query = query.order_by(BuddyMessage.sent_at.desc(), BuddyMessage.id.desc()).limit(limit)
        return (await self.session.scalars(query)).all()

    async def history_cursor(
        self, viewer: UUID, buddy: UUID, message_id: UUID
    ) -> BuddyMessage | None:
        query = select(BuddyMessage).where(
            BuddyMessage.id == message_id, between_users(viewer, buddy)
        )
        return await self.session.scalar(query)

    async def send(
        self, message_id: UUID, sender: UUID, recipient: UUID, body: str, sent_at: datetime
    ) -> BuddyMessage:
        insert = (
            postgresql.insert
            if self.session.get_bind().dialect.name == "postgresql"
            else sqlite.insert
        )
        query = (
            insert(BuddyMessage)
            .values(
                id=message_id,
                sender_id=sender,
                recipient_id=recipient,
                body=body,
                sent_at=sent_at,
            )
            .on_conflict_do_nothing()
        )
        await self.session.execute(query)
        return (
            await self.session.scalars(select(BuddyMessage).where(BuddyMessage.id == message_id))
        ).one()


def participates(viewer: UUID):
    return or_(BuddyMessage.sender_id == viewer, BuddyMessage.recipient_id == viewer)


def unread_by(viewer: UUID):
    return and_(BuddyMessage.recipient_id == viewer, BuddyMessage.read_at.is_(None))


def other_participant(viewer: UUID):
    return case(
        (BuddyMessage.sender_id == viewer, BuddyMessage.recipient_id), else_=BuddyMessage.sender_id
    )


def between_users(viewer: UUID, buddy: UUID):
    return or_(
        and_(BuddyMessage.sender_id == viewer, BuddyMessage.recipient_id == buddy),
        and_(BuddyMessage.sender_id == buddy, BuddyMessage.recipient_id == viewer),
    )
