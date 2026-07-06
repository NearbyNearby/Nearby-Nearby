# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .core.config import settings

# Single shared declarative Base — the shared platform ORM is defined once in
# shared/models/ (Task 1.2). Re-exported here so `from ..database import Base`
# keeps working. Both backends now map the same classes on the same Base.
from shared.models.base import Base

# App-local declarative base for the public form-submission tables (waitlist,
# contact, feedback, etc.). These live in the forms DB and are NOT part of the
# shared platform schema, so they stay OFF the shared Base. Keeping them on a
# module-local base also means they re-register cleanly when the test harness
# swaps app modules in/out (the shared Base's metadata persists across that swap).
FormsBase = declarative_base()

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Forms database — isolated engine for public form submissions.
# Falls back to main DATABASE_URL when FORMS_DATABASE_URL is empty.
_forms_url = settings.FORMS_DATABASE_URL or settings.DATABASE_URL
forms_engine = create_engine(_forms_url)
FormsSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=forms_engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_forms_db():
    db = FormsSessionLocal()
    try:
        yield db
    finally:
        db.close()