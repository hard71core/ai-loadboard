# Security

No `paths` frontmatter on this file on purpose — it applies everywhere,
loaded at launch same as `.claude/CLAUDE.md`, not just when touching backend
code.

## Standing rules

- Secrets live only in `.env` (gitignored). Never commit one, never hardcode
  a real secret as a fallback in code — the one exception is the existing
  `"dev-secret-change-me"` placeholder default in `backend/app/core/security.py`,
  which only exists so the demo boots without setup; don't add others like it.
- `ANTHROPIC_API_KEY` (`.env`) is a billed third-party credential, not just
  another config value — same "never commit, never log it" rule as
  `JWT_SECRET`. `core/llm.py` treats it as optional at runtime (unset or
  the `.env.example` placeholder both fall through to `None`, and
  `api/routes/search.py` degrades to a plain keyword match in that case),
  so a missing key is never a reason to hardcode a real one anywhere as a
  fallback. On top of that, `NL_SEARCH_ENABLED` (`.env`, default `false`)
  gates the Anthropic call entirely — `core/llm.py` checks it before even
  looking at the key, so `POST /api/search` spends zero credits unless
  someone deliberately opts in.
- Every mutating endpoint must check authentication **and** ownership before
  this project can be considered production-safe (see "Known gaps" below —
  this isn't true yet for three endpoints).
- CORS stays an explicit allowlist via the `CORS_ORIGINS` env var
  (`backend/app/core/config.py`), never `allow_origins=["*"]`.
- Queries stay parameterized through the SQLAlchemy ORM — never hand-build
  SQL strings, even for internal/admin tooling.
- Dependency versions stay within the bounds pinned in
  `backend/requirements.txt` / `frontend/package.json`; don't loosen a bound
  to make a version conflict go away without checking why it conflicted.
- If you spot a new gap like the ones below while working on something else,
  say so explicitly and add it to the tech-debt table in
  `docs/technical-documentation.html` section 17 — don't quietly leave it
  unnoted, and don't quietly fix it either without flagging that you did.

## Resolved

- ~~`POST /api/loads`, `/api/loads/{id}/accept`, `/api/loads/{id}/complete`
  don't check authentication or role~~ — **fixed.** All three now require a
  Bearer token, check the caller's role (`shipper`/`carrier`), and
  `complete` additionally checks the caller is the load's shipper or the
  accepting carrier. See `backend/app/api/routes/loads.py`.
- ~~`loads.shipper_name` / `carrier_name` are free-text columns, not foreign
  keys into `users`~~ — **fixed.** `Load` now has `shipper_id`/`carrier_id`
  FKs (`backend/app/models.py`), set server-side from the authenticated
  user, never from the request body. `*_name` stays as a display cache,
  also server-derived now.
- ~~Auth is JWT with no refresh token and no revocation — a stolen token is
  valid for the full `JWT_EXPIRE_MINUTES` window (7 days by default)~~ —
  **fixed.** `JWT_EXPIRE_MINUTES` now defaults to 15 (minutes, not days);
  session longevity comes from a separate, revocable refresh token instead
  (`refresh_tokens` table, `backend/app/core/security.py`) — hashed at
  rest, rotated on every use (`POST /api/auth/refresh`), and a stolen
  refresh token that gets replayed after the legitimate client already
  rotated it is a rejected reuse, not a silent second session. `POST
  /api/auth/logout` revokes it outright. The access JWT itself is still
  unrevocable (it's stateless by design), but 15 minutes bounds the blast
  radius instead of 7 days. See `backend/tests/test_auth_refresh.py`.
- ~~Backend test coverage is thin~~ — **fixed for the backend.** Every
  `api/routes/*` module plus `core/eta.py` is at 100% line coverage,
  `core/llm.py` and `core/security.py` are at ~98% (see
  `.claude/rules/testing.md` for what's still deliberately uncovered and
  why), 60 tests total. This included finding and fixing a real bug, not
  just adding tests around existing behavior: `complete_load`
  (`api/routes/loads.py`) checked ownership but not status, so a shipper
  could mark their own still-`open` load `completed` directly, skipping
  `accepted` entirely — closed by adding the missing status check;
  `test_complete_rejects_a_load_that_was_never_accepted`
  (`backend/tests/test_load_ownership.py`) is the regression test.
- ~~No frontend test runner existed at all~~ — **fixed the infrastructure,
  not the coverage.** Vitest + Testing Library now exist
  (`frontend/vitest.config.ts`), wired into CI as its own step, and 11
  files/86 tests cover the highest-logic pieces first:
  `AuthContext.tsx`'s bootstrap-via-refresh and `logout()` (the module this
  gap most directly motivated — see the trade-off callout below, this is
  exactly the code with a real security property to protect), `EtaWindow.tsx`'s
  fail-closed rendering, `AuthPanel.tsx`'s login/register form flow,
  `geocode.ts`'s `haversineMiles`, `Combobox.tsx`, `LoadsPage.tsx`'s
  post-a-load location fields, `api.ts` (every backend call), `App.tsx`'s
  shell/nav/auth modal, `HomePage.tsx`'s stats and CTAs,
  `LoadDetailPage.tsx`'s detail fields and accept flow, and
  `DocsPage.tsx`'s doc cards and their `target="_blank"`/
  `rel="noopener noreferrer"` links. See `.claude/rules/testing.md`. This
  is explicitly a first slice — `RouteMap.tsx` still has zero tests,
  tracked below, not closed.
- ~~`frontend/`'s `vite@^5.4.0` transitively pulled a vulnerable `esbuild`
  (GHSA-67mh-4wv8-2f99)~~ — **fixed.** `vite` bumped `^5.4.0` → `^8.2.1`
  (with `@vitejs/plugin-react` → `^6.0.5` and `vitest`/`@vitest/coverage-v8`
  → `^4.1.10` to match, all four had to move together — see
  `.claude/rules/testing.md`). `npm audit` now reports 0 vulnerabilities;
  Vite 8 doesn't depend on `esbuild` at all anymore (nothing under that
  name in `node_modules`), not just a patched version of it. Verified the
  upgrade didn't break anything beyond the version bump itself: full test
  suite, lint, and build all still pass, and the Docker image (`node:20-
  alpine`, resolves to Node 20.20.2, above Vite 8's `^20.19.0` floor)
  builds and serves the app correctly.

Both P0s, the JWT gap, the backend half of the test-coverage gap, and the
`esbuild` finding were tracked in `docs/technical-documentation.html`
section 17, now marked closed there.

**New trade-off this introduced, tracked as P2 (see below):** the refresh
token is a plain string in `localStorage`, same as the access token before
it — an XSS on this origin can steal it. The tech doc's target design
(section 9) calls for an httpOnly cookie instead, which JS on the page
can't read at all; that's real future work, not done here. Rotation limits
how *long* a stolen refresh token stays useful (one use, then it's dead),
but doesn't stop the theft itself the way an httpOnly cookie would.

## Known gaps (still open — don't silently "fix" without flagging)

- The refresh token introduced above lives in `localStorage`
  (`frontend/src/AuthContext.tsx`), readable by any JS running on the page
  — an XSS vulnerability anywhere on the site can exfiltrate it, same
  exposure the access token already had. Rotation (see "Resolved" above)
  limits a stolen token to one use before it's rejected, but doesn't
  prevent the theft. The tech doc's target (section 9) is an httpOnly
  cookie, which client-side JS can't read regardless — not implemented,
  would need CSRF protection to go with it. Tracked as P2: real exposure
  needs an actual XSS elsewhere first, and there's no known one, but this
  is the kind of gap that's cheap to close later and expensive to discover
  in an incident.
- Frontend test coverage is still a first slice — 11 files/86 tests (see
  "Resolved" above and `.claude/rules/testing.md`), but `RouteMap.tsx` has
  none. Tracked as P1, downgraded in urgency from "the runner doesn't even
  exist" and now from "most pages have none" — but not closed,
  `RouteMap.tsx` in particular carries real geocoding/routing fallback
  logic with no regression safety net yet.
- `POST /api/search` (`core/llm.py`) has no rate limiting, no per-request
  or per-period cost cap, and no auth requirement — once `NL_SEARCH_ENABLED`
  is turned on, anyone can trigger billed Anthropic API calls at will (the
  flag being off by default only prevents *accidental* spend, it's not a
  real cost control). The "cost budget and circuit breaker" pattern
  described in `docs/technical-documentation.html` section 7.8 is
  aspirational, not implemented. Tracked as P2 — real exposure is small
  while the account has no meaningful traffic, but this needs a fix before
  any public/high-traffic deploy.
- `frontend/src/geocode.ts` calls OpenStreetMap's Nominatim directly from
  the browser, no key, no backend proxy, no rate limiting beyond an
  in-memory per-session cache. Nominatim's usage policy caps free use at
  roughly 1 request/second and expects identifiable traffic; fine at demo
  scale, but real production traffic needs either a backend proxy with
  proper caching/throttling or a paid geocoder — Nominatim's operators can
  and do block abusive IPs. Tracked as P2, same reasoning as the search
  cost-cap item above.
- `frontend/src/routing.ts` calls OSRM's public demo server
  (`router.project-osrm.org`) directly from the browser for driving
  directions — same shape of gap as `geocode.ts` above: no key, no
  backend proxy, no rate limiting beyond the same in-memory per-session
  cache pattern. That server is explicitly a demo/showcase for the OSRM
  project, not a production dependency — no uptime or rate guarantee.
  Tracked as P2, same reasoning as the Nominatim item above.
- `backend/app/core/eta.py` (the ETA MVP, `GET /api/loads/{id}/eta`) also
  calls Nominatim and OSRM's public demo server — same shape of gap as the
  two items above, but now server-side traffic too, not just from the
  browser. It does set a descriptive `User-Agent` on the Nominatim call
  (server-side requests send no `Referer`, unlike a browser tab) and caches
  in an in-memory dict for the process's lifetime — a longer-lived, shared
  cache than the frontend's per-session one, which somewhat reduces request
  volume, but is still no substitute for real rate limiting or a paid
  provider before production traffic. Tracked as P2, same reasoning as the
  two items above.
- `frontend/src/placeSearch.ts` calls Photon (`photon.komoot.io`, Komoot's
  keyless public geocoder) directly from the browser — live, debounced
  city/town/village search for the post-a-load form's city picker. Same
  shape of gap as the three items above: no key, no backend proxy, no rate
  limiting beyond an in-memory per-session cache, and it's explicitly a
  public demo instance with no uptime or rate guarantee — same reasoning
  as `geocode.ts`/`routing.ts`. Deliberately a *different* provider than
  those two (Nominatim, used elsewhere): Nominatim doesn't do true prefix/
  typeahead matching (tried it first — querying "Chicag" while still
  typing "Chicago" returns nothing), Photon is built for exactly that
  autocomplete use case. Tracked as P2, same reasoning as the geocode.ts/
  routing.ts items above — this is now the fourth third-party mapping
  service this app depends on with no production-grade guarantee behind
  any of them (Nominatim ×2 call sites, OSRM ×2, now Photon).
