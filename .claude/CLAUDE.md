# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A demo-stage, two-sided freight marketplace: a shipper posts a load, a carrier
takes it directly — no broker. The backend is a plain FastAPI CRUD service
(`backend/app/`) over two tables, the frontend is a single-screen React SPA
(`frontend/`). **Two of the 7 planned AI features have a working MVP**:
natural-language load search (`POST /api/search`, `core/llm.py`, Claude
Haiku 4.5, structured outputs, gated off by default behind
`NL_SEARCH_ENABLED` — see `.claude/rules/security.md`) and smart load
matching (`GET /api/loads/matches`, `api/routes/matching.py`) — but
matching's MVP is a **deterministic heuristic**, not the embeddings +
gradient-boosting model section 7.3 of the tech doc describes as the
target; there's no real carrier behavior data yet to train anything on.
The other 5 (pricing, the negotiation agent, trust scoring, document
intelligence, ETA) plus the full event-driven architecture (a separate
service per feature, an event bus) are still a *target design*, documented
but not built — see "Docs" below before assuming more AI-related code
exists than these two features, and don't assume "AI feature" implies an
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
  leaving it stale.
- **Build it like a senior team would, not like a demo.** The bar is "would
  this pass review from a senior engineer," not "does it run once" — see
  `.claude/rules/code-style.md` and `.claude/rules/testing.md` for what that
  means concretely here.

## Git workflow

Remote `origin` is https://github.com/hard71core/ai-loadboard (public).
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

### Backend, outside Docker

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements-dev.txt
docker compose up -d db                              # only the DB
cd backend && uvicorn app.main:app --reload --port 8000
```

The PyCharm interpreter for this project is `.venv/bin/python` at the repo root.

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
  security.py        JWT + password hashing, get_current_user
  config.py           CORS_ORIGINS parsing
  llm.py               the only place that calls an LLM provider — see
                        .claude/rules/security.md for its fail-closed contract
api/
  deps.py             re-exports get_db/get_current_user for routes
  routes/
    auth.py            register/login/me
    loads.py           list/create/accept/complete
    matching.py          smart matching — deterministic ranking heuristic
                          (equipment + lane-state overlap with a carrier's
                          own history), no LLM, no ML model yet
    search.py           NL search — parses via core/llm.py, applies the
                         result as SQLAlchemy filters, same query shape as
                         loads.py's list endpoint when there's no filter
models.py           SQLAlchemy models — flat, no second domain yet to split it by
schemas.py          Pydantic schemas — flat, same reasoning
```
`api/routes/` is already split by domain (auth / loads / matching / search);
`models.py` and `schemas.py` stay flat on purpose — each domain there is
still only a handful of small classes, not enough to justify a package per
domain yet. Revisit when one of them actually gets that big, not
preemptively.

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

**Data model** (`backend/app/models.py`) is intentionally minimal: `users`
and `loads` only, no migrations — schema is created via
`Base.metadata.create_all()` in the `lifespan` handler in `main.py`. `Load`
has `shipper_id`/`carrier_id` FKs into `users`, enforced at the API layer
(`api/routes/loads.py`) — this used to be a P0 gap, now closed. Still-open
gaps (JWT refresh/revocation, test coverage) are tracked in
`.claude/rules/security.md`, not repeated here.

**Docs** (`docs/`) hold two long-form specs, each with an HTML source and a
generated PDF twin:
- `project-documentation.html` — investor-facing overview, UA/EN language toggle.
- `technical-documentation.html` — the actual engineering spec: target
  architecture, data model, and per-feature design for the 7 planned AI
  services, plus a UA/EN language toggle. Its final section is a running,
  prioritized list of known technical debt — check it before "fixing"
  something that's already a tracked, deliberate decision, and update it if
  you close one of those items.

CI (`.github/workflows/ci.yml`) runs the backend job against a real
`postgres:16-alpine` service container, not a mock — tests that need the DB
work the same way locally and in CI.
