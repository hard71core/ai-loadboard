# Security

No `paths` frontmatter on this file on purpose — it applies everywhere,
loaded at launch same as `.claude/CLAUDE.md`, not just when touching backend
code.

## Standing rules

- Secrets live only in `.env` (gitignored). Never commit one, never hardcode
  a real secret as a fallback in code — the one exception is the existing
  `"dev-secret-change-me"` placeholder default in `backend/app/core/security.py`,
  which only exists so the demo boots without setup; don't add others like it.
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
- Backend test coverage is still thin — health check plus loads
  auth/ownership only (`backend/tests/`). No frontend tests exist. Tracked
  as P1.
