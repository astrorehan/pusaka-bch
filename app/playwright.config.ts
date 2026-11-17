import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: process.env.PUSAKA_TEST_URL || "http://localhost:4181",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
  ...(!process.env.PUSAKA_TEST_URL
    ? {
        webServer: {
          command:
            "npm run preview -- --host localhost --port 4181 --strictPort",
          url: "http://localhost:4181",
          reuseExistingServer: true,
        },
      }
    : {}),
  reporter: [["list"]],
});
