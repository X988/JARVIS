import { expect, test } from "@playwright/test";

test("read-only command comes from the server", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "JARVIS" })).toBeVisible();
  await expect(page.getByText("DRY RUN", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Проверь сервер" }).click();
  await expect(page.getByText("Runbook: server.health")).toBeVisible();
  await expect(page.getByText("Mode: dry-run")).toBeVisible();
});

test("a stranger is denied", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "чужой ID" }).click();
  await page.getByRole("button", { name: "Проверь сервер" }).click();
  await expect(page.getByText("ACTOR_DENIED")).toBeVisible();
});

test("drop database is always denied", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Удали базу" }).click();
  await expect(page.getByText("DENY_ALWAYS")).toBeVisible();
});
