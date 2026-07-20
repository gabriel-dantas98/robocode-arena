#!/bin/sh
set -e
cd -- "$(dirname -- "$0")"
ROOT="$(cd ../.. && pwd)"
export NODE_OPTIONS="--disable-warning=ExperimentalWarning"
# Prefer shared bots/node_modules
if [ -x "$ROOT/node_modules/.bin/tsx" ]; then
  exec "$ROOT/node_modules/.bin/tsx" "ArenaBot.ts"
fi
exec npx --yes tsx "ArenaBot.ts"
