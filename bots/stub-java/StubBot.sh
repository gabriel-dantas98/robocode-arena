#!/bin/sh
set -e
cd -- "$(dirname -- "$0")"
# Cap heap — workshop bots must stay cheap.
exec java -Xms8m -Xmx48m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -cp "../lib/*:." StubBot.java
