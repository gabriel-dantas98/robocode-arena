#!/usr/bin/env bun
/**
 * Generate N unique Java stub bot directories for scale testing.
 * Usage: bun scripts/scale/generate-stubs.ts <count> [outDir]
 */
import { mkdirSync, writeFileSync, cpSync, existsSync, chmodSync } from "fs";
import { join, resolve } from "path";

const count = Number(process.argv[2] || "3");
const outDir = resolve(process.argv[3] || join(import.meta.dir, "../../data/generated/stubs"));
const templateDir = resolve(import.meta.dir, "../../bots/stub-java");
const libDir = resolve(import.meta.dir, "../../bots/lib");

if (!Number.isFinite(count) || count < 2) {
  console.error("count must be >= 2");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// lib sibling of stub dirs: data/generated/stubs/lib  (from StubXXXX use ../lib/*)
const outLib = join(outDir, "lib");
if (existsSync(libDir)) {
  mkdirSync(outLib, { recursive: true });
  cpSync(libDir, outLib, { recursive: true });
}

const paths: string[] = [];

for (let i = 1; i <= count; i++) {
  const name = `Stub${String(i).padStart(4, "0")}`;
  const dir = join(outDir, name);
  mkdirSync(dir, { recursive: true });

  const java = `import dev.robocode.tankroyale.botapi.*;
import dev.robocode.tankroyale.botapi.events.*;

public class ${name} extends Bot {
    public static void main(String[] args) {
        new ${name}().start();
    }

    @Override
    public void run() {
        while (isRunning()) {
            turnRadarRight(360);
            forward(30 + (${i} % 7) * 5);
            turnLeft(10 + (${i} % 5));
        }
    }

    @Override
    public void onScannedBot(ScannedBotEvent e) {
        fire(1.0);
    }

    @Override
    public void onHitWall(HitWallEvent e) {
        back(50);
        turnRight(90);
    }
}
`;

  const json = JSON.stringify(
    {
      name,
      version: "1.0",
      authors: ["robocode-arena-scale"],
      description: `Generated scale stub ${name}`,
      homepage: "",
      countryCodes: ["br"],
      platform: "JVM",
      programmingLang: "Java",
    },
    null,
    2,
  );

  // layout: data/generated/stubs/Stub0001 -> ../lib = data/generated/stubs/lib
  const jar = "../lib/robocode-tankroyale-bot-api-1.0.2.jar";
  const sh = `#!/bin/sh
set -e
cd -- "\$(dirname -- "\$0")"
exec java -cp "${jar}:." ${name}.java
`;

  writeFileSync(join(dir, `${name}.java`), java);
  writeFileSync(join(dir, `${name}.json`), json);
  writeFileSync(join(dir, `${name}.sh`), sh);
  chmodSync(join(dir, `${name}.sh`), 0o755);
  paths.push(dir);
}

writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ count, paths, outDir }, null, 2));
console.log(JSON.stringify({ ok: true, count, outDir, sample: paths.slice(0, 3) }, null, 2));
