"""Task 1.1: append-only POI revision audit trail.

Revision ID: o_poi_revisions_001
Revises: n_sponsor_logo_001
Create Date: 2026-07-03

Creates ``poi_revisions``, an append-only table that stores one JSONB snapshot
per admin POI mutation (create / update / delete / autosave). ``poi_id`` is
indexed but is deliberately NOT a foreign key so revisions survive the deletion
of their POI. Nothing ever updates a row once written.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'o_poi_revisions_001'
down_revision = 'n_sponsor_logo_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'poi_revisions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        # NOT a foreign key on purpose: revisions outlive their POI.
        sa.Column('poi_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.Text(), nullable=False),
        sa.Column('snapshot', postgresql.JSONB(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            "action IN ('create', 'update', 'delete')",
            name='ck_poi_revisions_action',
        ),
    )
    op.create_index('ix_poi_revisions_poi_id', 'poi_revisions', ['poi_id'])


def downgrade() -> None:
    # Dropping the table removes its index and check constraint with it.
    op.drop_table('poi_revisions')
