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
startup, so `TestClient` won't work against a mock. A session-scoped
autouse fixture in `conftest.py` runs `alembic upgrade head` before
anything else, so a bare `docker compose up -d db` (empty DB, no tables
yet) is enough — no separate manual migration step:

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

**Coverage is 99% line coverage across `app/`, 60 tests, as of the test-coverage
pass that closed this out** (`pytest --cov=app --cov-report=term-missing`
reports it per-module) — every `api/routes/*` module and `core/eta.py` at
100%, `core/llm.py` and `core/security.py` at ~98%. The two remaining gaps
are deliberate, not oversights: `core/security.py`'s `rotate_refresh_token`
has an `if not user: return None` guard for a `refresh_tokens` row whose
`user_id` points nowhere — unreachable in practice because
`refresh_tokens.user_id` is a foreign key into `users.id`, so referential
integrity already guarantees the row exists; forcing that branch would mean
bypassing the FK constraint just to hit one defensive line, not a
meaningful test. `main.py`'s demo-seed-data branch
(`if db.query(models.Load).count() == 0: ...`) only runs against a genuinely
empty `loads` table, which no test in a shared/persistent local Postgres
can reliably arrange without clearing state other tests depend on; CI's
fresh DB does exercise it, just not as a targeted unit test.

There are eleven test files: `backend/tests/test_health.py` (a smoke test),
`backend/tests/test_load_ownership.py` (auth/role/ownership on the three
mutating load endpoints, plus the full status-transition state machine —
404s on accept/complete for an unknown load, accepting an already-taken
load, completing a load that was never accepted, completing an
already-completed load), `backend/tests/test_search.py` (NL search route —
LLM filter application across every `SearchFilter` field, not just
`equipment_type`, keyword fallback when the LLM path is unavailable,
empty-query rejection), `backend/tests/test_llm.py` (the
`NL_SEARCH_ENABLED` gate itself, plus the Anthropic call's own fail-closed
branch when it raises — no DB needed),
`backend/tests/test_matching.py` (smart matching — role gating, cold-start
carriers get the plain open list, a carrier with history ranks a matching
load above an unrelated one), `backend/tests/test_load_detail.py`
(`GET /api/loads/{id}` — full detail, 404 for an unknown id, and a
regression test that it doesn't shadow `GET /api/loads/matches`; that last
one caught a real bug during development — a bare `{load_id}` path matches
*any* string at Starlette's routing layer, including "matches", and 422s
instead of falling through to matching.py's route),
`backend/tests/test_eta.py` (arrival estimate route — 404 for an unknown
load, graceful degradation when the mocked routing call returns `None`,
transit estimate without an arrival window for an open load, and the
arrival window's math once a load is accepted), `backend/tests/test_eta_core.py`
(one layer lower than test_eta.py — mocks `httpx.get` instead of
`estimate_transit` wholesale, so `core/eta.py`'s actual geocoding/routing/
caching/fail-closed logic runs for real: Nominatim/OSRM success, empty
results, network errors, HTTP error status, and the in-memory cache
actually short-circuiting a second call), `backend/tests/test_auth.py`
(register/login/me and their failure branches — duplicate email, wrong
password, no token, a malformed token, a validly-signed token for a
nonexistent user, a validly-signed token with no `sub` claim at all),
`backend/tests/test_auth_refresh.py` (refresh-token rotation and
revocation — register issues both an access and a refresh token, a used
refresh token is rejected on replay, an expired one is rejected too —
backdated directly via `SessionLocal` rather than waiting out
`REFRESH_TOKEN_EXPIRE_DAYS`, and logout revokes a token so a later refresh
with it 401s).

`backend/tests/conftest.py` holds the migration fixture above plus the
shared `register_user(client, role)` helper (extracted out of
`test_load_ownership.py` once `test_search.py` needed the same setup) — use
it instead of writing a new inline registration helper. When you add backend
behavior, add a test for it in `backend/tests/` following their pattern
(`fastapi.testclient.TestClient`, hit the route, assert on the response;
use `uuid.uuid4()` in emails/company names if a test registers users, so
repeat runs against a persistent local DB don't collide). `test_search.py`
also shows the pattern for mocking the Anthropic call: `unittest.mock.patch`
the import site (`app.api.routes.search.parse_search_query`), not the
definition site (`app.core.llm.parse_search_query`) — patching the
definition doesn't affect the name already imported into `search.py`.
`test_eta.py` mocks `app.api.routes.eta.estimate_transit` the same way, for
the same reason; `test_eta_core.py` instead mocks `app.core.eta.httpx.get`
directly (see its module docstring for why both layers earn their keep —
one tests the route's response shape, the other tests the actual
provider-facing logic). This keeps tests deterministic and runnable in CI
with no `ANTHROPIC_API_KEY` and no network access. Planned test scope
beyond this is listed in `docs/technical-documentation.html` section 15.

## Frontend

Vitest + Testing Library (`frontend/vitest.config.ts`, jsdom environment).
Deliberately a config file separate from `vite.config.ts` — the app's dev/
build config never has to know about test-only concerns (jsdom, the setup
file), and vice versa. `vitest@4.x` and `vite@8.x` are pinned as a pair —
`vitest@4.x`'s own `dependencies.vite` range is `^6.0.0 || ^7.0.0 ||
^8.0.0`, so it only dedupes onto the app's own `vite` install
(`npm ls vitest vite` should show one `vite` version, not two) when
they're both on a major within that range; the app was briefly held on
`vitest@3.x` for exactly this reason while it was still on `vite@^5.4.0`
(see the `esbuild`/`vite@8` upgrade in tech-debt item 14,
`docs/technical-documentation.html` section 17 — now closed). Bump these
two together going forward, not independently, or the duplicate-install
problem comes back.

```bash
cd frontend
npm test                # watch mode
npm run test:run        # single run, as CI does
npm run test:coverage   # single run + a v8 coverage report
```

`src/test/setup.ts` registers `@testing-library/jest-dom`'s matchers and
an explicit `afterEach(cleanup)` — `test.globals` is off (this project
imports `describe`/`it`/`expect`/`vi` explicitly everywhere, same as
everything else here), so Testing Library's own auto-cleanup (which only
self-registers when it detects a global `afterEach`) wouldn't otherwise
run, and unmounted-but-not-cleaned-up components would leak between tests
— for `AuthContext.tsx` specifically, that would mean a leaked pending
`setTimeout` from its refresh-scheduling logic.

**This is a first slice, the same philosophy as the backend's early test
files** — not full coverage, the pieces that had the clearest reason to
be tested first: 11 files, 86 tests today.
`frontend/src/AuthContext.test.tsx` is the biggest one — the
bootstrap-via-refresh-token flow (success, failure, and the no-stored-
token case), and `logout()` revoking server-side and clearing local state
even when that server call fails — `../api` is mocked at the module level
(`vi.mock("./api", ...)`) so no network/backend is involved.
`frontend/src/components/EtaWindow.test.tsx` covers its full state
machine: nothing rendered for an open load (and the API is never even
called), the formatted arrival window, the "unavailable" fallback both
when the API returns no window and when the call rejects outright.
`frontend/src/components/AuthPanel.test.tsx` drives the actual form via
`@testing-library/user-event` — login, a failed login's error message,
switching to the register tab and submitting company name + role. (Its
submit button's accessible name duplicates a tab's name once that tab is
active — "Log in" while on the login tab, "Sign up" once switched to
register — so tests query `button[type="submit"]` directly rather than by
role name, see the file's comment.) `frontend/src/geocode.test.ts` is the
odd one out — a pure-function test for `haversineMiles`, no
mocking/rendering needed at all. `frontend/src/components/Combobox.test.tsx`
covers the generic searchable-dropdown component itself: shows every
option on focus with `minChars=0` (the default), filters as you type and
calls `onSelect` with the clicked option, respects `minChars` (no search
below the threshold), debounces an async source so a burst of keystrokes
only fires one request — for the last value, not once per character —
stays inert while `disabled`, and arrow-key navigation + Enter commits the
highlighted option. `frontend/src/pages/LoadsPage.test.tsx` covers the
post-a-load form's state → city pair built on top of `Combobox`
(`../placeSearch` mocked at the module level) — the city combobox stays
disabled with nothing but a placeholder until a state is picked, picking a
state resets any previously-chosen city (a Dallas left over from Texas
would be wrong once the state's Florida), typed-but-never-selected text is
rejected at submit rather than silently posted as-is, a full submit posts
the combined `"City, ST"` strings to `createLoad`, and the form/button
don't render at all for a non-shipper. `frontend/src/api.test.ts` covers
every exported call in `api.ts` — the shared `handle()` error path (a
success response's JSON passed through as-is, a non-OK response's server
`detail` message surfaced, and the two fallback-to-generic-message cases:
no JSON body at all, and a JSON body with no `detail` field), the exact
URL/method/headers/body each function sends (including which calls carry
a `Bearer` token and which don't), and `logoutUser`'s deliberately
different contract — it swallows a non-OK HTTP status (best-effort
revocation, see its docstring) but still rejects on an actual network
failure. `global.fetch` is stubbed with `vi.stubGlobal` per test, no
`AuthContext`/component involved — this is the one file in the frontend
suite testing a plain module with no React in the loop besides
`geocode.test.ts`. `frontend/src/App.test.tsx` covers the shell: routing
(all four paths render their page), the brand link and nav active-state,
the auth-status area's three states (loading → neither button nor badge,
logged out → Log in/Sign up, logged in → company/role badge + Log out
wired to `logout()`), and the auth modal — opens in the right mode from
either header button or a routed page's own `openAuth` prop, closes via
the panel's `onClose` or an overlay click, and a click inside the panel
itself doesn't close it (the overlay's `onClick` vs. the inner div's
`stopPropagation()`). `./AuthContext` is mocked at the module level (a
plain `useAuth()` stub, not a real `AuthProvider`) and so are the four
routed page components plus `AuthPanel` — each already has its own tests
(or, for the pages, is still an open gap below) and pulls in `api.ts`
dependencies this file has no reason to also exercise; `HomePage`'s mock
exposes its `openAuth` prop via a button so the "a page opens the modal
itself" path is covered too, not just the header's own buttons.

`frontend/src/pages/HomePage.test.tsx` covers the page's own logic: it
fetches loads on mount and derives its two hero stats from the result —
total load count and, separately, only loads with `status === "open"` —
falling back to zero on either stat (not a crash) when the fetch rejects;
both "Sign up free" CTAs (hero and the bottom CTA band) call `openAuth`
`("register")` and disappear once a user is logged in; both "Browse
loads" links point to `/loads` regardless of auth state. `../api` is
mocked at the module level for `fetchLoads`, `../AuthContext` for
`useAuth`, and `../hooks/useCountUp` is mocked to the identity function —
it's a purely cosmetic `requestAnimationFrame`-driven animation (see its
own docstring) with no dependents besides this page, so a test asserting
on real target numbers is more useful than one that drives animation
frames.

`frontend/src/pages/LoadDetailPage.test.tsx` covers the detail page's own
logic: the loading skeleton while `fetchLoad` is in flight, the error
state (fetch rejection surfaced as the alert message, back link to `/`),
fetching the `:id` from the route, the rendered detail fields (title,
origin/destination header, status badge, equipment, formatted weight/
price, shipper name, and the carrier row only once one exists), and the
accept flow's every branch — a logged-in carrier's "Accept load" button
calling `acceptLoad` and refetching, an accept failure surfacing
`actionError` without refetching, a logged-out visitor's "Log in to
accept" button calling `openAuth("register")` without ever calling
`acceptLoad`, no button at all for a shipper viewing an open load, and
the "← Back to loads" `<button>` (not the top `<Link>`, see the file's
comment on why the test disambiguates the two) that appears once a load
is no longer open, navigating to `/`. `../components/RouteMap` (Leaflet)
and `../components/EtaWindow` are mocked out at the module level — each
either already has its own tests or, for `RouteMap`, is a documented gap
below — and `../api` is mocked the same way as `LoadsPage.test.tsx`.

`frontend/src/pages/DocsPage.test.tsx` covers the docs page — it's a
static component with no hooks, no API calls, and no auth, rendered from
a fixed `DOCS` array, so the tests assert on that array's shape rather
than any behavior: both cards render their title, audience label, and
body text (Project Overview/investor-facing, Technical Documentation/
engineering spec), the heading and intro copy render, each card's
"Open (UA/EN)" and "Download PDF" links point at that card's own
`/docs/*.html`/`/docs/*.pdf` href (not the other card's), and — the one
real security property here — every link carries `target="_blank"` paired
with `rel="noopener noreferrer"`, not just `target="_blank"` alone.
`DocsPage.tsx` now at 100% line/branch/function coverage (was untested).

Everything else — `RouteMap.tsx` itself (Leaflet — would need jsdom
canvas/geometry shims) — has no tests yet. That's the next gap, not a
secret one.

CI (`.github/workflows/ci.yml`) runs `npm run test:coverage` as its own
step, between lint and the type-check/build step — a test failure fails
the job before the (slower) build even starts.
