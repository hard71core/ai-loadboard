# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A demo-stage, two-sided freight marketplace: a shipper posts a load, a carrier
takes it directly — no broker. The backend is a plain FastAPI CRUD service
(`backend/app/`) over two tables, the frontend is a React SPA (`frontend/`)
with client-side routing (`react-router-dom`) — a marketing landing page at
`/`, the load list at `/loads`, a load detail page at `/loads/:id`, a
personal-cabinet page at `/profile`, and an in-app docs page at `/docs`,
not a single screen anymore.
**Three of the 7 planned AI features have a working MVP**:
natural-language load search (`POST /api/search`, `core/llm.py`, Claude
Haiku 4.5, structured outputs, gated off by default behind
`NL_SEARCH_ENABLED` — see `.claude/rules/security.md`), smart load
matching (`GET /api/loads/matches`, `api/routes/matching.py`), and an
arrival-time estimate (`GET /api/loads/{id}/eta`, `core/eta.py`) — but
matching's and ETA's MVPs are both **deterministic heuristics**, not the
embeddings + gradient-boosting model (matching, section 7.3) or the
telematics/traffic/weather regression (ETA, section 7.7) the tech doc
describes as the target; there's no real carrier behavior data or
telematics feed yet to build either on. ETA's heuristic geocodes via
Nominatim and fetches the real driving distance/duration via OSRM
server-side, then widens it into a band; see `core/eta.py`'s docstring.
The other 4 (pricing, the negotiation agent, trust scoring, document
intelligence) plus the full event-driven architecture (a separate
service per feature, an event bus) are still a *target design*, documented
but not built — see "Docs" below before assuming more AI-related code
exists than these three features, and don't assume "AI feature" implies an
LLM/ML call is actually happening — check the route.

Detailed conventions live in `.claude/rules/`: `code-style.md`, `testing.md`,
`security.md`. This file has the project shape, commands, and the rules that
apply everywhere no matter what file you're touching.

## Ground rules

- **Never install anything globally on the host.** No `pip install` outside
  `.venv`, no `npm install -g`, no `brew install` for anything this project
  depends on. Python deps go in `.venv/`, JS deps in `frontend/node_modules/`.
  If a genuinely system-level tool is missing (Docker, a language runtime
  itself), ask before installing it rather than reaching for a global install.
- **Docs move with the code, in the same change.** Any change to
  architecture, the data model, endpoints, config/env vars, or tooling gets
  reflected in `docs/technical-documentation.html` as part of that change —
  not as a separate follow-up. Update the maturity pill (MVP → Phase 2 →
  Phase 3 → R&D) when something ships, and regenerate
  `docs/technical-documentation.pdf` to match (Chrome headless
  `--print-to-pdf`, as used to produce the current one). If you close an item
  in the section 17 tech-debt table, mark it resolved there instead of
  leaving it stale. **Then copy both `docs/*.html` and both `docs/*.pdf`
  into `frontend/public/docs/`, overwriting what's there** — the in-app
  `/docs` page (`pages/DocsPage.tsx`) links to those copies, not the
  originals, so skipping this step leaves the live site showing stale docs
  even though the source of truth is current.
- **Build it like a senior team would, not like a demo.** The bar is "would
  this pass review from a senior engineer," not "does it run once" — see
  `.claude/rules/code-style.md` and `.claude/rules/testing.md` for what that
  means concretely here.
