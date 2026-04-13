"""add print jobs

Revision ID: a1b2c3d4e5f6
Revises: f9c1d2e3f4a5
Create Date: 2026-04-13 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "f9c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "print_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("store_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.String(length=64), nullable=True),
        sa.Column("station_id", sa.Integer(), nullable=True),
        sa.Column("station_name", sa.String(length=120), nullable=True),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="station"),
        sa.Column("items_data", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retry_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_print_jobs_tenant_id", "print_jobs", ["tenant_id"])
    op.create_index("ix_print_jobs_store_id", "print_jobs", ["store_id"])


def downgrade():
    op.drop_index("ix_print_jobs_store_id", table_name="print_jobs")
    op.drop_index("ix_print_jobs_tenant_id", table_name="print_jobs")
    op.drop_table("print_jobs")
