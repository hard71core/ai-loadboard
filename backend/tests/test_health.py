"""Smoke test for the API.

Needs a reachable Postgres — the app's startup hook connects to DATABASE_URL
before serving any request. Locally: `docker compose up -d db`. In CI: the
`postgres` service container defined in .github/workflows/ci.yml.

This is deliberately the only test in the repo right now — it exists so the
CI pipeline has something real to run, not as a claim of coverage. See the
technical documentation (docs/technical-documentation.html, section 15) for
what's actually planned here.
"""

from fastapi.testclient import TestClient

from app.main import app


def test_health_check_returns_ok():
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
