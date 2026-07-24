#!/usr/bin/env bun
/**
 * Record Lab IDE: load Tracker playstyle → Deploy vs Easy → ended.
 * Usage: LOBBY_URL=https://… bun scripts/record-lab.ts
 */
import { chromium } from "../e2e/node_modules/playwright/index.mjs";
import { mkdirSync, renameSync, existsSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const LOBBY = (process.env.LOBBY_URL || "http://127.0.0.1:7610").replace(
  /\/$/,
  "",
);
const outDir = join(ROOT, "recordings");
const tmpVideo = join(outDir, "_tmp-lab");
mkdirSync(tmpVideo, { recursive: true });

console.log("lab record against", LOBBY);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  recordVideo: { dir: tmpVideo, size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
});
const page = await ctx.newPage();
await page.goto(`${LOBBY}/lab`, { waitUntil: "networkidle" });
await page.waitForSelector("#example", { timeout: 60_000 });
await page.waitForFunction(() => {
  const sel = document.querySelector("#example") as HTMLSelectElement | null;
  return !!sel && sel.options.length >= 3;
});
await page.selectOption("#example", "tracker");
await page.selectOption("#difficulty", "easy");
await page.waitForTimeout(1000);
await page.click("#btnDeploy");

const deadline = Date.now() + 240_000;
while (Date.now() < deadline) {
  const st = (await page.locator("#hudStatus").innerText()).toUpperCase();
  const hud = await page.locator("#hudText").innerText();
  console.log("status", st, "hud", hud);
  if (st.includes("ENDED") || st.includes("FAILED")) break;
  await page.waitForTimeout(2000);
}
const final = (await page.locator("#hudStatus").innerText()).toUpperCase();
if (!final.includes("ENDED")) {
  throw new Error(`lab battle did not end: ${final}`);
}
await page.waitForTimeout(2000);
const video = page.video();
await ctx.close();
await browser.close();

const src = video ? await video.path() : null;
if (!src || !existsSync(src)) throw new Error("no video file produced");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = join(outDir, `lab-tracker-${stamp}.webm`);
renameSync(src, dest);
console.log("saved", dest);
