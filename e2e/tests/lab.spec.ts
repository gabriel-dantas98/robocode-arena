import { test, expect } from "@playwright/test";

test("lab playstyle deploy — Tracker vs Easy ends", async ({ browser }, testInfo) => {
  const ctx = await browser.newContext({
    recordVideo: {
      dir: testInfo.outputDir,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await ctx.newPage();
  await page.goto("/lab");
  await expect(page.getByText(/Lab/i).first()).toBeVisible();
  await expect(page.locator("#example")).toBeVisible({ timeout: 30_000 });

  // wait Monaco + examples catalog
  await page.waitForFunction(() => {
    const sel = document.querySelector("#example") as HTMLSelectElement | null;
    return !!sel && sel.options.length >= 3;
  });

  await page.locator("#example").selectOption("tracker");
  await page.locator("#difficulty").selectOption("easy");
  await page.waitForTimeout(800);

  await page.locator("#btnDeploy").click();

  // Accept ENDED on either status chip or results panel (battle may finish mid-poll).
  await expect
    .poll(
      async () => {
        const st = (await page.locator("#hudStatus").innerText()).toUpperCase();
        const hud = (await page.locator("#hudText").innerText()).toUpperCase();
        const results = await page.locator("#labResultsPanel").isVisible();
        const winner = await page.locator("#labWinner").isVisible();
        return `${st}|${hud}|${results ? "RESULTS" : ""}|${winner ? "WINNER" : ""}`;
      },
      { timeout: 240_000 },
    )
    .toMatch(/ENDED|RESULTS|WINNER/i);

  await expect(page.locator("#labResultsPanel")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#labResults li").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await ctx.close();
});
