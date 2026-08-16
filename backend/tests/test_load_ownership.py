"""Auth/role/ownership checks on the three mutating load endpoints.

Same DB requirement as test_health.py — see that file's docstring. Each test
registers its own users with a unique email (uuid4) so repeated runs against
a persistent local Postgres don't collide on "user already exists".
"""

from fastapi.testclient import TestClient

from app.main import app

from .conftest import register_user

LOAD_PAYLOAD = {
    "title": "Test load",
    "origin": "Dallas, TX",
    "destination": "Austin, TX",
    "weight_lbs": 5000,
    "price_usd": 300,
}


def test_create_load_requires_auth():
    with TestClient(app) as client:
        res = client.post("/api/loads", json=LOAD_PAYLOAD)
    assert res.status_code == 401


def test_create_load_rejects_carrier_role():
    with TestClient(app) as client:
        token, _ = register_user(client, "carrier")
        res = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {token}"}
        )
    assert res.status_code == 403


def test_shipper_creates_load_with_derived_identity():
    with TestClient(app) as client:
        token, company_name = register_user(client, "shipper")
        res = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {token}"}
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["shipper_name"] == company_name
    assert body["status"] == "open"


def test_accept_rejects_shipper_role():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
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
        shipper_token, _ = register_user(client, "shipper")
        carrier_token, carrier_name = register_user(client, "carrier")
        other_carrier_token, _ = register_user(client, "carrier")

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


def test_accept_returns_404_for_unknown_load():
    with TestClient(app) as client:
        carrier_token, _ = register_user(client, "carrier")
        res = client.post(
            "/api/loads/999999/accept",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )
    assert res.status_code == 404


def test_accept_rejects_a_load_that_is_already_taken():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        first_carrier, _ = register_user(client, "carrier")
        second_carrier, _ = register_user(client, "carrier")

        load = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {shipper_token}"}
        ).json()

        first_accept = client.post(
            f"/api/loads/{load['id']}/accept",
            headers={"Authorization": f"Bearer {first_carrier}"},
        )
        assert first_accept.status_code == 200, first_accept.text

        second_accept = client.post(
            f"/api/loads/{load['id']}/accept",
            headers={"Authorization": f"Bearer {second_carrier}"},
        )
        assert second_accept.status_code == 400


def test_complete_returns_404_for_unknown_load():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        res = client.post(
            "/api/loads/999999/complete",
            headers={"Authorization": f"Bearer {shipper_token}"},
        )
    assert res.status_code == 404


def test_complete_rejects_a_load_that_was_never_accepted():
    """Regression test: complete_load used to only check ownership
    (current_user in (shipper_id, carrier_id)), not status — since
    carrier_id is None on an open load, the shipper is always "in" that
    tuple for their own load, so an open load could jump straight to
    completed without ever going through accepted. See
    api/routes/loads.py's complete_load for the status check this covers."""
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        load = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {shipper_token}"}
        ).json()
        assert load["status"] == "open"

        res = client.post(
            f"/api/loads/{load['id']}/complete",
            headers={"Authorization": f"Bearer {shipper_token}"},
        )
    assert res.status_code == 400


def test_complete_rejects_a_load_that_is_already_completed():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        carrier_token, _ = register_user(client, "carrier")
        load = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {shipper_token}"}
        ).json()
        client.post(
            f"/api/loads/{load['id']}/accept",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )
        first_complete = client.post(
            f"/api/loads/{load['id']}/complete",
            headers={"Authorization": f"Bearer {shipper_token}"},
        )
        assert first_complete.status_code == 200, first_complete.text

        second_complete = client.post(
            f"/api/loads/{load['id']}/complete",
            headers={"Authorization": f"Bearer {shipper_token}"},
        )
    assert second_complete.status_code == 400
