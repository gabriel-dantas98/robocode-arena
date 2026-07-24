#!/bin/sh
set -e
cd -- "$(dirname -- "$0")"
export NODE_OPTIONS="--disable-warning=ExperimentalWarning"
exec "/Users/gdantas/git/gdantas/robocode-arena/bots/node_modules/.bin/tsx" "SittingDuck2.ts"
