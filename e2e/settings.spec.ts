import { expect, test } from "@playwright/test";

test.describe("Settings / Theme", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("play-page", { timeout: 10_000 });
  });

  test("default theme attribute is applied to <html>", async ({ page }) => {
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-vaultfront-theme"),
    );
    // Should be one of the three valid themes
    expect(["vaultfront", "light", "competitive"]).toContain(theme);
  });

  test("persists theme selection across reload", async ({ page }) => {
    // Set theme via localStorage directly (bypasses needing to open settings modal)
    await page.evaluate(() => {
      localStorage.setItem("vf-theme", "light");
    });
    await page.reload();
    await page.waitForSelector("play-page", { timeout: 10_000 });

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-vaultfront-theme"),
    );
    expect(theme).toBe("light");
  });

  test("dark theme class is applied on dark preference", async ({ page }) => {
    // Simulate dark color scheme preference
    await page.emulateMedia({ colorScheme: "dark" });
    // Clear saved theme to test default resolution
    await page.evaluate(() => localStorage.removeItem("vf-theme"));
    await page.reload();
    await page.waitForSelector("play-page", { timeout: 10_000 });

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-vaultfront-theme"),
    );
    // Dark preference → vaultfront (dark) theme
    expect(theme).toBe("vaultfront");
  });
});
