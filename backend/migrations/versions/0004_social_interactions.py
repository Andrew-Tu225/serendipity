"""Add Experience likes, private bookmarks, and comments."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("experience_likes", "experience_bookmarks", "experience_comments"):
        comment = table == "experience_comments"
        columns = [
            sa.Column(
                "user_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=not comment,
                nullable=False,
            ),
            sa.Column(
                "experience_id",
                sa.Uuid(),
                sa.ForeignKey("experiences.id", ondelete="CASCADE"),
                primary_key=not comment,
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        ]
        if comment:
            columns.extend(
                [
                    sa.Column("id", sa.Uuid(), primary_key=True),
                    sa.Column("body", sa.Text(), nullable=False),
                    sa.Column(
                        "updated_at",
                        sa.DateTime(timezone=True),
                        server_default=sa.func.now(),
                        nullable=False,
                    ),
                    sa.CheckConstraint(
                        "length(trim(body)) > 0 AND length(body) <= 2000",
                        name="ck_experience_comments_body",
                    ),
                ]
            )
        op.create_table(table, *columns)
        if comment:
            op.create_index(
                "ix_experience_comments_experience_created",
                table,
                ["experience_id", "created_at", "id"],
            )
            op.create_index("ix_experience_comments_user_id", table, ["user_id"])
        else:
            op.create_index(f"ix_{table}_experience_id", table, ["experience_id"])


def downgrade() -> None:
    for table in ("experience_comments", "experience_bookmarks", "experience_likes"):
        op.drop_table(table)
