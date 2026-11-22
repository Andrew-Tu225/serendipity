from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.domain import Category


def in_values(column: str, values: type[StrEnum]) -> str:
    """SQL `column IN (...)` over an enum's values, for CHECK constraints."""
    return f"{column} IN ({', '.join(repr(v.value) for v in values)})"


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (
        CheckConstraint("length(name) > 0", name="ck_places_name_not_empty"),
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_places_lat_range"),
        CheckConstraint("lng BETWEEN -180 AND 180", name="ck_places_lng_range"),
        CheckConstraint(in_values("category", Category), name="ck_places_category"),
        Index("ix_places_lat_lng", "lat", "lng"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    google_place_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Bookmark(Base):
    __tablename__ = "bookmarks"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    place_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
