"""
Create database tables using current SQLAlchemy models.
Run with DATABASE_URL set to your PostgreSQL connection string.
"""

from database import Base, engine
import models  # noqa: F401  # Ensure model metadata is registered


def run_migrations() -> None:
    Base.metadata.create_all(bind=engine)
    print("Migration complete: tables are created/updated where possible.")


if __name__ == "__main__":
    run_migrations()
