"""Create places, experiences, follows, bookmarks and taste profiles."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# Frozen copies of the enum values at the time of this migration.
CATEGORIES = (
    "restaurant",
    "cafe",
    "bar",
    "trail",
    "park",
    "viewpoint",
    "gym",
    "climbing",
    "museum",
    "gallery",
    "bookstore",
    "shop",
    "attraction",
    "other",
)
VERDICTS = ("recommend", "avoid", "neutral")


def in_values(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def user_fk(name: str, *, primary_key: bool = False) -> sa.Column:
    return sa.Column(
        name,
        sa.Uuid(),
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=primary_key,
        nullable=False,
    )


def place_fk(name: str, *, primary_key: bool = False) -> sa.Column:
    return sa.Column(
        name,
        sa.Uuid(),
        sa.ForeignKey("places.id", ondelete="CASCADE"),
        primary_key=primary_key,
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        created_at(),
        sa.CheckConstraint("length(name) > 0", name="ck_places_name_not_empty"),
        sa.CheckConstraint("lat BETWEEN -90 AND 90", name="ck_places_lat_range"),
        sa.CheckConstraint("lng BETWEEN -180 AND 180", name="ck_places_lng_range"),
        sa.CheckConstraint(in_values("category", CATEGORIES), name="ck_places_category"),
    )
    op.create_index("ix_places_lat_lng", "places", ["lat", "lng"])

    op.create_table(
        "experiences",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        user_fk("user_id"),
        place_fk("place_id"),
        sa.Column("rating", sa.Numeric(2, 1), nullable=False),
        sa.Column("verdict", sa.String(10), nullable=False),
        sa.Column("review", sa.Text(), nullable=True),
        sa.Column("photo_urls", postgresql.JSONB(), nullable=False),
        sa.Column("visited_on", sa.Date(), nullable=False),
        created_at(),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_experiences_rating_range"),
        sa.CheckConstraint(
            "rating * 2 = CAST(rating * 2 AS INTEGER)", name="ck_experiences_rating_half_step"
        ),
        sa.CheckConstraint(in_values("verdict", VERDICTS), name="ck_experiences_verdict"),
        sa.CheckConstraint(
            "review IS NULL OR length(review) <= 2000", name="ck_experiences_review_length"
        ),
    )
    op.create_index("ix_experiences_place_id", "experiences", ["place_id"])
    op.create_index(
        "ix_experiences_user_place_visited",
        "experiences",
        ["user_id", "place_id", "visited_on"],
    )

    op.create_table(
        "follows",
        user_fk("follower_id", primary_key=True),
        user_fk("followee_id", primary_key=True),
        created_at(),
        sa.CheckConstraint("follower_id <> followee_id", name="ck_follows_not_self"),
    )
    op.create_index("ix_follows_followee_id", "follows", ["followee_id"])

    op.create_table(
        "bookmarks",
        user_fk("user_id", primary_key=True),
        place_fk("place_id", primary_key=True),
        created_at(),
    )

    op.create_table(
        "taste_profiles",
        user_fk("user_id", primary_key=True),
        sa.Column("category", sa.String(20), primary_key=True, nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.CheckConstraint(in_values("category", CATEGORIES), name="ck_taste_profiles_category"),
    )


def downgrade() -> None:
    op.drop_table("taste_profiles")
    op.drop_table("bookmarks")
    op.drop_table("follows")
    op.drop_table("experiences")
    op.drop_table("places")
