from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        CheckConstraint("follower_id <> followee_id", name="ck_follows_not_self"),
        Index("ix_follows_followee_id", "followee_id"),
    )

    follower_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    followee_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ExperienceLike(Base):
    __tablename__ = "experience_likes"
    __table_args__ = (Index("ix_experience_likes_experience_id", "experience_id"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    experience_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("experiences.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ExperienceBookmark(Base):
    __tablename__ = "experience_bookmarks"
    __table_args__ = (Index("ix_experience_bookmarks_experience_id", "experience_id"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    experience_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("experiences.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ExperienceComment(Base):
    __tablename__ = "experience_comments"
    __table_args__ = (
        CheckConstraint(
            "length(trim(body)) > 0 AND length(body) <= 2000", name="ck_experience_comments_body"
        ),
        Index("ix_experience_comments_experience_created", "experience_id", "created_at", "id"),
        Index("ix_experience_comments_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    experience_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("experiences.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
