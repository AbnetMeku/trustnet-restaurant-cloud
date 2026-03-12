"""enforce global unique usernames

Revision ID: c8f2a8b9c2d1
Revises: 7d1b4b5d2b7a
Create Date: 2026-03-13 12:41:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "c8f2a8b9c2d1"
down_revision = "7d1b4b5d2b7a"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("uq_username_per_tenant", type_="unique")
        batch_op.create_unique_constraint("uq_username_global", ["username"])


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("uq_username_global", type_="unique")
        batch_op.create_unique_constraint("uq_username_per_tenant", ["tenant_id", "username"])
