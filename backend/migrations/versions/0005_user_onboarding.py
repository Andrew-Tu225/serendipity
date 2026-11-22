"""Persist first-login category interests and completion."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True)))
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
    )


def downgrade() -> None:
    op.drop_table("user_interests")
    op.drop_column("users", "onboarding_completed_at")
