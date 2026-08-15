# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A demo-stage, two-sided freight marketplace: a shipper posts a load, a carrier
takes it directly — no broker. Despite the "AI Loadboard" name, **zero AI
features are implemented**. The backend is a plain FastAPI CRUD service
(`backend/app/`) over two tables, the frontend is a single-screen React SPA
(`frontend/`). The full AI/event-driven architecture (7 AI services, an event
bus, etc.) is a *target design*, documented but not built — see "Docs" below
before assuming any AI-related code exists to modify.

## Ground rules

- **Never install anything globally on the host.** No `pip install` outside
  `.venv`, no `npm install -g`, no `brew install` for anything this project
  depends on. Python deps go in `.venv/` (`pip install -r ...` after
  activating it), JS deps in `frontend/node_modules/` (`npm install`). If a
  genuinely system-level tool is missing (Docker, a language runtime itself),
  ask before installing it rather than reaching for a global install.
- **Docs move with the code, in the same change.** Any change to
  architecture, the data model, endpoints, config/env vars, or tooling gets
  reflected in `docs/technical-documentation.html` as part of that change —
  not as a separate follow-up. Update the maturity pill (MVP → Phase 2 →
  Phase 3 → R&D) when something ships, and regenerate
  `docs/technical-documentation.pdf` to match (Chrome headless
  `--print-to-pdf`, as used to produce the current one). If you close an item
  in the section 17 tech-debt table, mark it resolved there instead of
  leaving it stale.
- **Build it like a senior team would, not like a demo.** Proper error
  handling and input validation, no unused/dead config, tests for new
  behavior, small reviewable commits with real messages — the bar is "would
  this pass review from a senior engineer," not "does it run once."
- **Default to standard security practice**, unprompted: secrets only ever
  live in `.env` (never committed, never hardcoded as a fallback in code
  beyond the existing dev placeholder), every mutating endpoint checks auth
  and ownership, CORS stays an explicit allowlist, queries stay parameterized
  (SQLAlchemy handles this — don't hand-build SQL strings), dependencies stay
  within the version bounds in `requirements.txt`/`package.json`. If you spot
  a gap like this while working on something else, say so explicitly (e.g.
  add it to section 17) rather than quietly leaving it.

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

ruff check .                                          # lint
pytest                                                # all tests (needs the DB above)
pytest tests/test_health.py::test_health_check_returns_ok   # single test
```

The PyCharm interpreter for this project is `.venv/bin/python` at the repo root.

### Frontend

```bash
cd frontend
npm install
npm run dev      # :5173
npm run lint      # eslint
npm run build     # tsc type-check + vite build — this is also the CI "test" step
```

There is no frontend test runner configured yet.

### pre-commit

`pip install pre-commit && pre-commit install` — runs ruff (+format) on
`backend/`, plus whitespace/large-file/secret-detection hooks, on every commit.

## Architecture

**One `.env` at the repo root is the single source of config**, read three
different ways:
- `docker-compose.yml` substitutes `${VAR}` from it directly.
- The backend loads it via `python-dotenv` in `backend/app/database.py`
  (`load_dotenv(Path(__file__).resolve().parents[2] / ".env")`) — this runs
  as an import-time side effect, which is why `auth.py` imports from
  `database` before reading its own env vars.
- The frontend's `vite.config.ts` sets `envDir: ".."` so Vite reads the root
  `.env` instead of expecting one inside `frontend/`.

There are **two DB URLs by design**: `DATABASE_URL` (host networking —
`localhost:5433`, used when the backend runs outside Docker or in tests) and
`DATABASE_URL_DOCKER` (container networking — `db:5432`, injected into the
`backend` service in `docker-compose.yml`). Don't collapse these into one.

**Data model** (`backend/app/models.py`) is intentionally minimal: `users`
and `loads` only. Notably, `loads.shipper_name` / `carrier_name` are free-text
columns, **not foreign keys** into `users` — a load isn't actually linked to
the authenticated user who posted or took it. Relatedly, `POST /api/loads`,
`/api/loads/{id}/accept` and `/api/loads/{id}/complete` in `backend/app/main.py`
do **not** check authentication or role, even though the README describes
them as restricted to authenticated shippers/carriers. Both are known,
tracked gaps (see Docs) — don't assume ownership/auth semantics exist just
because a field or a README line implies them.

Auth (`backend/app/auth.py`) is JWT (HS256, via `python-jose`) with
`bcrypt`/`passlib` password hashing, sent as `Authorization: Bearer <token>`.
No refresh token, no revocation. Schema is created via
`Base.metadata.create_all()` on startup (`lifespan` in `main.py`) — there are
no migrations.

**Docs** (`docs/`) hold two long-form specs, each with an HTML source and a
generated PDF twin:
- `project-documentation.html` — investor-facing overview.
- `technical-documentation.html` — the actual engineering spec: target
  architecture, data model, and per-feature design for the 7 planned AI
  services, plus a UA/EN language toggle. Its final section is a running,
  prioritized list of known technical debt (including the two gaps above) —
  check it before "fixing" something that's already a tracked, deliberate
  decision, and update it if you close one of those items.

CI (`.github/workflows/ci.yml`) runs the backend job against a real
`postgres:16-alpine` service container, not a mock — tests that need the DB
work the same way locally and in CI.
