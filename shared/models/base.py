"""Single shared SQLAlchemy declarative Base for the whole platform.

Both nearby-admin and nearby-app re-export this Base from their own
``app.database`` module, and admin's Alembic ``env.py`` targets
``Base.metadata``. Defining every shared ORM model once against this one Base is
what makes structural drift between the two backends impossible (Task 1.2).
"""

from sqlalchemy.orm import declarative_base

Base = declarative_base()
