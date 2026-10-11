const os = require("node:os");
const path = require("node:path");
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  globalTimeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: path.join(os.tmpdir(), "scheduling-platform-playwright-results"),
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 }
  }
});
