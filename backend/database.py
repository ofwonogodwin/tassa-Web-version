"""
Database configuration for TAASA system.
Defaults to SQLite locally and supports PostgreSQL/Supabase via DATABASE_URL.
"""

import os
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def _get_database_url() -> str:
    """
    Read database URL from env.
    Priority:
    1. DATABASE_URL
    2. SUPABASE_DATABASE_URL
    3. Local SQLite fallback for development
    """
    return (
        os.getenv("DATABASE_URL")
        or os.getenv("SUPABASE_DATABASE_URL")
        or "sqlite:///./taasa.db"
    )


def _normalize_database_url(raw_url: str) -> str:
    """Normalize postgres URLs for SQLAlchemy + psycopg2."""
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return raw_url


def _ensure_sslmode_require(url: str) -> str:
    """
    Supabase Postgres requires SSL.
    Adds sslmode=require when missing.
    """
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if "sslmode" not in query:
        query["sslmode"] = "require"
    return urlunparse(parsed._replace(query=urlencode(query)))


database_url = _normalize_database_url(_get_database_url())
require_external_db = os.getenv("TAASA_REQUIRE_EXTERNAL_DB", "false").lower() == "true"

if require_external_db and database_url.startswith("sqlite"):
    raise RuntimeError(
        "TAASA_REQUIRE_EXTERNAL_DB=true but no external Postgres URL was configured. "
        "Set DATABASE_URL or SUPABASE_DATABASE_URL."
    )

engine_kwargs = {"pool_pre_ping": True}
if database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    database_url = _ensure_sslmode_require(database_url)
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(database_url, **engine_kwargs)

# Session factory for database operations
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for ORM models
Base = declarative_base()


def get_database_info() -> dict:
    """Return non-sensitive runtime database details for diagnostics."""
    backend = "sqlite" if database_url.startswith("sqlite") else "postgresql"
    host = "local-file"
    if backend == "postgresql":
        host = urlparse(database_url).hostname or "unknown-host"
    return {
        "backend": backend,
        "host": host,
        "using_external_database": backend == "postgresql",
    }


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
