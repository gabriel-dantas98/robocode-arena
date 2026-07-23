#!/usr/bin/env bash
set -euo pipefail
cd /app

echo "[arena] starting engine on :${ENGINE_PORT:-7601}"
ENGINE_PORT="${ENGINE_PORT:-7601}" JAVA_OPTS="${JAVA_OPTS:--Xmx768m}" \
  /app/engine/bin/robocode-arena-engine > /tmp/engine.log 2>&1 &
ENGINE_PID=$!

cleanup() {
  kill "$ENGINE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${ENGINE_PORT:-7601}/health" >/dev/null; then
    echo "[arena] engine healthy"
    break
  fi
  sleep 0.5
done

echo "[arena] starting lobby on :${LOBBY_PORT:-7610}"
cd /app/apps/lobby
exec bun run src/server/index.ts
