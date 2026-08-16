"""Shared test helpers. See test_health.py's docstring for the DB
requirement common to every test module here."""

import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def _apply_migrations():
    """Runs `alembic upgrade head` once before any test — mirrors what
    backend/entrypoint.sh does for the real app, so `docker compose up -d db
    && pytest` still just works without a separate manual migration step.
    Idempotent (a no-op once the DB's already at head), so it's harmless
    that CI also runs its own explicit migration step before pytest — see
    .github/workflows/ci.yml."""
    backend_dir = Path(__file__).resolve().parents[1]
    command.upgrade(Config(str(backend_dir / "alembic.ini")), "head")


def register_user(client: TestClient, role: str) -> tuple[str, str]:
    """Registers a fresh user with the given role (unique email via uuid4,
    so repeat runs against a persistent local Postgres don't collide on
    "user already exists"). Returns (token, company_name)."""
    company_name = f"{role}-{uuid.uuid4().hex[:8]}"
    res = client.post(
        "/api/auth/register",
        json={
            "email": f"{uuid.uuid4().hex}@example.com",
            "password": "secret123",
            "company_name": company_name,
            "role": role,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["access_token"], company_name
