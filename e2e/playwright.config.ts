import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  retries: 0,
  use: {
    baseURL: process.env.LOBBY_URL || "http://127.0.0.1:7610",
    trace: "on",
    video: "on",
    screenshot: "on",
  },
  outputDir: "./artifacts",
  reporter: [["list"], ["html", { open: "never", outputFolder: "artifacts/report" }]],
});
