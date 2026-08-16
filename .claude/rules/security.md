# Security

No `paths` frontmatter on this file on purpose — it applies everywhere,
loaded at launch same as `.claude/CLAUDE.md`, not just when touching backend
code.

## Standing rules

- Secrets live only in `.env` (gitignored). Never commit one, never hardcode
  a real secret as a fallback in code — the one exception is the existing
  `"dev-secret-change-me"` placeholder default in `backend/app/auth.py`,
  which only exists so the demo boots without setup; don't add others like it.
- Every mutating endpoint must check authentication **and** ownership before
  this project can be considered production-safe (see "Known gaps" below —
  this isn't true yet for three endpoints).
- CORS stays an explicit allowlist via the `CORS_ORIGINS` env var
  (`backend/app/main.py`), never `allow_origins=["*"]`.
- Queries stay parameterized through the SQLAlchemy ORM — never hand-build
  SQL strings, even for internal/admin tooling.
- Dependency versions stay within the bounds pinned in
  `backend/requirements.txt` / `frontend/package.json`; don't loosen a bound
  to make a version conflict go away without checking why it conflicted.
- If you spot a new gap like the ones below while working on something else,
  say so explicitly and add it to the tech-debt table in
  `docs/technical-documentation.html` section 17 — don't quietly leave it
  unnoted, and don't quietly fix it either without flagging that you did.

## Known gaps (already tracked — don't silently "fix" without flagging)

- **`POST /api/loads`, `/api/loads/{id}/accept`, `/api/loads/{id}/complete`
  don't check authentication or role**, despite the README describing them
  as restricted to authenticated shippers/carriers. Anyone can currently call
  them without a token. Tracked as P0 in
  `docs/technical-documentation.html` section 17.
- **`loads.shipper_name` / `carrier_name` are free-text columns, not foreign
  keys into `users`** (`backend/app/models.py`) — a load isn't actually
  linked to the authenticated user who posted or took it, so ownership
  checks can't be enforced correctly until this is fixed first. Also P0.
- Auth (`backend/app/auth.py`) is JWT (HS256, `python-jose`) with no refresh
  token and no revocation — a stolen token is valid for the full
  `JWT_EXPIRE_MINUTES` window (7 days by default). Tracked as P1.

If you're asked to work on any of the three endpoints above, treat fixing
the auth/ownership check as in scope by default rather than perpetuating the
gap — but say clearly that's what you're doing, since it's a behavior change,
not just tooling.
