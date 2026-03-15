"""add sync id map

Revision ID: 1c4d5f6a7b8c
Revises: f1a2b3c4d5e6
Create Date: 2026-03-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1c4d5f6a7b8c"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "sync_id_map",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("local_id", sa.String(length=64), nullable=False),
        sa.Column("cloud_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "entity_type", "local_id", name="uq_sync_id_map"),
    )
    with op.batch_alter_table("sync_id_map", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_sync_id_map_tenant_id"), ["tenant_id"], unique=False)


def downgrade():
    with op.batch_alter_table("sync_id_map", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sync_id_map_tenant_id"))
    op.drop_table("sync_id_map")