- **Keep `.claude/PROGRESS.local.md` in sync with every change.** It's a
  local, gitignored done/to-do summary (source of truth is still
  `docs/technical-documentation.html` §17 and `security.md`'s
  Resolved/Known-gaps sections — this file just collects that state for
  quick reference). Whenever something gets built, fixed, or closed: either
  mark the matching entry done there, or, if it isn't listed yet, add it.
  Whenever a new gap gets spotted (on top of flagging it per
  `security.md`'s "say so explicitly" rule): add it under Open if it isn't
  there already. If the file doesn't exist yet, create it rather than
  skipping this step.

## Git workflow

Remote `origin` is https://github.com/hard71core/loadboardgram (public).
`main` is the default branch.

- **Never commit straight to `main`.** For any change, branch off first:
  `git checkout -b <type>/<short-description>` (e.g. `feat/nl-search`,
  `fix/load-ownership`, `chore/bump-deps`), commit there.
- **Push the branch, then stop and ask.** `git push -u origin <branch>`,
  summarize what changed and confirm CI passed, then ask the user for
  explicit go-ahead before merging into `main`. Don't merge, fast-forward,
  or merge your own PR without that confirmation — the branch existing on
  GitHub is not itself permission to merge it.
- Only after the user says yes: merge into `main` and push.

## Commands

### Full stack (Docker)

```bash
cp .env.example .env        # first time only
docker compose up --build   # frontend :5173, API :8001, Swagger :8001/docs
docker compose down         # add -v to also drop the DB volume
```

**After adding/removing a frontend dependency**, plain `--build` isn't
enough: `frontend`'s `node_modules` is an anonymous volume
(`docker-compose.yml`'s `- /app/node_modules`, there so the `./frontend:/app`
bind mount doesn't shadow it with the host's — usually missing —
`node_modules`), and Compose reuses that volume's existing content across
recreates even when the image was rebuilt. Symptom: Vite's
`Failed to resolve import "<package>"` even right after `--build`. Fix:
`docker compose up -d --build --force-recreate -V frontend` — `-V`
(`--renew-anon-volumes`) is what actually forces the volume to repopulate
from the freshly built image.

### Backend, outside Docker

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements-dev.txt
docker compose up -d db                              # only the DB
cd backend && alembic upgrade head                    # apply migrations
uvicorn app.main:app --reload --port 8000
```

The PyCharm interpreter for this project is `.venv/bin/python` at the repo root.

### Migrations

```bash
cd backend
alembic upgrade head                                        # apply pending migrations
alembic revision --autogenerate -m "add whatever column"     # after changing models.py
alembic downgrade -1                                          # roll back one
```

Docker/CI/pytest all apply migrations for you (see "Data model" below) —
this section is for writing a new one after changing `models.py`. Always
review the autogenerated file, don't just trust it — see "Data model"
for the ENUM-drop gotcha in `downgrade()` specifically.

### Frontend

```bash
cd frontend
npm install
npm run dev      # :5173
```

### pre-commit

`pip install pre-commit && pre-commit install` — runs ruff (+format) on
`backend/`, plus whitespace/large-file/secret-detection hooks, on every commit.

## Architecture

**Backend layout** (`backend/app/`):
```
main.py            app wiring only — FastAPI(), CORS, lifespan/seed data,
                    include_router(...), /api/health
core/
  database.py       engine/Session/get_db, loads .env (see below)
  security.py        JWT (short-lived access token, 15 min default) +
                      password hashing + get_current_user, plus the
                      refresh-token lifecycle (issue/rotate/revoke) backing
                      RefreshToken in models.py — see security.md's
                      "Resolved" section for why it's rotation, not reuse
  config.py           CORS_ORIGINS parsing
  llm.py               the only place that calls an LLM provider — see
                        .claude/rules/security.md for its fail-closed contract
  eta.py                the only backend place that calls Nominatim/OSRM —
                         geocodes + fetches real driving distance/duration,
                         widens it into a band; fail-closed like llm.py
                         (any failure returns None), see its docstring
api/
  deps.py             re-exports get_db/get_current_user for routes
  routes/
    auth.py            register/login/me/refresh/logout/PATCH me — register
                       and login return an access+refresh pair; refresh
                       rotates (old refresh token dies the moment a new one
                       is issued); logout revokes without needing a Bearer
                       header, same trust model as the refresh token itself;
                       PATCH /me self-edits company_name only (email/role
                       stay fixed post-registration), doesn't retroactively
                       rename the caller's past loads — see schemas.UserUpdate
    loads.py           list/detail/create/accept/complete/mine — the detail
                        route is GET /{load_id:int}; the :int converter is
                        load-bearing, not just typing hygiene, see its
                        docstring for why (route order vs. matching.py);
                        accept sets loads.accepted_at, the only "transit
                        started" timestamp eta.py has to work with; GET
                        /mine backs the personal-cabinet page — every load
                        the caller shows up on, either side, no role gate
    matching.py          smart matching — deterministic ranking heuristic
                          (equipment + lane-state overlap with a carrier's
                          own history), no LLM, no ML model yet
    search.py           NL search — parses via core/llm.py, applies the
                         result as SQLAlchemy filters, same query shape as
                         loads.py's list endpoint when there's no filter
    eta.py               arrival estimate — deterministic heuristic via
                          core/eta.py, no auth (public read, like the load
                          detail route)
models.py           SQLAlchemy models — flat, no second domain yet to split it by
schemas.py          Pydantic schemas — flat, same reasoning
```
`api/routes/` is already split by domain (auth / loads / matching / search);
`models.py` and `schemas.py` stay flat on purpose — each domain there is
still only a handful of small classes, not enough to justify a package per
domain yet. Revisit when one of them actually gets that big, not
preemptively.

**Frontend layout** (`frontend/src/`):
```
main.tsx            BrowserRouter + AuthProvider + App
App.tsx             shell only — header/nav/auth status, mounts <Routes>
constants.ts         STATUS_LABEL/ROLE_LABEL shared between pages
pages/
  HomePage.tsx        "/" — marketing landing page: hero, value props, the
                       3 shipped AI features, how-it-works, CTA band; fetches
                       GET /api/loads only for the hero's live load counts
  LoadsPage.tsx       "/loads" — list, search, matches, the post-a-load form.
                      Origin/destination are two Combobox pairs
                      (LocationFields, defined in this file) — state (a
                      fixed 51-entry list, usLocations.ts) then city
                      (live search scoped to that state, placeSearch.ts),
                      not free text — picking a real place from search
                      results guarantees every posted load geocodes
                      correctly on RouteMap/EtaWindow instead of a typo
                      silently breaking them later
  LoadDetailPage.tsx  "/loads/:id" — full detail for one load, accept action
  ProfilePage.tsx      "/profile" — personal cabinet: profile fields
                        (company_name is the only self-editable one, via
                        PATCH /api/auth/me) plus GET /api/loads/mine's list
                        (every load the caller shows up on, either side) with
                        per-status counts derived from it client-side, no
                        separate stats endpoint. Reachable from the header's
                        account badge (App.tsx), logged-in users only —
                        shows a login prompt otherwise, same pattern as
                        LoadDetailPage's accept button for a logged-out
                        visitor
  DocsPage.tsx         "/docs" — links out to the static copies of
                        docs/*.html + *.pdf under frontend/public/docs/ (see
                        "Docs" below for the sync duty this creates)
components/
  AuthPanel.tsx       login/register form, used from App's shell
  RouteMap.tsx        Leaflet map on the detail page — geocodes origin/
                       destination via geocode.ts, then draws the real
                       driving route via routing.ts; falls back to a
                       dashed straight line if either call fails, never
                       breaks the page
  EtaWindow.tsx        "Estimated arrival" panel, accepted/completed loads
                        only — calls GET /api/loads/{id}/eta (backend's
                        core/eta.py); renders nothing for an open load,
                        since RouteMap's own estimate above already covers
                        plain transit time regardless of status
  Combobox.tsx          generic searchable dropdown (a plain text input
                        that filters/searches as you type) — backs both
                        LoadsPage.tsx's state picker (instant, synchronous,
                        the fixed US_STATES list) and its city picker
                        (debounced, async, live placeSearch.ts search)
                        with one implementation; debouncing is opt-in per
                        instance (debounceMs prop), 0 for a sync source
AuthContext.tsx     auth state (token/user), localStorage-backed (both the
                    access and refresh token — see security.md for the
                    XSS trade-off that implies). Boots by exchanging a
                    stored refresh token for a fresh pair (no separate
                    /api/auth/me call needed, refresh already returns the
                    user), and schedules a silent background refresh ~30s
                    before the access token's own exp claim (decoded
                    client-side, not verified — only used to time the
                    next refresh, the server still enforces expiry on
                    every request) so an active session never visibly
                    401s. A failed refresh (dead/revoked token) logs out.
                    Also exposes updateUser() for ProfilePage.tsx — a
                    company_name edit doesn't touch either token (they
                    encode the user's email, not their company_name), so it
                    just replaces the cached user object, no re-issue needed
api.ts               every backend call in one place
geocode.ts            the only frontend place that calls a third-party
                       geocoder (Nominatim, keyless) — see security.md for
                       its rate-limit caveat; backend/app/core/eta.py also
                       calls Nominatim, server-side, for a different reason
routing.ts             the only frontend place that calls a third-party
                       router (OSRM's public demo server, keyless) — same
                       fail-closed contract and rate-limit caveat as
                       geocode.ts, see security.md; core/eta.py also calls
                       OSRM server-side, same caveat there too
usLocations.ts          fixed reference list of the 50 states + DC, used
                        for the post-a-load form's state picker and to
                        turn a chosen state code into its full name for
                        placeSearch.ts's queries
placeSearch.ts          the only frontend place that calls Photon
                        (photon.komoot.io, keyless) — live city/town/
                        village search for the post-a-load form's city
                        picker, scoped to whichever state's already
                        chosen; deliberately not Nominatim like
                        geocode.ts/routing.ts — Nominatim doesn't do
                        true prefix/typeahead matching (tried it first;
                        "Chicag" found nothing), Photon is built for
                        exactly that. Same fail-closed contract and
                        public-demo-server caveat as geocode.ts/routing.ts,
                        see security.md
```
`openAuth` (opens the login/register panel) lives in `App.tsx` and is passed
down as a prop to both pages rather than promoted to context — there are
only two call sites, a context would be premature.

**One `.env` at the repo root is the single source of config**, read three
different ways:
- `docker-compose.yml` substitutes `${VAR}` from it directly.
- The backend loads it via `python-dotenv` in `backend/app/core/database.py`
  (`load_dotenv(Path(__file__).resolve().parents[3] / ".env")`) — this runs
  as an import-time side effect, which is why `core/security.py` imports
  from `.database` before reading its own env vars.
- The frontend's `vite.config.ts` sets `envDir: ".."` so Vite reads the root
  `.env` instead of expecting one inside `frontend/`.

There are **two DB URLs by design**: `DATABASE_URL` (host networking —
`localhost:5433`, used when the backend runs outside Docker or in tests) and
`DATABASE_URL_DOCKER` (container networking — `db:5432`, injected into the
`backend` service in `docker-compose.yml`). Don't collapse these into one.

**Data model** (`backend/app/models.py`) is intentionally minimal: `users`,
`loads`, and `refresh_tokens` (the last one exists purely to make session
revocation possible — see security.md — and has no FKs pointing *into* it
from anywhere else, so it doesn't really add domain complexity). Schema is
managed by Alembic (`backend/migrations/`,
`alembic.ini`) — `Base.metadata.create_all()` is gone; every schema change
is a migration file now. `migrations/env.py` builds its engine from
`app.core.database.engine` directly (same `DATABASE_URL` resolution the
app itself uses — one URL path, not two). Migrations are applied by
whatever starts the app, not by the app itself: `backend/entrypoint.sh`
(Docker — retries `alembic upgrade head` since a first-boot Postgres can
briefly reject connections even after its healthcheck passes), a
session-scoped autouse fixture in `backend/tests/conftest.py` (so
`pytest` still works right after `docker compose up -d db`, no separate
manual step), and CI runs it as its own step before `pytest`
(`.github/workflows/ci.yml`). `alembic revision --autogenerate -m "..."`
to add one; **check the generated `downgrade()` by hand** — Postgres ENUM
types (`role`, `status` are both `sa.Enum`) don't get dropped when their
table does, autogenerate won't add that for you, and the next `upgrade()`
fails on "type already exists" if you skip it (see the initial migration
for the pattern: `sa.Enum(name="...").drop(op.get_bind(), checkfirst=True)`).
`Load` has `shipper_id`/`carrier_id` FKs into `users`, enforced at the API
layer (`api/routes/loads.py`) — this used to be a P0 gap, now closed.
`Load` also has `accepted_at` (nullable, set server-side by `accept_load`)
— added for the ETA MVP (`core/eta.py`), it's the only "transit started"
timestamp the system has without a telematics/GPS feed.
`Load.shipper_name`/`carrier_name` stay a denormalized display cache set
from `company_name` at post/accept time, not a live join — `PATCH
/api/auth/me` (the personal-cabinet page's company-name edit) only affects
`users.company_name` going forward, it doesn't rewrite the name cached on
loads posted/accepted before the rename. Accepted trade-off of the existing
denormalization design, not a bug (see `update_me()`'s docstring,
`api/routes/auth.py`).
Still-open gaps (the refresh token's localStorage/XSS exposure, test
coverage) are tracked in `.claude/rules/security.md`, not repeated here.

**Docs** (`docs/`) hold two long-form specs, each with an HTML source and a
generated PDF twin:
- `project-documentation.html` — investor-facing overview, UA/EN language toggle.
- `technical-documentation.html` — the actual engineering spec: target
  architecture, data model, and per-feature design for the 7 planned AI
  services, plus a UA/EN language toggle. Its final section is a running,
  prioritized list of known technical debt — check it before "fixing"
  something that's already a tracked, deliberate decision, and update it if
  you close one of those items.

`frontend/public/docs/` holds a **copy** of all four files above (both
`.html`, both `.pdf`) — not a symlink, real duplicated files, because this
is a demo with no production static-file host and no build pipeline beyond
Vite's dev server; `pages/DocsPage.tsx` links to these copies so visitors
can read the docs in-app without leaving the site. Vite serves anything
under `frontend/public/` as-is at that same path (`/docs/technical-
documentation.html`, etc.), and it works identically in Docker (bind-mounts
`./frontend:/app`, no extra volume needed) and outside it — see the ground
rule above for the copy step this creates every time `docs/*.html` changes.

CI (`.github/workflows/ci.yml`) runs the backend job against a real
`postgres:16-alpine` service container, not a mock — tests that need the DB
work the same way locally and in CI.
