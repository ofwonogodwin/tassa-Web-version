"""
Database configuration for TAASA system.
Defaults to SQLite locally and supports PostgreSQL via DATABASE_URL.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Use PostgreSQL in production by setting DATABASE_URL.
# Falls back to local SQLite for local development.
database_url = os.getenv("DATABASE_URL", "sqlite:///./taasa.db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)

engine_kwargs = {}
if database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(database_url, **engine_kwargs)

# Session factory for database operations
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for ORM models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session.
    Ensures session is closed after request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
