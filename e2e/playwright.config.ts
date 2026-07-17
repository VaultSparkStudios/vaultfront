import { defineConfig, devices } from "@playwright/test";

export function normalizeE2EBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

const configuredBaseUrl = normalizeE2EBaseUrl(process.env.E2E_BASE_URL);
const baseURL = configuredBaseUrl ?? "http://localhost:9000";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  // The game client is intentionally heavyweight; cap local concurrency so browser
  // readiness assertions measure product behavior instead of CPU starvation.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: configuredBaseUrl
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
