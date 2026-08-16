"""GET /api/loads/{id}/eta — core/eta.py's Nominatim/OSRM calls are mocked
here (patched at the import site inside app.api.routes.eta, not in
app.core.eta — same reasoning as test_search.py's Anthropic mock), so these
run in CI with no network access. What core/eta.py itself does with a real
network call is not this file's concern; this file's concern is that the
route builds the right response shape in each of the three states: no
route data available, not yet accepted, and accepted.

Same DB requirement as test_health.py.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.eta import TransitEstimate
from app.main import app

from .conftest import register_user

LOAD_PAYLOAD = {
    "title": "Test load",
    "origin": "Dallas, TX",
    "destination": "Houston, TX",
    "weight_lbs": 5000,
    "price_usd": 300,
}

_FAKE_TRANSIT = TransitEstimate(distance_miles=240.0, drive_hours_min=4.0, drive_hours_max=5.2)


def _post_load(client: TestClient, token: str) -> dict:
    res = client.post("/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    return res.json()


def test_eta_returns_404_for_unknown_load():
    with TestClient(app) as client:
        res = client.get("/api/loads/999999/eta")
    assert res.status_code == 404


def test_eta_degrades_gracefully_when_routing_unavailable():
    with patch("app.api.routes.eta.estimate_transit", return_value=None):
        with TestClient(app) as client:
            token, _ = register_user(client, "shipper")
            load = _post_load(client, token)
            res = client.get(f"/api/loads/{load['id']}/eta")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["distance_miles"] is None
    assert body["drive_hours_min"] is None
    assert body["eta_earliest"] is None
    assert "unavailable" in body["basis"].lower()


def test_eta_open_load_has_transit_estimate_but_no_arrival_window():
    with patch("app.api.routes.eta.estimate_transit", return_value=_FAKE_TRANSIT):
        with TestClient(app) as client:
            token, _ = register_user(client, "shipper")
            load = _post_load(client, token)
            res = client.get(f"/api/loads/{load['id']}/eta")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "open"
    assert body["distance_miles"] == _FAKE_TRANSIT.distance_miles
    assert body["drive_hours_min"] == _FAKE_TRANSIT.drive_hours_min
    assert body["drive_hours_max"] == _FAKE_TRANSIT.drive_hours_max
    assert body["eta_earliest"] is None
    assert body["eta_latest"] is None


def test_eta_accepted_load_has_arrival_window_from_accepted_at():
    with patch("app.api.routes.eta.estimate_transit", return_value=_FAKE_TRANSIT):
        with TestClient(app) as client:
            shipper_token, _ = register_user(client, "shipper")
            carrier_token, _ = register_user(client, "carrier")
            load = _post_load(client, shipper_token)

            before_accept = datetime.now(UTC)
            accepted = client.post(
                f"/api/loads/{load['id']}/accept",
                headers={"Authorization": f"Bearer {carrier_token}"},
            )
            assert accepted.status_code == 200, accepted.text

            res = client.get(f"/api/loads/{load['id']}/eta")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "accepted"
    eta_earliest = datetime.fromisoformat(body["eta_earliest"])
    eta_latest = datetime.fromisoformat(body["eta_latest"])
    # eta_earliest/eta_latest = accepted_at + drive_hours_min/max — assert
    # the band, not an exact timestamp (accepted_at isn't returned as-is).
    assert eta_earliest > before_accept + timedelta(hours=_FAKE_TRANSIT.drive_hours_min - 0.01)
    assert eta_latest > eta_earliest
    assert (eta_latest - eta_earliest) == timedelta(
        hours=_FAKE_TRANSIT.drive_hours_max - _FAKE_TRANSIT.drive_hours_min
    )
