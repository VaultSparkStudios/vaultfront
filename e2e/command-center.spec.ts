import { expect, test } from "@playwright/test";

test("Command Center loads on demand with synchronized mobile accessibility", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("play-page", { timeout: 10_000 });
  expect(
    await page.evaluate(() => Boolean(customElements.get("command-center"))),
  ).toBe(false);

  if (testInfo.project.name === "mobile-chrome") {
    const sidebar = page.locator("#sidebar-menu");
    const backdrop = page.locator("#mobile-menu-backdrop");
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(backdrop).toHaveAttribute("aria-hidden", "true");
    await page.locator("#hamburger-btn").click();
    await expect(sidebar).toHaveAttribute("aria-hidden", "false");
    await expect(sidebar).toHaveAttribute("aria-modal", "true");
    await expect(backdrop).toHaveAttribute("aria-hidden", "false");
    await page
      .locator('mobile-nav-bar [data-page="page-command-center"]')
      .click();
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(sidebar).not.toHaveAttribute("aria-modal", "true");
  } else {
    await page
      .locator('desktop-nav-bar [data-page="page-command-center"]')
      .click();
  }

  await expect(page.locator("#page-command-center")).toBeVisible();
  await expect(page.locator("command-center")).toContainText("Command Center");
  expect(
    await page.evaluate(() => Boolean(customElements.get("command-center"))),
  ).toBe(true);
});
