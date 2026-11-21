import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3039";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3039",
    url: `${baseURL}/login`,
    env: { SERENDIPITY_DIST_DIR: ".next-auth-test" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
