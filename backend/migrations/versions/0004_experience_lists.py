"""Create named lists of Experiences."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lists",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("length(name) BETWEEN 1 AND 80", name="ck_lists_name_length"),
        sa.CheckConstraint(
            "description IS NULL OR length(description) <= 500",
            name="ck_lists_description_length",
        ),
    )
    op.create_index("ix_lists_user_id", "lists", ["user_id"])
    op.create_table(
        "list_items",
        sa.Column(
            "list_id",
            sa.Uuid(),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "experience_id",
            sa.Uuid(),
            sa.ForeignKey("experiences.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "added_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_list_items_experience_id", "list_items", ["experience_id"])


def downgrade() -> None:
    op.drop_index("ix_list_items_experience_id", table_name="list_items")
    op.drop_table("list_items")
    op.drop_index("ix_lists_user_id", table_name="lists")
    op.drop_table("lists")
