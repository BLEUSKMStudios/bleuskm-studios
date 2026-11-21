#!/usr/bin/env bash
# Applies every migration to an empty Supabase Postgres database, then runs
# the pgTAP permission tests. Used by CI and locally.
#
# Expects a throwaway database from the supabase/postgres image, reachable via
# the standard PG* environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD,
# PGDATABASE). Never point this at a real project: the tests create and roll
# back their own fixtures, but the migrations are applied for real.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${PGHOST:-}" in
  localhost|127.0.0.1|postgres) ;;
  *) echo "Refusing to run: PGHOST must be a local throwaway database (got '${PGHOST:-unset}')." >&2; exit 2 ;;
esac

for i in $(seq 1 60); do
  psql -Atqc "select 1" >/dev/null 2>&1 && break
  sleep 1
done

echo "Applying migrations"
for f in migrations/*.sql; do
  echo "  $f"
  psql -q -v ON_ERROR_STOP=1 -f "$f"
done

echo "Running permission tests"
pg_prove --verbose tests/database/*.test.sql
