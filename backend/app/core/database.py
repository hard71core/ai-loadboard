import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Loads the project-root .env when the backend runs outside Docker (PyCharm
# run configs, a bare `uvicorn app.main:app`, pytest, ...). Inside Docker,
# docker-compose already injects these as real env vars, so this is a no-op
# there (load_dotenv never overrides an already-set variable by default).
# app/core/database.py -> parents[3] is the repo root.
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://loadboard:loadboard@localhost:5432/loadboard"
)

# pool_pre_ping avoids using stale connections after the DB container restarts.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
