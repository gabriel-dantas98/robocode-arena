#!/usr/bin/env bash
# Stop all robocode-arena processes (engine, lobby, leftover stub JVMs).
set -euo pipefail
pkill -f 'robocode-arena-engine' 2>/dev/null || true
pkill -f 'arena.engine.MainKt' 2>/dev/null || true
pkill -f 'bun run src/server/index.ts' 2>/dev/null || true
pkill -f 'apps/lobby/src/server/index.ts' 2>/dev/null || true
pkill -f 'Stub[0-9]+\.java' 2>/dev/null || true
pkill -f 'java -cp .*Stub[0-9]' 2>/dev/null || true
pkill -f 'scale/run-matrix' 2>/dev/null || true
pkill -f 'chrome-headless-shell.*playwright' 2>/dev/null || true
sleep 1
echo "stopped. remaining:"
pgrep -fl 'robocode-arena|Stub0|tankroyale' || echo "(none)"
