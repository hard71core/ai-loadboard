"""Small config helpers. Not a full settings object yet (that's the natural
next step if/when more env-driven config shows up) — just pulling
CORS_ORIGINS parsing out of main.py so main.py stays app wiring only."""

import os

from . import database  # noqa: F401  (import for its load_dotenv() side effect)


def get_cors_origins() -> list[str]:
    """Comma-separated list of allowed origins, e.g.
    "http://localhost:5173,https://app.example.com". Falls back to the Vite
    dev server origin so `docker compose up` keeps working out of the box
    even if CORS_ORIGINS isn't set."""
    return [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]
