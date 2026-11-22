"""Add private profile lists and their Experience entries."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_lists",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_profile_lists_user_id", "profile_lists", ["user_id"])
    op.create_table(
        "profile_list_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "list_id",
            sa.Uuid(),
            sa.ForeignKey("profile_lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("location", sa.String(160), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_profile_list_entries_list_id", "profile_list_entries", ["list_id"])


def downgrade() -> None:
    op.drop_table("profile_list_entries")
    op.drop_table("profile_lists")
