"""GET /api/loads/{load_id} — the single-load detail endpoint behind the
frontend's load detail page. Same DB requirement as test_health.py.
"""

from fastapi.testclient import TestClient

from app.main import app

from .conftest import register_user

LOAD_PAYLOAD = {
    "title": "Detail page probe",
    "origin": "Dallas, TX",
    "destination": "Austin, TX",
    "weight_lbs": 5000,
    "price_usd": 300,
}


def test_get_load_returns_full_detail():
    with TestClient(app) as client:
        token, company_name = register_user(client, "shipper")
        created = client.post(
            "/api/loads", json=LOAD_PAYLOAD, headers={"Authorization": f"Bearer {token}"}
        ).json()

        res = client.get(f"/api/loads/{created['id']}")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == created["id"]
    assert body["title"] == LOAD_PAYLOAD["title"]
    assert body["shipper_name"] == company_name


def test_get_load_404s_for_unknown_id():
    with TestClient(app) as client:
        res = client.get("/api/loads/999999999")
    assert res.status_code == 404


def test_get_load_does_not_shadow_matches_route():
    """GET /api/loads/matches must still resolve to matching.py's route, not
    404 out of loads.py's GET /{load_id}: int trying (and failing) to parse
    "matches" as an id — see get_load()'s docstring."""
    with TestClient(app) as client:
        token, _ = register_user(client, "carrier")
        res = client.get("/api/loads/matches", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)
