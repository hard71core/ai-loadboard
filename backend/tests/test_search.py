"""POST /api/search — the LLM call is mocked here (patched at the import
site inside app.api.routes.search, not in app.core.llm), so these run in CI
with no ANTHROPIC_API_KEY and no network call. What core/llm.py itself does
with a real key is not this file's concern; this file's concern is that the
route applies a SearchFilter correctly, and degrades correctly when there
isn't one — see core/llm.py's docstring for why "no filter" is the only
contract this route depends on.

Same DB requirement as test_health.py.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app import schemas
from app.main import app

from .conftest import register_user


def _post_load(client: TestClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Test load",
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


def test_search_falls_back_to_unfiltered_list_when_llm_unavailable():
    with patch("app.api.routes.search.parse_search_query", return_value=None):
        with TestClient(app) as client:
            token, _ = register_user(client, "shipper")
            _post_load(client, token, title="Fallback probe A")
            _post_load(client, token, title="Fallback probe B", equipment_type="Dry Van")

            search_res = client.post("/api/search", json={"query": "anything, doesn't matter"})
            list_res = client.get("/api/loads")

    assert search_res.status_code == 200, search_res.text
    # None filter -> zero filters applied -> identical to the plain list.
    assert [load["id"] for load in search_res.json()] == [load["id"] for load in list_res.json()]


def test_search_applies_llm_filter():
    reefer_filter = schemas.SearchFilter(equipment_type="Reefer")
    with patch("app.api.routes.search.parse_search_query", return_value=reefer_filter):
        with TestClient(app) as client:
            token, _ = register_user(client, "shipper")
            reefer = _post_load(client, token, title="Reefer probe", equipment_type="Reefer")
            dry_van = _post_load(client, token, title="Dry van probe", equipment_type="Dry Van")

            res = client.post("/api/search", json={"query": "reefer loads"})

    assert res.status_code == 200, res.text
    body = res.json()
    ids = {load["id"] for load in body}
    assert reefer["id"] in ids
    assert dry_van["id"] not in ids
    assert all(load["equipment_type"] == "Reefer" for load in body)


def test_search_rejects_empty_query():
    with TestClient(app) as client:
        res = client.post("/api/search", json={"query": ""})
    assert res.status_code == 422
