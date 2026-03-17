import { test, expect } from "@playwright/test";

const superUser = process.env.E2E_SUPERADMIN_USERNAME || "superadmin";
const superPass = process.env.E2E_SUPERADMIN_PASSWORD || "change-me";

test.describe("Super Admin", () => {
  test("login and core sections", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      window.history.pushState({}, "", "/trustadmin");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await page.getByTestId("superadmin-username").fill(superUser);
    await page.getByTestId("superadmin-password").fill(superPass);
    await page.getByTestId("superadmin-submit").click();

    await expect(page).toHaveURL(/\/super-admin$/);
    await expect(page.getByTestId("superadmin-section-tenants")).toBeVisible();

    await page.getByTestId("superadmin-nav-licenses").click();
    await expect(page.getByTestId("superadmin-section-licenses")).toBeVisible();

    await page.getByTestId("superadmin-nav-settings").click();
    await expect(page.getByTestId("superadmin-section-settings")).toBeVisible();
  });
});
