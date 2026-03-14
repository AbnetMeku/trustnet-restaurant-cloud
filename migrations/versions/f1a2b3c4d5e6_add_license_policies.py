"""add license policies

Revision ID: f1a2b3c4d5e6
Revises: c8f2a8b9c2d1
Create Date: 2026-03-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "c8f2a8b9c2d1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "license_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("validation_interval_days", sa.Integer(), nullable=False),
        sa.Column("grace_period_days", sa.Integer(), nullable=False),
        sa.Column("lock_mode", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_license_policy_tenant"),
    )
    with op.batch_alter_table("license_policies", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_license_policies_tenant_id"), ["tenant_id"], unique=False)


def downgrade():
    with op.batch_alter_table("license_policies", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_license_policies_tenant_id"))

    op.drop_table("license_policies")
