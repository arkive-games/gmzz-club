import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "web/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    actionTimeout: 10000,
    reducedMotion: "reduce",
    baseURL: process.env.APP_URL ?? "http://127.0.0.1:19080",
    headless: true,
    viewport: { width: 1600, height: 1100 },
    screenshot: "only-on-failure",
  },
  reporter: "list",
  outputDir: "test-results",
});
