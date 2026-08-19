"""GET /api/loads/mine — the personal-cabinet page's load list: every load
the caller shows up on, either side (posted as shipper, accepted as
carrier), any status. Same DB requirement as test_health.py.
"""

from fastapi.testclient import TestClient

from app.main import app

from .conftest import register_user


def _post_load(client: TestClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Mine probe load",
        "origin": "Dallas, TX",
        "destination": "Austin, TX",
        "weight_lbs": 5000,
        "price_usd": 300,
        **overrides,
    }
    res = client.post("/api/loads", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    return res.json()


def test_mine_requires_a_token():
    with TestClient(app) as client:
        res = client.get("/api/loads/mine")
    assert res.status_code == 401


def test_mine_is_empty_for_a_user_with_no_loads():
    with TestClient(app) as client:
        token, _ = register_user(client, "shipper")
        res = client.get("/api/loads/mine", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.json() == []


def test_mine_returns_a_shippers_posted_loads_only():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        other_shipper_token, _ = register_user(client, "shipper")
        mine = _post_load(client, shipper_token, title="My load")
        _post_load(client, other_shipper_token, title="Someone else's load")

        res = client.get("/api/loads/mine", headers={"Authorization": f"Bearer {shipper_token}"})

    assert res.status_code == 200, res.text
    ids = [load["id"] for load in res.json()]
    assert ids == [mine["id"]]


def test_mine_returns_a_carriers_accepted_loads_only():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        carrier_token, _ = register_user(client, "carrier")
        other_carrier_token, _ = register_user(client, "carrier")

        accepted = _post_load(client, shipper_token, title="Accepted by me")
        untouched = _post_load(client, shipper_token, title="Never accepted")
        client.post(
            f"/api/loads/{accepted['id']}/accept",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )

        res = client.get("/api/loads/mine", headers={"Authorization": f"Bearer {carrier_token}"})

    assert res.status_code == 200, res.text
    ids = {load["id"] for load in res.json()}
    assert ids == {accepted["id"]}
    assert untouched["id"] not in ids

    with TestClient(app) as client:
        other_res = client.get(
            "/api/loads/mine", headers={"Authorization": f"Bearer {other_carrier_token}"}
        )
    assert other_res.json() == []


def test_mine_orders_newest_first():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        first = _post_load(client, shipper_token, title="Posted first")
        second = _post_load(client, shipper_token, title="Posted second")

        res = client.get("/api/loads/mine", headers={"Authorization": f"Bearer {shipper_token}"})

    ids = [load["id"] for load in res.json()]
    assert ids.index(second["id"]) < ids.index(first["id"])
