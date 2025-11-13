import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';

test.describe('Billing smoke', () => {
  test('invoices visible @smoke', async ({ page }) => {
    await loginWithEmail(page);
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: /Billing/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Billing History/i })).toBeVisible();
  });
});

