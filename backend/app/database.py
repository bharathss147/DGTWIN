"""
database.py — SQLAlchemy engine and session management for FactoryMind AI.

Uses SQLite via the existing factorymind_database.db file.
Tables are created only if they do not already exist.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./factorymind_database.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite + threading
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that provides a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Create all tables that do not already exist.
    Safe to call on every startup — will never drop or recreate existing tables.
    """
    # Import models so that Base knows about them before create_all
    import app.db_models  # noqa: F401
    Base.metadata.create_all(bind=engine, checkfirst=True)
