from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MAX_LIST_NAME_CHARS = 80
MAX_LIST_DESCRIPTION_CHARS = 500


class ExperienceList(Base):
    """A named, public collection of Experiences curated by one user."""

    __tablename__ = "lists"
    __table_args__ = (
        CheckConstraint(
            f"length(name) BETWEEN 1 AND {MAX_LIST_NAME_CHARS}", name="ck_lists_name_length"
        ),
        CheckConstraint(
            f"description IS NULL OR length(description) <= {MAX_LIST_DESCRIPTION_CHARS}",
            name="ck_lists_description_length",
        ),
        Index("ix_lists_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(MAX_LIST_NAME_CHARS), nullable=False)
    description: Mapped[str | None] = mapped_column(String(MAX_LIST_DESCRIPTION_CHARS))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ListItem(Base):
    """Membership of an Experience in a List; any public Experience may be listed."""

    __tablename__ = "list_items"
    __table_args__ = (Index("ix_list_items_experience_id", "experience_id"),)

    list_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("lists.id", ondelete="CASCADE"), primary_key=True
    )
    experience_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("experiences.id", ondelete="CASCADE"), primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
