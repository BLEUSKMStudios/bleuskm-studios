#!/usr/bin/env bash
# Starts a throwaway Supabase Postgres container for the permission tests and
# exports the PG* connection settings. Used by CI. A fresh random password is
# made for each run, so no password is ever written in the repository.
set -euo pipefail

image="supabase/postgres:17.6.1.054"
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export POSTGRES_PASSWORD

docker run -d --name studio-test-db -p 5432:5432 -e POSTGRES_PASSWORD "$image" >/dev/null

for i in $(seq 1 90); do
  if docker exec studio-test-db pg_isready -U postgres -h localhost >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "::add-mask::$POSTGRES_PASSWORD"
  {
    echo "PGHOST=localhost"
    echo "PGPORT=5432"
    echo "PGUSER=postgres"
    echo "PGDATABASE=postgres"
    echo "PGPASSWORD=$POSTGRES_PASSWORD"
  } >> "$GITHUB_ENV"
fi
echo "Throwaway test database is ready."
