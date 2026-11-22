from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BuddySkip(Base):
    __tablename__ = "buddy_skips"
    __table_args__ = (CheckConstraint("user_id <> buddy_id", name="ck_buddy_skips_not_self"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    buddy_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )


class BuddyMessage(Base):
    __tablename__ = "buddy_messages"
    __table_args__ = (
        CheckConstraint("sender_id <> recipient_id", name="ck_buddy_messages_not_self"),
        CheckConstraint("length(trim(body)) BETWEEN 1 AND 2000", name="ck_buddy_messages_body"),
        Index("ix_buddy_messages_sender_time", "sender_id", "sent_at"),
        Index("ix_buddy_messages_recipient_time", "recipient_id", "sent_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    sender_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    recipient_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
