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

Right now there are five test files: `backend/tests/test_health.py` (a
smoke test), `backend/tests/test_load_ownership.py` (auth/role/ownership
on the three mutating load endpoints), `backend/tests/test_search.py`
(NL search route — LLM filter application, keyword fallback when the LLM
path is unavailable, empty-query rejection), `backend/tests/test_llm.py`
(the `NL_SEARCH_ENABLED` gate itself — asserts the Anthropic client never
gets constructed when the flag is off or the key is missing, no DB needed),
and `backend/tests/test_matching.py` (smart matching — role gating,
cold-start carriers get the plain open list, a carrier with history ranks
a matching load above an unrelated one) — still nowhere near coverage,
just the slices that existed reasons to test first. `backend/tests/conftest.py`
holds the shared
`register_user(client, role)` helper (extracted out of
`test_load_ownership.py` once `test_search.py` needed the same setup) — use
it instead of writing a new inline registration helper. When you add backend
behavior, add a test for it in `backend/tests/` following their pattern
(`fastapi.testclient.TestClient`, hit the route, assert on the response;
use `uuid.uuid4()` in emails/company names if a test registers users, so
repeat runs against a persistent local DB don't collide). `test_search.py`
also shows the pattern for mocking the Anthropic call: `unittest.mock.patch`
the import site (`app.api.routes.search.parse_search_query`), not the
definition site (`app.core.llm.parse_search_query`) — patching the
definition doesn't affect the name already imported into `search.py`. This
keeps tests deterministic and runnable in CI with no `ANTHROPIC_API_KEY` and
no network access. Planned test scope beyond that is listed in
`docs/technical-documentation.html` section 15 — endpoint authorization, NL
search, and matching are now covered; the next gap is the load status
transition itself (`open→accepted→completed`, e.g. completing a load that
was never accepted).

## Frontend

**No test runner is configured yet** (no Vitest, no Testing Library) —
`npm run build` (`tsc` type-check + `vite build`) is the only frontend check
CI runs today. If you're asked to add frontend tests, that's new tooling to
set up, not something already wired in.
