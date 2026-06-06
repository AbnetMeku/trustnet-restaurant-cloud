"""add notes to purchases and transfers

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def _add_note_column(table_name: str) -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns(table_name)}
    if "note" not in columns:
        op.add_column(table_name, sa.Column("note", sa.Text(), nullable=True))


def upgrade():
    _add_note_column("stock_purchases")
    _add_note_column("stock_transfers")


def downgrade():
    inspector = sa.inspect(op.get_bind())
    for table_name in ("stock_purchases", "stock_transfers"):
        columns = {col["name"] for col in inspector.get_columns(table_name)}
        if "note" in columns:
            op.drop_column(table_name, "note")
