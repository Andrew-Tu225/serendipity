"""Reconcile the user schemas that previously shared revision 0005."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Databases stamped 0005 may contain either the onboarding or character schema.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS character JSONB")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ")
    op.create_table(
        "user_interests",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("category", sa.String(20), primary_key=True),
        sa.CheckConstraint(
            "category IN ('restaurant','cafe','bar','trail','park','viewpoint','gym',"
            "'climbing','museum','gallery','bookstore','shop','attraction','other')",
            name="ck_user_interests_category",
        ),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_column("users", "character")
