"""add stock_unit to inventory items

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-06-20 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c4d5e6f7a8b9"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("inventory_items")}
    if "stock_unit" not in columns:
        op.add_column(
            "inventory_items",
            sa.Column("stock_unit", sa.String(length=20), nullable=False, server_default="bottle"),
        )

    op.execute(
        """
        UPDATE inventory_items
        SET stock_unit = CASE
            WHEN COALESCE(shots_per_bottle, 0) > 0 THEN 'bottle'
            WHEN LOWER(COALESCE(unit, '')) IN ('kg', 'kilogram', 'kilograms') THEN 'kg'
            WHEN LOWER(COALESCE(unit, '')) IN ('g', 'gram', 'grams') THEN 'g'
            WHEN LOWER(COALESCE(unit, '')) IN ('l', 'liter', 'litre', 'liters', 'litres') THEN 'l'
            WHEN LOWER(COALESCE(unit, '')) IN ('ml', 'milliliter', 'millilitre') THEN 'ml'
            WHEN LOWER(COALESCE(unit, '')) IN ('piece', 'pcs', 'pc', 'unit', 'each') THEN 'piece'
            ELSE 'bottle'
        END
        WHERE stock_unit IS NULL OR stock_unit = '' OR stock_unit = 'bottle'
        """
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {col["name"] for col in inspector.get_columns("inventory_items")}
    if "stock_unit" in columns:
        op.drop_column("inventory_items", "stock_unit")
