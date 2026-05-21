"""add missing inventory fields

Revision ID: a2b3c4d5e6f7
Revises: e3a4b5c6d7e8
Create Date: 2026-05-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a2b3c4d5e6f7"
down_revision = "e3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade():
    # Add shots_per_bottle to inventory_items (was missing from initial inventory migration)
    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("shots_per_bottle", sa.Float(), nullable=False, server_default="0.0")
        )

    # Add opening_adjusted to station_stock_snapshots (was missing from initial inventory migration)
    with op.batch_alter_table("station_stock_snapshots", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("opening_adjusted", sa.Boolean(), nullable=False, server_default=sa.false())
        )

    # Add opening_adjusted to store_stock_snapshots (was missing from initial inventory migration)
    with op.batch_alter_table("store_stock_snapshots", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("opening_adjusted", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade():
    with op.batch_alter_table("store_stock_snapshots", schema=None) as batch_op:
        batch_op.drop_column("opening_adjusted")

    with op.batch_alter_table("station_stock_snapshots", schema=None) as batch_op:
        batch_op.drop_column("opening_adjusted")

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.drop_column("shots_per_bottle")
