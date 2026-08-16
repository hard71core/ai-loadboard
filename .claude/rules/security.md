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

Both were P0 in `docs/technical-documentation.html` section 17, now marked
closed there.

## Known gaps (still open — don't silently "fix" without flagging)

- Auth (`backend/app/core/security.py`) is JWT (HS256, `python-jose`) with no refresh
  token and no revocation — a stolen token is valid for the full
  `JWT_EXPIRE_MINUTES` window (7 days by default). Tracked as P1.
- Backend test coverage is still thin — health check, loads auth/ownership,
  and `/api/search` (LLM call mocked) only (`backend/tests/`). No frontend
  tests exist. Tracked as P1.
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
