"""POST /api/auth/register, /login, and GET /api/auth/me — the everyday
paths plus their failure branches (duplicate email, wrong password,
malformed/forged/stale tokens). test_auth_refresh.py covers the
refresh/logout rotation-and-revocation machinery specifically; this file is
the rest of core/security.py's get_current_user and auth.py's
register/login/me. Same DB requirement as test_health.py.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from jose import jwt

from app.core.security import ALGORITHM, SECRET_KEY, create_access_token
from app.main import app

from .conftest import register_user


def test_register_rejects_duplicate_email():
    with TestClient(app) as client:
        email = f"{uuid.uuid4().hex}@example.com"
        payload = {
            "email": email,
            "password": "secret123",
            "company_name": "First Co",
            "role": "shipper",
        }
        first = client.post("/api/auth/register", json=payload)
        assert first.status_code == 201, first.text

        second = client.post(
            "/api/auth/register",
            json={**payload, "company_name": "Second Co"},
        )
    assert second.status_code == 400


def test_login_rejects_unknown_email():
    with TestClient(app) as client:
        res = client.post(
            "/api/auth/login",
            json={"email": f"{uuid.uuid4().hex}@example.com", "password": "whatever"},
        )
    assert res.status_code == 401


def test_login_rejects_wrong_password():
    with TestClient(app) as client:
        email = f"{uuid.uuid4().hex}@example.com"
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "correct-password",
                "company_name": "Probe Co",
                "role": "carrier",
            },
        )
        res = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    assert res.status_code == 401


def test_login_returns_matching_user_and_token_pair():
    with TestClient(app) as client:
        email = f"{uuid.uuid4().hex}@example.com"
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "secret123",
                "company_name": "Login Probe Co",
                "role": "shipper",
            },
        )
        res = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["user"]["email"] == email
    assert body["access_token"]
    assert body["refresh_token"]


def test_me_returns_current_user():
    with TestClient(app) as client:
        token, company_name = register_user(client, "carrier")
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.json()["company_name"] == company_name


def test_me_requires_a_token():
    with TestClient(app) as client:
        res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_rejects_a_malformed_token():
    with TestClient(app) as client:
        res = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert res.status_code == 401


def test_me_rejects_a_validly_signed_token_for_a_deleted_or_unknown_user():
    """create_access_token doesn't check the subject exists — it's a pure
    JWT-signing function, deliberately dumb (see core/security.py). A token
    signed for an email no user has (never registered, or the user was
    since deleted) must still be rejected by get_current_user's DB lookup."""
    with TestClient(app) as client:
        token = create_access_token("nobody-with-this-email@example.com")
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_rejects_a_validly_signed_token_with_no_subject_claim():
    """create_access_token always sets sub — a token missing it entirely
    isn't reachable through that function, only by constructing one by
    hand, but get_current_user still needs to reject it rather than crash
    on payload.get("sub") returning None further down."""
    token = jwt.encode(
        {"exp": datetime.now(UTC) + timedelta(minutes=5)}, SECRET_KEY, algorithm=ALGORITHM
    )
    with TestClient(app) as client:
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
