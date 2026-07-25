/**
 * Visual smoke: open /lab, deploy, assert canvas has non-background pixels + tanks in HUD.
 */
import { chromium } from "playwright";

const BASE = process.env.LOBBY_URL || "http://127.0.0.1:7610";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", (msg) => console.log("console:", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("pageerror:", err.message));

await page.goto(`${BASE}/lab`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector("#pace", { timeout: 60_000 });
await page.waitForSelector("#btnDeploy", { timeout: 30_000 });
// Monaco can be slow; don't block deploy on it fully
await page.waitForTimeout(2000);

await page.selectOption("#pace", "normal");
await page.selectOption("#difficulty", "easy");

await page.click("#btnDeploy");
console.log("clicked deploy");

await page.waitForFunction(
  () => {
    const hud = document.getElementById("hudText")?.textContent || "";
    return /R\d+\s*·\s*T\d+|bots/i.test(hud);
  },
  { timeout: 120_000 },
);

await page.waitForTimeout(2000);

const shot = `recordings/lab-visual-smoke-${Date.now()}.png`;
await page.screenshot({ path: shot, fullPage: true });
console.log("screenshot", shot);

const metrics = await page.evaluate(() => {
  const canvas = document.getElementById("arena") as HTMLCanvasElement | null;
  if (!canvas) return { error: "no canvas" };
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "no ctx" };
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let nonDark = 0;
  let samples = 0;
  for (let y = 0; y < h; y += 8) {
    for (let x = 0; x < w; x += 8) {
      const i = (y * w + x) * 4;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      samples++;
      // background is near #070b10 / #0c1218 — count brighter pixels (tanks/hud bars)
      if (r + g + b > 80) nonDark++;
    }
  }
  return {
    w,
    h,
    samples,
    nonDark,
    hud: document.getElementById("hudText")?.textContent,
    status: document.getElementById("hudStatus")?.textContent,
    liveBoard: document.getElementById("labLiveBoard")?.innerText,
    intro: !!document.querySelector(".battle-intro"),
  };
});

console.log(JSON.stringify(metrics, null, 2));
await browser.close();

if (metrics.error) {
  console.error("FAIL", metrics.error);
  process.exit(1);
}
if ((metrics.nonDark || 0) < 30) {
  console.error("FAIL canvas looks empty (nonDark=", metrics.nonDark, ")");
  process.exit(1);
}
console.log("OK tanks likely visible");
