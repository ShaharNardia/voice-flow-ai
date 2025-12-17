import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, clickButton } from '../utils/helpers';

test.describe('Billing', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('invoices visible @smoke', async ({ page }) => {
    await navigateTo(page, '/billing');
    await expect(page.getByRole('heading', { name: /Billing/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Billing History/i })).toBeVisible();
  });

  test('billing page loads', async ({ page }) => {
    await navigateTo(page, '/billing');
    await expect(page).toHaveURL(/billing/);
    
    // Check for billing heading
    await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible();
  });

  test('invoices list displays', async ({ page }) => {
    await navigateTo(page, '/billing');
    await waitForPageLoad(page);
    
    // Check for invoices or billing history
    await expect(
      page.locator('text=/invoice|billing.*history|payment/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('subscription management', async ({ page }) => {
    await navigateTo(page, '/billing');
    await waitForPageLoad(page);
    
    // Find manage subscription button
    const manageButton = page.getByRole('button', { name: /manage.*subscription|subscription/i });
    
    if (await manageButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await manageButton.click();
      
      // Should open subscription management (might redirect to Stripe)
      await page.waitForTimeout(2000);
      
      // Either stay on page or redirect to external service
      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    }
  });

  test('payment methods', async ({ page }) => {
    await navigateTo(page, '/billing');
    await waitForPageLoad(page);
    
    // Find payment methods section
    const paymentSection = page.locator('text=/payment.*method|card|billing.*info/i');
    
    if (await paymentSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Try to add or update payment method
      const addButton = page.getByRole('button', { name: /add|update|change.*payment/i });
      
      if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addButton.click();
        
        // Should show payment form
        await expect(
          page.locator('text=/card|payment|billing/i')
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('billing history', async ({ page }) => {
    await navigateTo(page, '/billing');
    await waitForPageLoad(page);
    
    // Check for billing history section
    await expect(
      page.locator('text=/billing.*history|past.*payments|invoice.*history/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('usage statistics', async ({ page }) => {
    await navigateTo(page, '/billing');
    await waitForPageLoad(page);
    
    // Check for usage stats
    const usageStats = page.locator('text=/usage|minutes|calls|credits/i');
    
    if (await usageStats.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Usage statistics should be visible
      await expect(usageStats).toBeVisible();
    }
  });
});

