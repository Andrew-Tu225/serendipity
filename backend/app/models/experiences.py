from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.domain import MAX_REVIEW_CHARS, Category, Verdict, verdict_value
from app.models.places import in_values

VERDICTS = frozenset(v.value for v in Verdict)


def _value_from_row(context) -> float:
    """Default for inserts that omit `value`, e.g. fixtures and raw seed rows."""
    row = context.get_current_parameters()
    verdict = row.get("verdict") or Verdict.NEUTRAL.value
    if verdict not in VERDICTS:
        return 0.0  # ck_experiences_verdict rejects the row
    return verdict_value(Verdict(verdict), float(row["rating"]))


class Experience(Base):
    """One log. The CHECKs repeat the domain rules so rows written outside the API stay valid."""

    __tablename__ = "experiences"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_experiences_rating_range"),
        CheckConstraint(
            "rating * 2 = CAST(rating * 2 AS INTEGER)", name="ck_experiences_rating_half_step"
        ),
        CheckConstraint(in_values("verdict", Verdict), name="ck_experiences_verdict"),
        CheckConstraint("value BETWEEN -1 AND 1", name="ck_experiences_value_range"),
        CheckConstraint(
            f"review IS NULL OR length(review) <= {MAX_REVIEW_CHARS}",
            name="ck_experiences_review_length",
        ),
        Index("ix_experiences_place_id", "place_id"),
        Index("ix_experiences_user_place_visited", "user_id", "place_id", "visited_on"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    place_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("places.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[float] = mapped_column(Numeric(2, 1, asdecimal=False), nullable=False)
    verdict: Mapped[str] = mapped_column(String(10), nullable=False, default=Verdict.NEUTRAL)
    # Positivity at write time; taste_profiles.score is the sum of these per category.
    value: Mapped[float] = mapped_column(Float, nullable=False, default=_value_from_row)
    review: Mapped[str | None] = mapped_column(Text)
    photo_urls: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list
    )
    visited_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TasteProfile(Base):
    """Sum of log values per (user, category); only ever incremented (doc section 2.2)."""

    __tablename__ = "taste_profiles"
    __table_args__ = (
        CheckConstraint(in_values("category", Category), name="ck_taste_profiles_category"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    category: Mapped[str] = mapped_column(String(20), primary_key=True)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
