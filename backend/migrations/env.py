from logging.config import fileConfig

from alembic import context

# Registers User/Load on Base.metadata (the import itself is the point —
# `models` isn't used directly below) and gives us the exact same engine
# app/core/database.py builds from DATABASE_URL, so migrations always target
# whatever DB the app itself would connect to — one URL-resolution path,
# not two copies of it drifting apart.
from app import models  # noqa: F401
from app.core.database import Base, engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of running it against a live DB —
    `alembic upgrade head --sql`. Not used by this project's normal flow
    (see migrations/README), kept for completeness.

    `render_as_string(hide_password=False)` matters here: plain `str(url)`
    masks the password as `***` (it's meant for logging), which would
    silently produce a URL nothing can actually authenticate with."""
    context.configure(
        url=engine.url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Reuse the app's own Engine directly instead of rebuilding one from a
    # stringified URL — sidesteps the same password-masking trap as above
    # and means there's truly one Engine construction path, not two.
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
