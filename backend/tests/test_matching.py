"""GET /api/loads/matches — the deterministic ranking heuristic in
api/routes/matching.py, not an LLM call (see that module's docstring for
why there's no AI here yet). Same persistent-DB caveat as test_health.py:
these tests use unique titles/companies and assert relative ordering or
membership, never an exact full-list snapshot, so leftover rows from other
test runs can't make them flaky.
"""

from fastapi.testclient import TestClient

from app.main import app

from .conftest import register_user


def _post_load(client: TestClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Matching test load",
        "origin": "Dallas, TX",
        "destination": "Houston, TX",
        "equipment_type": "Reefer",
        "weight_lbs": 38000,
        "price_usd": 850,
    }
    payload.update(overrides)
    res = client.post("/api/loads", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    return res.json()


def test_matches_rejects_unauthenticated():
    with TestClient(app) as client:
        res = client.get("/api/loads/matches")
    assert res.status_code == 401, res.text


def test_matches_rejects_shipper_role():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        res = client.get("/api/loads/matches", headers={"Authorization": f"Bearer {shipper_token}"})
    assert res.status_code == 403, res.text


def test_matches_cold_start_matches_plain_open_list():
    """A carrier with zero history has no signal to rank on — matches must
    equal the plain newest-first open list, not an empty or arbitrary one."""
    with TestClient(app) as client:
        carrier_token, _ = register_user(client, "carrier")
        matches_res = client.get(
            "/api/loads/matches", headers={"Authorization": f"Bearer {carrier_token}"}
        )
        open_res = client.get("/api/loads?status=open")

    assert matches_res.status_code == 200, matches_res.text
    assert [load["id"] for load in matches_res.json()] == [load["id"] for load in open_res.json()]


def test_matches_ranks_history_matches_above_unrelated_loads():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        carrier_token, _ = register_user(client, "carrier")

        # Build history: this carrier has run a Reefer load out of Dallas, TX
        # before (accepted + completed it).
        history_load = _post_load(client, shipper_token, title="History probe")
        accept_res = client.post(
            f"/api/loads/{history_load['id']}/accept",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )
        assert accept_res.status_code == 200, accept_res.text
        complete_res = client.post(
            f"/api/loads/{history_load['id']}/complete",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )
        assert complete_res.status_code == 200, complete_res.text

        # An open load matching that history on equipment type + both lane
        # states should outscore one that matches nothing.
        matching_load = _post_load(
            client, shipper_token, title="Should rank high", equipment_type="Reefer"
        )
        unrelated_load = _post_load(
            client,
            shipper_token,
            title="Should rank low",
            origin="Miami, FL",
            destination="Orlando, FL",
            equipment_type="Flatbed",
        )

        res = client.get("/api/loads/matches", headers={"Authorization": f"Bearer {carrier_token}"})

    assert res.status_code == 200, res.text
    ids = [load["id"] for load in res.json()]
    assert ids.index(matching_load["id"]) < ids.index(unrelated_load["id"])
