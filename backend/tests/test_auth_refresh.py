"""POST /api/auth/refresh and /api/auth/logout — refresh-token rotation and
revocation (backend/app/core/security.py). Same DB requirement as
test_health.py.

The expiry test reaches into the DB directly (SessionLocal) to backdate a
refresh token's expires_at, rather than waiting out REFRESH_TOKEN_EXPIRE_DAYS
or mocking time — the row is the source of truth the route checks against,
so backdating it is the most direct way to exercise that branch.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app import models
from app.core.database import SessionLocal
from app.core.security import _hash_token
from app.main import app


def _register(client: TestClient, role: str) -> dict:
    """Like conftest.py's register_user, but returns the full response body
    (register_user only returns access_token + company_name) — these tests
    need refresh_token too. Unique email per call (uuid4), same reasoning as
    register_user: repeat runs against a persistent local Postgres shouldn't
    collide on "user already exists"."""
    res = client.post(
        "/api/auth/register",
        json={
            "email": f"{uuid.uuid4().hex}@example.com",
            "password": "secret123",
            "company_name": f"{role}-{uuid.uuid4().hex[:8]}",
            "role": role,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_register_issues_both_tokens():
    with TestClient(app) as client:
        body = _register(client, "shipper")
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["access_token"] != body["refresh_token"]


def test_refresh_rotates_and_old_token_is_rejected():
    with TestClient(app) as client:
        old_refresh = _register(client, "carrier")["refresh_token"]

        first_use = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
        assert first_use.status_code == 200, first_use.text
        new_body = first_use.json()
        assert new_body["refresh_token"] != old_refresh

        # Replaying the now-rotated-away token must fail — this is the whole
        # point of rotation: a leaked-and-later-replayed token is a rejected
        # reuse, not a silently-still-valid second session.
        replay = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
        assert replay.status_code == 401

        # The freshly-issued refresh token from the first rotation still works.
        second_use = client.post(
            "/api/auth/refresh", json={"refresh_token": new_body["refresh_token"]}
        )
        assert second_use.status_code == 200, second_use.text


def test_refresh_rejects_garbage_token():
    with TestClient(app) as client:
        res = client.post("/api/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert res.status_code == 401


def test_refresh_rejects_expired_token():
    with TestClient(app) as client:
        raw_token = _register(client, "shipper")["refresh_token"]

        db = SessionLocal()
        try:
            row = (
                db.query(models.RefreshToken)
                .filter(models.RefreshToken.token_hash == _hash_token(raw_token))
                .first()
            )
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            db.commit()
        finally:
            db.close()

        res = client.post("/api/auth/refresh", json={"refresh_token": raw_token})
    assert res.status_code == 401


def test_logout_revokes_refresh_token():
    with TestClient(app) as client:
        raw_token = _register(client, "carrier")["refresh_token"]

        logout = client.post("/api/auth/logout", json={"refresh_token": raw_token})
        assert logout.status_code == 204

        res = client.post("/api/auth/refresh", json={"refresh_token": raw_token})
    assert res.status_code == 401


def test_logout_is_a_no_op_for_an_unknown_token():
    with TestClient(app) as client:
        res = client.post("/api/auth/logout", json={"refresh_token": "never-issued"})
    assert res.status_code == 204
