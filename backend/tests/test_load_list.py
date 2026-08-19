"""GET /api/loads — the plain load-list endpoint's pagination. No existing
file covered this route's list behavior at all before this (test_load_detail.py
only covers GET /{id}); see docs/technical-documentation.html section 8 for
why this is offset (`page`/`page_size`) pagination rather than the
cursor-based (`?cursor=`) pagination listed there as the Phase 2 target.

Same persistent-DB caveat as test_matching.py/test_health.py: this is a
real, shared local Postgres that already carries hundreds of loads from
other test runs and manual demo use, so these tests never assert on an
absolute total — only on before/after deltas this test itself creates, or
on the pagination math (`total_pages == ceil(total / page_size)`) computed
from whatever `total` the API reports at the time.
"""

import math

from fastapi.testclient import TestClient

from app.main import app

from .conftest import register_user

LOAD_PAYLOAD = {
    "title": "List page probe",
    "origin": "Dallas, TX",
    "destination": "Houston, TX",
    "equipment_type": "Reefer",
    "weight_lbs": 38000,
    "price_usd": 850,
}


def _post_load(client: TestClient, token: str, **overrides) -> dict:
    payload = {**LOAD_PAYLOAD, **overrides}
    res = client.post("/api/loads", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    return res.json()


def _total(client: TestClient, **params) -> int:
    res = client.get("/api/loads", params=params)
    assert res.status_code == 200, res.text
    return res.json()["total"]


def test_default_page_and_page_size():
    with TestClient(app) as client:
        res = client.get("/api/loads")

    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body.keys()) == {"items", "total", "page", "page_size", "total_pages"}
    assert body["page"] == 1
    assert body["page_size"] == 20
    assert len(body["items"]) <= 20
    assert body["total"] >= len(body["items"])
    assert body["total_pages"] == max(1, math.ceil(body["total"] / body["page_size"]))


def test_items_are_newest_first():
    with TestClient(app) as client:
        token, _ = register_user(client, "shipper")
        first = _post_load(client, token, title="Newest-first probe A")
        second = _post_load(client, token, title="Newest-first probe B")

        res = client.get("/api/loads", params={"page_size": 100})

    assert res.status_code == 200, res.text
    ids = [load["id"] for load in res.json()["items"]]
    # Both freshly-created loads are newer than everything else in the
    # table, so they must appear before it — and second (posted later)
    # before first.
    assert ids.index(second["id"]) < ids.index(first["id"])


def test_explicit_page_and_page_size_paginate_without_overlap():
    with TestClient(app) as client:
        token, _ = register_user(client, "shipper")
        for i in range(3):
            _post_load(client, token, title=f"Pagination probe {i}")

        page1 = client.get("/api/loads", params={"page": 1, "page_size": 2})
        page2 = client.get("/api/loads", params={"page": 2, "page_size": 2})

    assert page1.status_code == 200, page1.text
    assert page2.status_code == 200, page2.text
    page1_body, page2_body = page1.json(), page2.json()
    assert page1_body["page"] == 1
    assert page2_body["page"] == 2
    assert len(page1_body["items"]) == 2
    assert len(page2_body["items"]) == 2
    ids1 = {load["id"] for load in page1_body["items"]}
    ids2 = {load["id"] for load in page2_body["items"]}
    assert ids1.isdisjoint(ids2)
    # total/total_pages must agree across pages of the same query.
    assert page1_body["total"] == page2_body["total"]
    assert page1_body["total_pages"] == page2_body["total_pages"]


def test_page_and_page_size_combine_with_status_filter():
    with TestClient(app) as client:
        shipper_token, _ = register_user(client, "shipper")
        carrier_token, _ = register_user(client, "carrier")

        open_before = _total(client, status="open")
        accepted_before = _total(client, status="accepted")

        load = _post_load(client, shipper_token, title="Status filter probe")
        accept_res = client.post(
            f"/api/loads/{load['id']}/accept",
            headers={"Authorization": f"Bearer {carrier_token}"},
        )
        assert accept_res.status_code == 200, accept_res.text

        open_after = _total(client, status="open")
        accepted_after = _total(client, status="accepted")

        res = client.get("/api/loads", params={"status": "accepted", "page": 1, "page_size": 5})

    assert res.status_code == 200, res.text
    body = res.json()
    assert all(load["status"] == "accepted" for load in body["items"])
    # The load moved from open to accepted, not just got added to both.
    assert open_after == open_before
    assert accepted_after == accepted_before + 1


def test_page_beyond_the_last_returns_empty_items_not_404():
    with TestClient(app) as client:
        baseline = client.get("/api/loads", params={"page_size": 100})
        assert baseline.status_code == 200, baseline.text
        total_pages = baseline.json()["total_pages"]

        res = client.get("/api/loads", params={"page": total_pages + 1000, "page_size": 100})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["items"] == []
    assert body["page"] == total_pages + 1000
    assert body["total_pages"] == total_pages


def test_total_pages_matches_ceil_of_total_over_page_size():
    with TestClient(app) as client:
        token, _ = register_user(client, "shipper")
        for i in range(3):
            _post_load(client, token, title=f"Total pages probe {i}", equipment_type="Flatbed")

        res = client.get("/api/loads", params={"page_size": 7})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_pages"] == math.ceil(body["total"] / 7)


def test_page_size_zero_is_rejected():
    with TestClient(app) as client:
        res = client.get("/api/loads", params={"page_size": 0})
    assert res.status_code == 422, res.text


def test_page_size_over_the_cap_is_rejected():
    with TestClient(app) as client:
        res = client.get("/api/loads", params={"page_size": 101})
    assert res.status_code == 422, res.text


def test_page_below_one_is_rejected():
    with TestClient(app) as client:
        res = client.get("/api/loads", params={"page": 0})
    assert res.status_code == 422, res.text
