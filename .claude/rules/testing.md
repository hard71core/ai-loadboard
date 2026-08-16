---
paths:
  - "backend/tests/**/*.py"
  - "backend/app/**/*.py"
  - "frontend/src/**/*.test.{ts,tsx}"
---

# Testing

## Backend

`pytest` is configured via `backend/pyproject.toml`
(`testpaths = ["tests"]`). Tests need a **real** Postgres reachable at the
`DATABASE_URL` from `.env` — the app's `lifespan` handler connects to it on
startup, so `TestClient` won't work against a mock:

```bash
docker compose up -d db     # or: full docker compose up, either works
cd backend
pytest                                                      # all tests
pytest tests/test_health.py::test_health_check_returns_ok   # single test
pytest --cov=app --cov-report=term-missing                  # with coverage, as CI does
```

CI (`.github/workflows/ci.yml`) runs the exact same way, against a
`postgres:16-alpine` service container — if a test passes locally against a
real DB, it'll pass in CI too, and vice versa.

Right now there is exactly one test, `backend/tests/test_health.py` — a
smoke test that exists so CI has something real to run, not a coverage
claim. When you add backend behavior, add a test for it in `backend/tests/`
following that file's pattern (`fastapi.testclient.TestClient`, hit the
route, assert on the response). Planned test scope beyond that is listed in
`docs/technical-documentation.html` section 15 — the top priority there is
covering the load status transition (`open→accepted→completed`) and endpoint
authorization once that's implemented.

## Frontend

**No test runner is configured yet** (no Vitest, no Testing Library) —
`npm run build` (`tsc` type-check + `vite build`) is the only frontend check
CI runs today. If you're asked to add frontend tests, that's new tooling to
set up, not something already wired in.
