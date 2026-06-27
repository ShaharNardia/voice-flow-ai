import { test, expect } from '@playwright/test';
import {
  ADMIN_TAB_LABELS,
  CUSTOMER_ROUTE_SPECS,
  expectCustomerRouteLoaded,
} from '../utils/e2e-helpers';

/**
 * Admin persona: storageState from setup-admin (single login).
 * Same customer routes as user, plus /admin and all admin console tabs.
 */

test.beforeEach(({}, testInfo) => {
  if (!process.env.BASE_URL) {
    testInfo.skip(true, 'BASE_URL is not set');
  }
});

for (const route of CUSTOMER_ROUTE_SPECS) {
  test(`admin loads ${route.path}`, async ({ page }) => {
    await expectCustomerRouteLoaded(page, route);
  });
}

test('admin loads /admin console', async ({ page }) => {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page).toHaveURL(/\/admin/, { timeout: 20000 });
  await expect(page.getByText('Admin').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Users', exact: true })).toBeVisible({
    timeout: 15000,
  });
});

test.describe.serial('admin — all settings tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  for (const label of ADMIN_TAB_LABELS) {
    test(`tab opens: ${label}`, async ({ page }) => {
      const tab = page.getByRole('button', { name: label, exact: true });
      await tab.click();
      await expect(tab).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
    });
  }
});
