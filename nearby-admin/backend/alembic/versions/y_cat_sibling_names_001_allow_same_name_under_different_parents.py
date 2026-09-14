"""Allow same category name under different parents (#192)

Drops the global unique constraint on categories.name (categories_name_key)
and replaces it with a case-insensitive uniqueness rule per parent: an
expression index on (COALESCE(parent_id, zero uuid), lower(name)) so siblings
still cannot share a name and two same-named roots collide too.

Revision ID: y_cat_sibling_names_001
Revises: x_parking_lots_001
Create Date: 2026-09-14

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'y_cat_sibling_names_001'
down_revision = 'x_parking_lots_001'
branch_labels = None
depends_on = None

# Index name kept under the 63-char Postgres identifier limit.
SIBLING_INDEX = 'ix_categories_parent_lower_name'


def upgrade() -> None:
    # The old constraint may exist either as a bare unique constraint (created
    # by a1b2c3d4e5f6) or as the unique index that older snapshot-restored
    # databases carry; try both before giving up.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'categories_name_key'
                  AND conrelid = 'categories'::regclass
            ) THEN
                ALTER TABLE categories DROP CONSTRAINT categories_name_key;
            ELSIF EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'categories_name_key'
                  AND tablename = 'categories'
            ) THEN
                DROP INDEX categories_name_key;
            END IF;
        END $$;
    """)
    op.create_index(
        SIBLING_INDEX,
        'categories',
        [sa.text("COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
         sa.text('lower(name)')],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(SIBLING_INDEX, table_name='categories')
    op.create_unique_constraint('categories_name_key', 'categories', ['name'])
