#!/usr/bin/env bash
# Runs the Supabase SQL tests against a throwaway local PostgreSQL (no Docker, no root).
#   ./scripts/db-test.sh            or   npm run test:db
# Requires PostgreSQL server binaries (initdb, pg_ctl, postgres, psql). Set PG_BIN to their folder
# if they are not on PATH (e.g. /usr/lib/postgresql/16/bin).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-}"
if [[ -z "$PG_BIN" ]]; then
  # Debian/Ubuntu keep server binaries outside PATH; Homebrew uses /opt/homebrew or /usr/local.
  candidates=(/usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin /opt/homebrew/bin /usr/local/bin /usr/bin)
  if command -v initdb >/dev/null 2>&1; then candidates=("$(dirname "$(command -v initdb)")" "${candidates[@]}"); fi
  for dir in "${candidates[@]}"; do
    [[ -x "$dir/initdb" && -x "$dir/pg_ctl" ]] && PG_BIN="$dir" && break
  done
fi
if [[ -z "$PG_BIN" ]]; then
  echo "PostgreSQL server binaries (initdb, pg_ctl) not found." >&2
  echo "Install PostgreSQL 16 (apt install postgresql / brew install postgresql@16) or set PG_BIN to their folder." >&2
  exit 1
fi
if [[ "$(id -u)" -eq 0 ]]; then
  echo "PostgreSQL refuses to run as root: run the database tests as a regular user." >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/pc-db-test.XXXXXX")"
PORT="${DB_TEST_PORT:-55439}"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start -w >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/supabase_shim.sql"
for migration in "$ROOT_DIR"/supabase/migrations/*.sql; do
  echo "▶ migration $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
  # Migrations must be re-runnable.
  "${PSQL[@]}" -f "$migration"
done

status=0
for test in "$ROOT_DIR"/supabase/tests/*.test.sql; do
  echo "▶ $(basename "$test")"
  if ! "${PSQL[@]}" -f "$test"; then
    status=1
    echo "✘ $(basename "$test") failed" >&2
  fi
done
[[ $status -eq 0 ]] && echo "✔ all database tests passed"
exit $status
