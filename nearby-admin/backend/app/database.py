from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .core.config import settings

# Single shared declarative Base — the ORM is defined once in shared/models/
# (Task 1.2). Re-exported here so existing `from app.database import Base`
# imports and Alembic's env.py keep working.
from shared.models.base import Base

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()