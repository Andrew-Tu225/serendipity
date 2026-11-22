"""Link app-authored Places to an optional Google identifier."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("places", sa.Column("google_place_id", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_places_google_place_id", "places", ["google_place_id"])


def downgrade() -> None:
    op.drop_constraint("uq_places_google_place_id", "places", type_="unique")
    op.drop_column("places", "google_place_id")
