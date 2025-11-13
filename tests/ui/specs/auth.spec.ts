import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';

test.describe('Authentication smoke', () => {
  test('email login @smoke', async ({ page }) => {
    await loginWithEmail(page);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole('heading', { name: /Bookings/i })).toBeVisible();
  });
});

