"""Store each Experience's positivity value."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

# The docs/recommendations.md 2.1 formula at the time of this migration.
BACKFILL = """
UPDATE experiences SET value = CASE verdict
    WHEN 'recommend' THEN 1.0
    WHEN 'avoid' THEN -1.0
    ELSE (rating - 3) / 2.0
END
"""


def upgrade() -> None:
    op.add_column("experiences", sa.Column("value", sa.Float(), nullable=True))
    op.execute(BACKFILL)
    op.alter_column("experiences", "value", nullable=False)
    op.create_check_constraint(
        "ck_experiences_value_range", "experiences", "value BETWEEN -1 AND 1"
    )


def downgrade() -> None:
    op.drop_constraint("ck_experiences_value_range", "experiences", type_="check")
    op.drop_column("experiences", "value")
