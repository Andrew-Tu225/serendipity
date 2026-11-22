"""Persist first-login category interests and completion.

This previously shared revision 0005 with the user character migration, so databases
that applied the character branch never received it. Statements are idempotent, and
`users.character` is restored for databases that applied the onboarding 0005 instead.
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS character JSONB")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ")
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_interests (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category VARCHAR(20) NOT NULL,
            PRIMARY KEY (user_id, category),
            CONSTRAINT ck_user_interests_category CHECK (category IN (
                'restaurant','cafe','bar','trail','park','viewpoint','gym',
                'climbing','museum','gallery','bookstore','shop','attraction','other'
            ))
        )
    """)


def downgrade() -> None:
    op.drop_table("user_interests")
    op.drop_column("users", "onboarding_completed_at")
