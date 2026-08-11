"""Bug #87: add 'sponsor_logo' to the ImageType postgres enum.

Revision ID: n_sponsor_logo_001
Revises: m_payphone_001
Create Date: 2026-07-01

Event sponsor logos are moving from a raw URL text field to the standard
image-upload system, storing each logo as a real Image row. That requires a
dedicated image classification so a sponsor logo is distinct from every other
image type. The SQLAlchemy ImageType enum is materialised in Postgres as a
native enum type; adding a value requires ``ALTER TYPE ... ADD VALUE`` which
Postgres refuses to run inside the transaction block Alembic wraps a migration
in. We use Alembic's autocommit block so the ADD VALUE runs outside that
transaction.

This migration is purely additive; downgrade is a no-op because Postgres does
not support removing a single enum value without recreating the type and
rewriting every dependent column, an irreversible action we are unwilling to
script automatically.
"""

from alembic import op


revision = 'n_sponsor_logo_001'
down_revision = 'm_payphone_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block; the
    # autocommit block temporarily leaves Alembic's per-migration transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE imagetype ADD VALUE IF NOT EXISTS 'sponsor_logo'")


def downgrade() -> None:
    # Postgres cannot drop a single enum value safely without recreating the
    # type. Intentional no-op.
    pass
