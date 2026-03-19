"""add items_data to order summaries

Revision ID: f9c1d2e3f4a5
Revises: e3a4b5c6d7e8
Create Date: 2026-03-19 10:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f9c1d2e3f4a5"
down_revision = "e3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("order_summaries", sa.Column("items_data", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("order_summaries", "items_data")
