import { expect, test } from "@playwright/test";

test("read-only command comes from the backend pipeline", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-jarvis-test-actor": "admin1" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "JARVIS" })).toBeVisible();
  await expect(page.getByText("DRY RUN", { exact: true })).toBeVisible();
  const gatewayResponse = page.waitForResponse((response) => response.url().endsWith("/api/agent") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Проверь сервер", exact: true }).click();
  const response = await gatewayResponse;
  expect(response.request().postDataJSON()).not.toHaveProperty("operatorId");
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



test("the server audit uses the session role and denies a viewer", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-jarvis-test-actor": "viewer1" });
  await page.goto("/admin/audit");
  await expect(page.getByText("Нужна действительная сессия администратора.")).toBeVisible();
  await page.setExtraHTTPHeaders({ "x-jarvis-test-actor": "root" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Журнал инструментов" })).toBeVisible();
  await expect(page.getByText("Нужна действительная сессия администратора.")).toHaveCount(0);
  await expect(page.getByText("Читаю журнал…")).toHaveCount(0);
  await expect(page.getByText("Журнал сейчас не прочитался.")).toHaveCount(0);
});
