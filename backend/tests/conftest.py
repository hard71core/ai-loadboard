"""Shared test helpers. See test_health.py's docstring for the DB
requirement common to every test module here."""

import uuid

from fastapi.testclient import TestClient


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
