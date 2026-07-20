#!/bin/sh
set -e
cd -- "$(dirname -- "$0")"
ROOT="$(cd .. && pwd)"
export NODE_OPTIONS="--disable-warning=ExperimentalWarning"
exec "$ROOT/node_modules/.bin/tsx" "StubBot.ts"
