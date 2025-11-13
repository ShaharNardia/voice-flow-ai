import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';

test.describe('Jobs smoke', () => {
  test('bookings page accessible @smoke', async ({ page }) => {
    await loginWithEmail(page);
    await page.goto('/apppointments');
    await expect(page.getByRole('heading', { name: /Bookings/i })).toBeVisible();
    await expect(page.getByText(/Active Bookings/i)).toBeVisible();
  });
});

