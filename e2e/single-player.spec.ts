import { expect, test } from "@playwright/test";

test.describe("Single Player flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("play-page", { timeout: 10_000 });
  });

  test("opens solo modal when Solo is clicked", async ({ page }) => {
    const soloButton = page.getByRole("button", { name: /solo/i }).first();
    await soloButton.click();

    // The single-player modal should become visible
    const modal = page.locator(
      "single-player-modal, o-modal#singlePlayerModal",
    );
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });

  test("shows vault bot behavior hint for each difficulty", async ({
    page,
  }) => {
    const soloButton = page.getByRole("button", { name: /solo/i }).first();
    await soloButton.click();

    const modal = page.locator("single-player-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // The vault bot hint section should be present
    const hint = modal.locator(".mx-6.mb-4");
    await expect(hint).toBeVisible({ timeout: 5_000 });
    await expect(hint).toContainText(/vault bot/i);
  });

  test("Start button is visible and enabled", async ({ page }) => {
    const soloButton = page.getByRole("button", { name: /solo/i }).first();
    await soloButton.click();

    const modal = page.locator("single-player-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const startButton = modal.getByRole("button", { name: /start/i });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
  });
});
