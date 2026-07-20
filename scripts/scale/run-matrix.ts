#!/usr/bin/env bun
/**
 * Run scale matrix against the engine sidecar.
 * Usage: bun scripts/scale/run-matrix.ts [--engine http://127.0.0.1:7601] [--sizes 3,10,40]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "../..");
const resultsDir = join(root, "data/scale-results");
const docsPath = join(root, "docs/SCALE.md");
mkdirSync(resultsDir, { recursive: true });

const args = process.argv.slice(2);
function flag(name: string, fallback: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const engineUrl = flag("--engine", process.env.ENGINE_URL || "http://127.0.0.1:7601");
const sizes = flag("--sizes", "3,10,40,100,200,500")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 2);

type RunResult = {
  n: number;
  rounds: number;
  status: "pass" | "fail" | "timeout" | "oom";
  bootMs: number | null;
  wallMs: number | null;
  battleId: string | null;
  error: string | null;
  criteria: string;
};

function roundsFor(n: number) {
  return n <= 10 ? 3 : 1;
}

function timeoutFor(n: number) {
  if (n <= 10) return 5 * 60_000;
  if (n <= 40) return 10 * 60_000;
  if (n <= 100) return 15 * 60_000;
  if (n <= 200) return 25 * 60_000;
  return 45 * 60_000; // 500 bots can take a long time to boot+fight
}

function passCriteria(n: number, bootMs: number | null, status: string) {
  if (status !== "ENDED") return false;
  // bootMs may be 0 if callback raced — treat null as unknown but still pass for 100+
  if (n <= 3) return bootMs == null || bootMs < 30_000;
  if (n <= 10) return bootMs == null || bootMs < 60_000;
  if (n <= 40) return bootMs == null || bootMs < 120_000;
  return true;
}

async function waitHealthy(ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${engineUrl}/health`);
      if (r.ok) return;
    } catch {}
    await Bun.sleep(500);
  }
  throw new Error(`Engine not healthy at ${engineUrl}`);
}

async function runOne(n: number): Promise<RunResult> {
  const rounds = roundsFor(n);
  const criteria =
    n <= 3
      ? "boot<30s + complete"
      : n <= 10
        ? "boot<60s + complete"
        : n <= 40
          ? "boot<120s + complete"
          : "complete";

  const genDir = join(root, "data/generated/stubs");
  console.log(`\n=== SCALE n=${n} rounds=${rounds} ===`);
  await $`bun ${join(root, "scripts/scale/generate-stubs.ts")} ${n} ${genDir}`.quiet();

  const manifest = JSON.parse(readFileSync(join(genDir, "manifest.json"), "utf8")) as {
    paths: string[];
  };

  const wallStart = Date.now();
  let battleId: string | null = null;
  try {
    const startRes = await fetch(`${engineUrl}/battles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botPaths: manifest.paths, rounds }),
    });
    if (!startRes.ok) {
      const text = await startRes.text();
      return {
        n,
        rounds,
        status: "fail",
        bootMs: null,
        wallMs: Date.now() - wallStart,
        battleId: null,
        error: `start failed: ${startRes.status} ${text}`,
        criteria,
      };
    }
    const body = (await startRes.json()) as { id: string };
    battleId = body.id;

    const deadline = Date.now() + timeoutFor(n);
    while (Date.now() < deadline) {
      const snap = await fetch(`${engineUrl}/battles/${battleId}`).then((r) => r.json()) as {
        status: string;
        error?: string;
        metrics?: { bootMs?: number; wallMs?: number };
        bootElapsedMs?: number;
      };

      if (snap.status === "ENDED") {
        const bootMs = snap.metrics?.bootMs ?? snap.bootElapsedMs ?? null;
        const wallMs = snap.metrics?.wallMs ?? Date.now() - wallStart;
        const ok = passCriteria(n, bootMs, snap.status);
        return {
          n,
          rounds,
          status: ok ? "pass" : "fail",
          bootMs,
          wallMs,
          battleId,
          error: ok ? null : "completed but failed criteria",
          criteria,
        };
      }
      if (snap.status === "FAILED" || snap.status === "STOPPED") {
        const err = (snap.error || snap.status).toLowerCase();
        const status = err.includes("memory") || err.includes("oom") ? "oom" : "fail";
        return {
          n,
          rounds,
          status,
          bootMs: snap.bootElapsedMs ?? null,
          wallMs: Date.now() - wallStart,
          battleId,
          error: snap.error || snap.status,
          criteria,
        };
      }
      await Bun.sleep(1000);
    }
    return {
      n,
      rounds,
      status: "timeout",
      bootMs: null,
      wallMs: Date.now() - wallStart,
      battleId,
      error: `timeout after ${timeoutFor(n)}ms`,
      criteria,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.toLowerCase().includes("memory") ? "oom" : "fail";
    return {
      n,
      rounds,
      status,
      bootMs: null,
      wallMs: Date.now() - wallStart,
      battleId,
      error: msg,
      criteria,
    };
  }
}

function writeMarkdown(results: RunResult[]) {
  const cliff = [...results].reverse().find((r) => r.status === "pass");
  const lines = [
    "# Scale matrix — Robocode Arena",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Engine: ${engineUrl}`,
    "",
    cliff
      ? `**Largest PASS:** ${cliff.n} bots`
      : "**Largest PASS:** none",
    "",
    "| N | Rounds | Status | Boot ms | Wall ms | Criteria | Error |",
    "|---|--------|--------|---------|---------|----------|-------|",
    ...results.map(
      (r) =>
        `| ${r.n} | ${r.rounds} | ${r.status} | ${r.bootMs ?? "—"} | ${r.wallMs ?? "—"} | ${r.criteria} | ${r.error ?? ""} |`,
    ),
    "",
    "## Notes",
    "",
    "- Stubs are JVM (lighter than Node) generated under `data/generated/stubs`.",
    "- 100+ may fail due to process limits / RAM — that's the point of the matrix.",
    "",
  ];
  writeFileSync(docsPath, lines.join("\n"));
}

async function main() {
  await waitHealthy();
  const merge = args.includes("--merge");
  const results: RunResult[] = [];

  if (merge && existsSync(resultsDir)) {
    for (const n of [3, 10, 40, 100, 200, 500]) {
      const p = join(resultsDir, `n-${n}.json`);
      if (existsSync(p) && !sizes.includes(n)) {
        results.push(JSON.parse(readFileSync(p, "utf8")));
      }
    }
  }

  for (const n of sizes) {
    const r = await runOne(n);
    results.push(r);
    writeFileSync(join(resultsDir, `n-${n}.json`), JSON.stringify(r, null, 2));
    console.log(r);
  }
  results.sort((a, b) => a.n - b.n);
  writeFileSync(join(resultsDir, "matrix.json"), JSON.stringify(results, null, 2));
  writeMarkdown(results);
  console.log(`\nWrote ${docsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
