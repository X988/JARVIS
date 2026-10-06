import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:8080", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8080/health",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      EXECUTION_MODE: "dry-run",
      JARVIS_TEST_AUTH: "1",
      VITE_JARVIS_TEST_AUTH: "1",
    },
  },
});
