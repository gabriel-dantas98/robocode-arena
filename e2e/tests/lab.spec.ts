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
  await expect
    .poll(async () => page.locator("#hudStatus").innerText(), {
      timeout: 240_000,
    })
    .toMatch(/ENDED|ended|FAILED|failed/i);

  const status = (await page.locator("#hudStatus").innerText()).toUpperCase();
  expect(status).toContain("ENDED");
  await expect(page.locator("#labResults")).toBeVisible();
  await page.waitForTimeout(1500);
  await ctx.close();
});
