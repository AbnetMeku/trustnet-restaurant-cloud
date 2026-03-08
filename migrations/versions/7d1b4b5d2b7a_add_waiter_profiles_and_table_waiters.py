"""add waiter profiles and table waiters

Revision ID: 7d1b4b5d2b7a
Revises: b360629b61aa
Create Date: 2026-03-08 23:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7d1b4b5d2b7a"
down_revision = "b360629b61aa"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "waiter_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("max_tables", sa.Integer(), nullable=False),
        sa.Column("allow_vip", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_waiter_profile_name_per_tenant"),
    )
    with op.batch_alter_table("waiter_profiles", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_waiter_profiles_tenant_id"), ["tenant_id"], unique=False)

    op.create_table(
        "waiter_profile_station_assoc",
        sa.Column("waiter_profile_id", sa.Integer(), nullable=False),
        sa.Column("station_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["waiter_profile_id"], ["waiter_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("waiter_profile_id", "station_id"),
    )

    op.create_table(
        "table_waiter_assoc",
        sa.Column("table_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["table_id"], ["tables.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("table_id", "user_id"),
    )

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("waiter_profile_id", sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f("ix_users_waiter_profile_id"), ["waiter_profile_id"], unique=False)
        batch_op.create_foreign_key("fk_users_waiter_profile_id", "waiter_profiles", ["waiter_profile_id"], ["id"], ondelete="SET NULL")


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("fk_users_waiter_profile_id", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_users_waiter_profile_id"))
        batch_op.drop_column("waiter_profile_id")

    op.drop_table("table_waiter_assoc")
    op.drop_table("waiter_profile_station_assoc")

    with op.batch_alter_table("waiter_profiles", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_waiter_profiles_tenant_id"))

    op.drop_table("waiter_profiles")
