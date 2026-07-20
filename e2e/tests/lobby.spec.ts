import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zips = path.resolve(__dirname, "../../bots/fixture/zips");

test("lobby happy path — 3 players ready → play → results", async ({ browser }) => {
  const owner = await browser.newPage();
  await owner.goto("/");
  await owner.getByRole("button", { name: "Criar lobby" }).click();
  await expect(owner.getByText(/Sala /)).toBeVisible();

  const url = owner.url();
  const code = url.split("/r/")[1];
  expect(code).toBeTruthy();

  const players = [
    { nick: "Alice", color: "#E4572E", zip: "AlphaBot.zip" },
    { nick: "Bob", color: "#17BEBB", zip: "BravoBot.zip" },
    { nick: "Carol", color: "#FFC914", zip: "CharlieBot.zip" },
  ];

  const pages = [];
  for (const p of players) {
    const page = await browser.newPage();
    await page.goto(`/r/${code}`);
    await page.getByPlaceholder("Nick").fill(p.nick);
    await page.locator("#color").fill(p.color);
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.getByText("Seu tank")).toBeVisible();
    await page.locator("#zip").setInputFiles(path.join(zips, p.zip));
    await page.getByRole("button", { name: "Upload zip" }).click();
    await expect(page.getByText(/Bot:/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Ready" }).click();
    await expect(page.getByRole("button", { name: "Unready" })).toBeVisible();
    pages.push(page);
  }

  await expect(owner.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });
  await owner.getByRole("button", { name: "Play" }).click();

  await expect(owner.locator("#arenaWrap")).toBeVisible({ timeout: 60_000 });
  // wait for ended status or results list
  await expect(owner.locator("#resultsPanel, .results, strong")).toContainText(/ended|Resultados|#1/i, {
    timeout: 240_000,
  }).catch(async () => {
    await expect(owner.getByText(/ended|Resultados/i)).toBeVisible({ timeout: 1_000 });
  });
  // more reliable: poll room status via API-ish UI text
  await expect
    .poll(async () => owner.locator("body").innerText(), { timeout: 240_000 })
    .toMatch(/ended|Resultados|#\d/i);

  for (const p of pages) await p.close();
  await owner.close();
});

test("scale report page renders", async ({ page }) => {
  await page.goto("/scale");
  await expect(page.getByRole("heading", { name: "Scale report" })).toBeVisible();
});
