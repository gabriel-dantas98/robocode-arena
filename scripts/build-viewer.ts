#!/usr/bin/env bun
/**
 * Build Tank Royale Viewer into apps/lobby/viewer (served at /viewer/).
 * Source: vendor/tank-royale-viewer (clone if missing).
 */
import { $ } from "bun";
import { existsSync, mkdirSync, cpSync, rmSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const VENDOR = join(ROOT, "vendor/tank-royale-viewer");
const OUT = join(ROOT, "apps/lobby/viewer");

if (!existsSync(join(VENDOR, "package.json"))) {
  console.log("Cloning tank-royale-viewer…");
  mkdirSync(join(ROOT, "vendor"), { recursive: true });
  await $`git clone --depth 1 https://github.com/jandurovec/tank-royale-viewer.git ${VENDOR}`;
  // Re-apply arena bootstrap patch if clone is fresh (settings.ts in repo may lack it)
  console.warn(
    "Fresh clone — ensure vendor/.../src/settings.ts has applyArenaBootstrap (git may have our patch).",
  );
}

console.log("npm install…");
await $`npm install`.cwd(VENDOR);

console.log("vite build (base=/viewer/)…");
await $`npm run build`.cwd(VENDOR).env({
  ...process.env,
  VITE_BASE_URL: "/viewer/",
});

const dist = join(VENDOR, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("Build failed — no dist/index.html");
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(dist, OUT, { recursive: true });
console.log(`OK → ${OUT}`);
