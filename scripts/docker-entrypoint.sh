#!/usr/bin/env bash
set -euo pipefail
cd /app

# Railway injects PORT; keep LOBBY_PORT in sync for local/docs.
export LOBBY_PORT="${PORT:-${LOBBY_PORT:-7610}}"
export PORT="${LOBBY_PORT}"
export ENGINE_PORT="${ENGINE_PORT:-7601}"
export ENGINE_URL="${ENGINE_URL:-http://127.0.0.1:${ENGINE_PORT}}"

echo "[arena] starting engine on :${ENGINE_PORT}"
ENGINE_PORT="${ENGINE_PORT}" JAVA_OPTS="${JAVA_OPTS:--Xmx768m}" \
  /app/engine/bin/robocode-arena-engine > /tmp/engine.log 2>&1 &
ENGINE_PID=$!

cleanup() {
  kill "$ENGINE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${ENGINE_PORT}/health" >/dev/null; then
    echo "[arena] engine healthy"
    break
  fi
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    echo "[arena] engine died during boot" >&2
    tail -50 /tmp/engine.log >&2 || true
    exit 1
  fi
  sleep 0.5
done

echo "[arena] starting lobby on :${PORT}"
cd /app/apps/lobby
exec bun run src/server/index.ts
