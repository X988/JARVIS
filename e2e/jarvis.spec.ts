import { expect, test } from "@playwright/test";

test("read-only command comes from the backend pipeline", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-jarvis-test-actor": "admin1" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "JARVIS" })).toBeVisible();
  await expect(page.getByText("DRY RUN", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Проверь сервер", exact: true }).click();
  await expect(page.getByText("Code: OK")).toBeVisible();
  await expect(page.getByText("Runbook: server.health")).toBeVisible();
  await expect(page.getByText("Mode: dry-run")).toBeVisible();
});

test("unknown server actor is denied", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-jarvis-test-actor": "stranger" });
  await page.goto("/");
  await page.getByRole("button", { name: "Проверь сервер", exact: true }).click();
  await expect(page.getByText("Code: ACTOR_DENIED")).toBeVisible();
});

test("DENY_ALWAYS is rendered from the server", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-jarvis-test-actor": "admin1" });
  await page.goto("/");
  await page.getByRole("button", { name: "Удали базу", exact: true }).click();
  await expect(page.getByText("Code: POLICY_DENIED")).toBeVisible();
  await expect(page.getByText("Policy: DENY_ALWAYS")).toBeVisible();
});
