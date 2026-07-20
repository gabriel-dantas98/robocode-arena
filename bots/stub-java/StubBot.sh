#!/bin/sh
set -e
cd -- "$(dirname -- "$0")"
exec java -cp "../lib/*:." StubBot.java
