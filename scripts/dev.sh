#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$PATH"
export ENGINE_PORT="${ENGINE_PORT:-7601}"
export LOBBY_PORT="${LOBBY_PORT:-7610}"
export ENGINE_URL="http://127.0.0.1:${ENGINE_PORT}"

cd "$ROOT/apps/engine"
if [[ ! -x build/install/robocode-arena-engine/bin/robocode-arena-engine ]]; then
  gradle installDist --no-daemon
fi

echo "Starting engine on :$ENGINE_PORT"
ENGINE_PORT="$ENGINE_PORT" JAVA_OPTS="-Xmx2g" \
  "$ROOT/apps/engine/build/install/robocode-arena-engine/bin/robocode-arena-engine" \
  > /tmp/robocode-arena-engine.log 2>&1 &
ENGINE_PID=$!

echo "Starting lobby on :$LOBBY_PORT"
cd "$ROOT/apps/lobby"
LOBBY_PORT="$LOBBY_PORT" ENGINE_URL="$ENGINE_URL" \
  bun run src/server/index.ts > /tmp/robocode-arena-lobby.log 2>&1 &
LOBBY_PID=$!

cleanup() {
  kill "$ENGINE_PID" "$LOBBY_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Engine PID=$ENGINE_PID Lobby PID=$LOBBY_PID"
echo "Open http://127.0.0.1:$LOBBY_PORT"
wait
