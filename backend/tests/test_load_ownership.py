"""Auth/role/ownership checks on the three mutating load endpoints.

Same DB requirement as test_health.py — see that file's docstring. Each test
registers its own users with a unique email (uuid4) so repeated runs against
a persistent local Postgres don't collide on "user already exists".
"""

import uuid

from fastapi.testclient import TestClient

from app.main import app

LOAD_PAYLOAD = {
    "title": "Test load",
    "origin": "Dallas, TX",
    "destination": "Austin, TX",
    "weight_lbs": 5000,
    "price_usd": 300,
}


def _register(client: TestClient, role: str) -> tuple[str, str]:
    """Registers a fresh user with the given role, returns (token, company_name)."""
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


def test_create_load_requires_auth():
    with TestClient(app) as client:
        res = client.post("/api/loads", json=LOAD_PAYLOAD)
    assert res.status_code == 401


def test_create_load_rejects_carrier_role():
    with TestClient(app) as client:
        token, _ = _register(client, "carrier")
        res = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {token}"}
        )
    assert res.status_code == 403


def test_shipper_creates_load_with_derived_identity():
    with TestClient(app) as client:
        token, company_name = _register(client, "shipper")
        res = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {token}"}
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["shipper_name"] == company_name
    assert body["status"] == "open"


def test_accept_rejects_shipper_role():
    with TestClient(app) as client:
        shipper_token, _ = _register(client, "shipper")
        load = client.post(
            "/api/loads",
            json=LOAD_PAYLOAD,
            headers={"Authorization": f"Bearer {shipper_token}"},
        ).json()

        res = client.post(
            f"/api/loads/{load['id']}/accept",
            headers={"Authorization": f"Bearer {shipper_token}"},
        )
    assert res.status_code == 403


def test_complete_requires_being_shipper_or_accepting_carrier():
    with TestClient(app) as client:
        shipper_token, _ = _register(client, "shipper")
        carrier_token, carrier_name = _register(client, "carrier")
        other_carrier_token, _ = _register(client, "carrier")

        load = client.post(
            "/api/loads",
            json=LOAD_PAYLOAD,
            headers={"Authorization": f"Bearer {shipper_token}"},
        ).json()

        accepted = client.post(
            f"/api/loads/{load['id']}/accept",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["carrier_name"] == carrier_name

        forbidden = client.post(
            f"/api/loads/{load['id']}/complete",
            headers={"Authorization": f"Bearer {other_carrier_token}"},
        )
        assert forbidden.status_code == 403

        completed = client.post(
            f"/api/loads/{load['id']}/complete",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "completed"
