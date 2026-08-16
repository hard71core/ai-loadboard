# AI Loadboard — demo

A freight marketplace demo connecting shippers and carriers directly (no broker).
A basic transactional scaffold plus two working MVP features from the planned AI
subsystem — natural-language load search and smart load matching (the matching
MVP is a deterministic ranking heuristic, not the embeddings/ML model the docs
describe as the target — there's no real carrier behavior data yet to train
one on); the rest of the AI subsystem described in
`docs/technical-documentation.html` is designed but not yet built.

## Stack

- **Frontend:** React + TypeScript (Vite), `frontend/`
- **Backend:** Python, FastAPI, `backend/`
- **Database:** PostgreSQL, schema managed by Alembic migrations (`backend/migrations/`)
- **AI:** Anthropic Claude (Haiku 4.5, structured outputs) — natural-language load
  search, `backend/app/core/llm.py`
- **Maps:** Leaflet + CARTO Voyager tiles, OpenStreetMap Nominatim for geocoding
  and OSRM for driving routes (no API key for either) — the load detail
  page's route map, `frontend/src/components/RouteMap.tsx`

## Setup

All sensitive config (DB password, JWT secret, ports) lives in a single `.env`
file at the project root, which is **not** committed to git. Before the first run:

```bash
cp .env.example .env
```

It ships with working defaults for local development — no changes needed just to
bring the project up. Before any shared/staging environment, always generate a
new `JWT_SECRET` (`openssl rand -hex 32`) and never reuse secrets across
environments.

`NL_SEARCH_ENABLED` defaults to `false`, so natural-language load search
(`POST /api/search`) never spends Anthropic credits until you deliberately
set it to `true`. `ANTHROPIC_API_KEY` is also optional on top of that — without
it (or with the placeholder from `.env.example`, or if the account is out of
credit, or with the flag off), search falls back to a plain keyword match
instead of an AI filter — the app never crashes or blocks either way, and the
fallback still actually searches rather than returning everything.

## Running via Docker

Requires Docker Desktop running.

```bash
docker compose up --build
```

Once it's up:

- Frontend: http://localhost:5173
- API: http://localhost:8001
- API docs (Swagger): http://localhost:8001/docs

The database seeds itself with a handful of demo loads on first run.

## Developing without Docker

For working in PyCharm/locally (autocomplete, debugger, tests without rebuilding
the container):

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements-dev.txt

docker compose up -d db            # only the DB is needed; run the backend yourself
cd backend
alembic upgrade head                # apply migrations (pytest does this for you too)
uvicorn app.main:app --reload --port 8000

# in another terminal
pytest                              # tests
ruff check .                        # lint
```

In PyCharm: `Settings → Project → Python Interpreter` already points at
`.venv/bin/python` at the repo root (created automatically the first time the
project is opened).

```bash
# Frontend
cd frontend
npm install
npm run dev                         # http://localhost:5173
npm run lint
npm run build
```

### pre-commit (optional, but recommended)

Automatically strips trailing whitespace, catches large files/private keys,
and runs `ruff` before every commit:

```bash
pip install pre-commit
pre-commit install
```

### CI

`.github/workflows/ci.yml` runs backend lint+tests (against a real Postgres
service) and frontend lint+build on every push/PR via GitHub Actions.

## What the demo does

- Sign up and log in (email + password, JWT), with a role picked at
  registration: **shipper** or **carrier**
- List of open loads (route, equipment type, weight, rate, shipper) — click
  any row to open its detail page (`/loads/:id`), which includes a map with
  the origin/destination pinned and the actual driving route between them —
  distance and estimated drive time in their own panel — geocoded via
  OpenStreetMap's Nominatim and routed via OSRM, no API key needed for
  either; falls back to a dashed straight line if live routing is
  temporarily unavailable
- Natural-language load search (e.g. "reefer out of Dallas under 900") — when
  `NL_SEARCH_ENABLED=true`, Claude Haiku 4.5 turns the query into a
  structured filter; off by default (or if the key is missing or the LLM
  call fails), it's a plain keyword match across
  title/origin/destination/equipment instead
- "Recommended for you" for carriers — ranks open loads against the
  carrier's own history (equipment types and lane states they've run
  before); a carrier with no history yet just sees the newest loads first
- Posting a new load — available only to authenticated shippers
- "Accept load" — available only to authenticated carriers; they take the load
  directly, with no broker in between
- Statuses: Open → Accepted → Completed

Test accounts can be created right in the UI via the "Sign up" button. The
session token is stored in the browser (localStorage), so the login persists
across page reloads.

## Stopping

```bash
docker compose down
```

Add `-v` to also drop the database data (`docker compose down -v`).
