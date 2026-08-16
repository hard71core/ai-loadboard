---
paths:
  - "backend/**/*.py"
  - "frontend/src/**/*.{ts,tsx}"
  - "frontend/*.{ts,tsx}"
---

# Code style

## Python (backend)

Config lives in `backend/pyproject.toml`. Lint + format with `ruff`
(installed via `backend/requirements-dev.txt`):

```bash
cd backend
ruff check .            # lint
ruff check . --fix      # lint, autofix what's safe
ruff format .           # format (also runs via pre-commit)
```

Two deliberate deviations from ruff defaults, both already configured — don't
"fix" them back:

- `UP042` (str+Enum → `enum.StrEnum`) is ignored. `LoadStatus`/`UserRole` in
  `models.py` stay `class X(str, enum.Enum)` until that's a deliberate change
  of its own, not a lint-driven drive-by edit.
- `fastapi.Depends`/`Query`/`Body`/`Header` are listed under
  `flake8-bugbear.extend-immutable-calls`, so ruff doesn't flag FastAPI's
  `db: Session = Depends(get_db)` pattern as a mutable-default bug (B008) —
  that pattern is correct FastAPI usage, keep writing it that way.

Modern typing only: `str | None` not `Optional[str]`, `list[X]` not
`List[X]`, `datetime.now(UTC)` not `datetime.now(timezone.utc)`.

## TypeScript / React (frontend)

Flat ESLint config in `frontend/eslint.config.js`
(`@eslint/js` + `typescript-eslint` + `react-hooks` + `react-refresh`,
the standard Vite React-TS template setup):

```bash
cd frontend
npm run lint     # eslint .
npm run build     # tsc -b && vite build — the type-check happens here
```

No separate formatter is configured for the frontend (no Prettier) — match
the existing style in the file you're editing.

## General bar

Both languages: no unused/dead config (if you add an env var or a setting,
wire it into actual behavior, don't leave it declared-but-unread), proper
error handling over silent failure, and code written to the standard you'd
want a senior engineer reviewing it against — see the root
`.claude/CLAUDE.md` ground rules for the non-code-specific version of this.

**English only, everywhere except the two `docs/*.html` specs.** Code,
comments, UI copy, API error messages (`HTTPException(detail=...)`), seed
data, commit messages, and `README.md` are all English — no Cyrillic. The
one deliberate exception is `docs/project-documentation.html` and
`docs/technical-documentation.html` (see "Docs" in `.claude/CLAUDE.md`),
which carry a UA/EN toggle and stay bilingual on purpose.
