import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zips = path.resolve(__dirname, "../../bots/fixture/zips");

test("lobby happy path — 3 players ready → play → results", async ({
  browser,
}, testInfo) => {
  // Explicit recordVideo — browser.newContext() does not inherit config `use.video`.
  const ctx = await browser.newContext({
    recordVideo: {
      dir: testInfo.outputDir,
      size: { width: 1280, height: 720 },
    },
  });
  const owner = await ctx.newPage();
  await owner.goto("/");
  await owner.getByRole("button", { name: "Criar lobby" }).click();
  await expect(owner).toHaveURL(/\/r\/[A-Z0-9]+/, { timeout: 30_000 });
  await expect(owner.locator("h1, .brand, .room-title").first()).toBeVisible();

  const url = owner.url();
  const code = url.split("/r/")[1]?.split("?")[0];
  expect(code).toMatch(/^[A-Z0-9]+$/);

  const players = [
    { nick: "Alice", color: "#E4572E", zip: "AlphaBot.zip" },
    { nick: "Bob", color: "#17BEBB", zip: "BravoBot.zip" },
    { nick: "Carol", color: "#FFC914", zip: "CharlieBot.zip" },
  ];

  const pages = [];
  for (const p of players) {
    const page = await ctx.newPage();
    await page.goto(`/r/${code}`);
    await page.getByPlaceholder("Seu nick").fill(p.nick);
    await page.locator("#color").fill(p.color);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Seu tank")).toBeVisible();
    await page.locator("#zip").setInputFiles(path.join(zips, p.zip));
    await page.getByRole("button", { name: "Enviar zip" }).click();
    await expect
      .poll(async () => page.locator("body").innerText(), { timeout: 60_000 })
      .toMatch(/Bot:\s*\w+|AlphaBot|BravoBot|CharlieBot/i);
    await page.getByRole("button", { name: "Pronto" }).click();
    await expect(page.getByRole("button", { name: "Cancelar pronto" })).toBeVisible();
    pages.push(page);
  }

  for (const p of pages) await p.close();

  await expect(owner.getByRole("button", { name: "Jogar" })).toBeEnabled({
    timeout: 30_000,
  });
  await owner.getByRole("button", { name: "Jogar" }).click();
  await owner.bringToFront();

  await expect(owner.locator("#arenaWrap")).toBeVisible({ timeout: 60_000 });
  // hold a bit of arena time in the recording before status flips
  await expect
    .poll(async () => owner.locator("body").innerText(), { timeout: 240_000 })
    .toMatch(/Status:\s*(ended|failed)|Resultados|#\d/i);
  await expect(owner.locator("body")).not.toContainText(/Status:\s*failed/i);
  await owner.waitForTimeout(1500);

  await ctx.close();
});

test("scale report page renders", async ({ page }) => {
  await page.goto("/scale");
  await expect(
    page.getByRole("heading", { name: "Relatório de escala" }),
  ).toBeVisible();
});
