"""Reconcile the Experience schemas that previously shared revision 0004."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The buddy branch already stored a value. Only backfill older Experiences.
    op.execute("ALTER TABLE experiences ADD COLUMN IF NOT EXISTS value DOUBLE PRECISION")
    op.execute("""
        UPDATE experiences SET value = CASE verdict
            WHEN 'recommend' THEN 1.0
            WHEN 'avoid' THEN -1.0
            ELSE (rating - 3) / 2.0
        END
        WHERE value IS NULL
    """)
    op.alter_column("experiences", "value", nullable=False)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_experiences_value_range'
                    AND conrelid = 'experiences'::regclass
            ) THEN
                ALTER TABLE experiences ADD CONSTRAINT ck_experiences_value_range
                    CHECK (value BETWEEN -1 AND 1);
            END IF;
        END $$;
    """)

    # The social branch already has these tables and indexes from its revision 0004.
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
        op.create_table(table, *columns, if_not_exists=True)
        if comment:
            op.create_index(
                "ix_experience_comments_experience_created",
                table,
                ["experience_id", "created_at", "id"],
                if_not_exists=True,
            )
            op.create_index(
                "ix_experience_comments_user_id", table, ["user_id"], if_not_exists=True
            )
        else:
            op.create_index(
                f"ix_{table}_experience_id", table, ["experience_id"], if_not_exists=True
            )


def downgrade() -> None:
    op.drop_constraint("ck_experiences_value_range", "experiences", type_="check")
    op.drop_column("experiences", "value")
