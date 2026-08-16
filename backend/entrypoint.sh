#!/bin/sh
# Applies pending migrations before the app starts, retrying instead of
# crashing immediately — the db container's healthcheck (docker-compose.yml)
# already gates when this container starts, but a first-boot Postgres does
# an internal restart during initdb that can briefly reject connections
# even after healthcheck says "healthy", so this still needs its own retry.
set -e

attempt=1
max_attempts=15
until alembic upgrade head; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "alembic upgrade head failed after $max_attempts attempts, giving up." >&2
    exit 1
  fi
  echo "Migration attempt $attempt/$max_attempts failed, retrying in 2s..." >&2
  attempt=$((attempt + 1))
  sleep 2
done

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
