"""add inventory tables

Revision ID: d2c3b4a5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-03-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d2c3b4a5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inventory_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=False),
        sa.Column("serving_unit", sa.String(length=50), nullable=False),
        sa.Column("servings_per_unit", sa.Float(), nullable=False),
        sa.Column("container_size_ml", sa.Float(), nullable=False),
        sa.Column("default_shot_ml", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_inventory_item_name_per_tenant"),
    )
    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_inventory_items_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "inventory_menu_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("menu_item_id", sa.Integer(), nullable=False),
        sa.Column("deduction_ratio", sa.Float(), nullable=False),
        sa.Column("serving_type", sa.String(length=20), nullable=False),
        sa.Column("serving_value", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["menu_item_id"], ["menu_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "inventory_item_id",
            "menu_item_id",
            name="uq_inventory_menu_link_per_tenant",
        ),
    )
    with op.batch_alter_table("inventory_menu_links", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_inventory_menu_links_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "store_stock",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "inventory_item_id", name="uq_store_stock_per_tenant_item"),
    )
    with op.batch_alter_table("store_stock", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_store_stock_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "station_stock",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "station_id",
            "inventory_item_id",
            name="uq_station_inventory_per_tenant",
        ),
    )
    with op.batch_alter_table("station_stock", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_station_stock_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "stock_purchases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("stock_purchases", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_stock_purchases_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "stock_transfers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("stock_transfers", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_stock_transfers_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "station_stock_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("start_of_day_quantity", sa.Float(), nullable=False),
        sa.Column("added_quantity", sa.Float(), nullable=False),
        sa.Column("sold_quantity", sa.Float(), nullable=False),
        sa.Column("void_quantity", sa.Float(), nullable=False),
        sa.Column("remaining_quantity", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "station_id",
            "inventory_item_id",
            "snapshot_date",
            name="uq_station_item_date_per_tenant",
        ),
    )
    with op.batch_alter_table("station_stock_snapshots", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_station_stock_snapshots_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "store_stock_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("opening_quantity", sa.Float(), nullable=False),
        sa.Column("purchased_quantity", sa.Float(), nullable=False),
        sa.Column("transferred_out_quantity", sa.Float(), nullable=False),
        sa.Column("closing_quantity", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "inventory_item_id",
            "snapshot_date",
            name="uq_store_item_date_per_tenant",
        ),
    )
    with op.batch_alter_table("store_stock_snapshots", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_store_stock_snapshots_tenant_id"), ["tenant_id"], unique=False)


def downgrade():
    with op.batch_alter_table("store_stock_snapshots", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_store_stock_snapshots_tenant_id"))
    op.drop_table("store_stock_snapshots")

    with op.batch_alter_table("station_stock_snapshots", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_station_stock_snapshots_tenant_id"))
    op.drop_table("station_stock_snapshots")

    with op.batch_alter_table("stock_transfers", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_stock_transfers_tenant_id"))
    op.drop_table("stock_transfers")

    with op.batch_alter_table("stock_purchases", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_stock_purchases_tenant_id"))
    op.drop_table("stock_purchases")

    with op.batch_alter_table("station_stock", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_station_stock_tenant_id"))
    op.drop_table("station_stock")

    with op.batch_alter_table("store_stock", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_store_stock_tenant_id"))
    op.drop_table("store_stock")

    with op.batch_alter_table("inventory_menu_links", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_inventory_menu_links_tenant_id"))
    op.drop_table("inventory_menu_links")

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_inventory_items_tenant_id"))
    op.drop_table("inventory_items")
