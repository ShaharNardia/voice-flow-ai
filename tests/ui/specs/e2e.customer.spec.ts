import { test, expect } from '@playwright/test';
import {
  CUSTOMER_ROUTE_SPECS,
  expectCustomerRouteLoaded,
} from '../utils/e2e-helpers';

/**
 * Customer persona: storageState from setup-user (single login).
 * Asserts dashboard routes; /admin must redirect away for non-admin.
 */

test.beforeEach(({}, testInfo) => {
  if (!process.env.BASE_URL) {
    testInfo.skip(true, 'BASE_URL is not set');
  }
});

for (const route of CUSTOMER_ROUTE_SPECS) {
  test(`customer loads ${route.path}`, async ({ page }) => {
    await expectCustomerRouteLoaded(page, route);
  });
}

test('customer: /admin redirects to dashboard', async ({ page }) => {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 25000 });
});
