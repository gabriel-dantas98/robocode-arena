#!/usr/bin/env bun
/**
 * Record a full 3-bot match to recordings/match-<ts>.webm
 * Requires lobby :7610 + engine :7601 already up.
 *
 * Usage: bun scripts/record-match.ts
 */
import { chromium } from "../e2e/node_modules/playwright/index.mjs";
import { mkdirSync, renameSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const LOBBY = process.env.LOBBY_URL || "http://127.0.0.1:7610";
const zips = join(ROOT, "bots/fixture/zips");
const outDir = join(ROOT, "recordings");
const tmpVideo = join(outDir, "_tmp");
mkdirSync(tmpVideo, { recursive: true });

const players = [
  { nick: "Alice", color: "#E4572E", zip: "AlphaBot.zip", chassis: "segfault" },
  {
    nick: "Bob",
    color: "#17BEBB",
    zip: "BravoBot.zip",
    chassis: "stackoverflow",
  },
  {
    nick: "Carol",
    color: "#FFC914",
    zip: "CharlieBot.zip",
    chassis: "techdebt",
  },
];

async function json(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

console.log("setup via API…");
const created = await json(
  await fetch(`${LOBBY}/api/rooms`, { method: "POST" }),
);
const code = created.room.code as string;
const ownerToken = created.ownerToken as string;
console.log("room", code);

for (const p of players) {
  const joined = await json(
    await fetch(`${LOBBY}/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nick: p.nick,
        color: p.color,
        chassis: p.chassis,
      }),
    }),
  );
  const playerId = joined.player.id as string;
  const buf = await Bun.file(join(zips, p.zip)).arrayBuffer();
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/zip" }), p.zip);
  const up = await fetch(
    `${LOBBY}/api/rooms/${code}/players/${playerId}/upload`,
    {
      method: "POST",
      body: form,
    },
  );
  await json(up);
  await json(
    await fetch(`${LOBBY}/api/rooms/${code}/players/${playerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ready: true }),
    }),
  );
  console.log("ready", p.nick);
}

console.log("launching recorder…");
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  recordVideo: { dir: tmpVideo, size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
});
const page = await ctx.newPage();
await page.addInitScript((token) => {
  localStorage.setItem("arena.ownerToken", token);
}, ownerToken);
await page.goto(`${LOBBY}/r/${code}`, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await page.waitForSelector("#play:not([disabled])", { timeout: 30_000 });

console.log("Play…");
await page.click("#play");
await page.waitForSelector("#arenaWrap", { state: "visible", timeout: 60_000 });

const deadline = Date.now() + 240_000;
while (Date.now() < deadline) {
  const text = await page.locator("body").innerText();
  if (/Status:\s*ended/i.test(text) || /Resultados/i.test(text)) break;
  if (/Status:\s*failed/i.test(text))
    throw new Error("battle failed:\n" + text.slice(0, 500));
  await page.waitForTimeout(500);
}
await page.waitForTimeout(2000);

const video = page.video();
await ctx.close();
await browser.close();

const src = video ? await video.path() : null;
if (!src || !existsSync(src)) throw new Error("no video file produced");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = join(outDir, `match-${stamp}.webm`);
renameSync(src, dest);
// cleanup leftover empties
for (const f of readdirSync(tmpVideo)) {
  try {
    Bun.spawnSync(["rm", "-f", join(tmpVideo, f)]);
  } catch {}
}
console.log("SAVED", dest);
