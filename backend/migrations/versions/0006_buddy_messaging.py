"""Store Buddy passes and private messages."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "buddy_skips",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "buddy_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.CheckConstraint("user_id <> buddy_id", name="ck_buddy_skips_not_self"),
    )
    op.create_table(
        "buddy_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "sender_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "recipient_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("sender_id <> recipient_id", name="ck_buddy_messages_not_self"),
        sa.CheckConstraint("length(trim(body)) BETWEEN 1 AND 2000", name="ck_buddy_messages_body"),
    )
    op.create_index("ix_buddy_messages_sender_time", "buddy_messages", ["sender_id", "sent_at"])
    op.create_index(
        "ix_buddy_messages_recipient_time", "buddy_messages", ["recipient_id", "sent_at"]
    )


def downgrade() -> None:
    op.drop_table("buddy_messages")
    op.drop_table("buddy_skips")
