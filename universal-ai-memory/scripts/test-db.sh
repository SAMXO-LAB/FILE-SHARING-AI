#!/usr/bin/env bash
# Local Postgres (with pgvector) for DB-level tests: RLS, search, queue, usernames.
# Usage: scripts/test-db.sh up|down|reset
# Requires PostgreSQL 15+ server binaries and the pgvector extension installed locally.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.test-db/data"
PORT="${TEST_DB_PORT:-54329}"
PGBIN="${PGBIN:-$(dirname "$(ls /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then
  # Postgres refuses to run as root. Use an unprivileged user.
  RUNAS="runuser -u ${TEST_DB_USER:-claude} --"
  mkdir -p "$ROOT/.test-db" && chown -R "${TEST_DB_USER:-claude}" "$ROOT/.test-db"
fi

run() { $RUNAS "$@"; }

case "${1:-up}" in
  up)
    if [ ! -d "$DATA" ]; then
      run "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
    fi
    if ! run "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
      run "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $ROOT/.test-db -c listen_addresses=127.0.0.1 -c fsync=off" -l "$ROOT/.test-db/log" -w start >/dev/null
    fi
    echo "postgres://postgres@127.0.0.1:$PORT/postgres"
    ;;
  down)
    run "$PGBIN/pg_ctl" -D "$DATA" -m fast stop || true
    ;;
  reset)
    "$0" down || true
    rm -rf "$ROOT/.test-db"
    "$0" up
    ;;
esac
