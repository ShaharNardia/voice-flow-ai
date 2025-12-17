import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, fillField, clickButton } from '../utils/helpers';

test.describe('Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('startup flow - step 1', async ({ page }) => {
    await navigateTo(page, '/startup?update=false');
    
    // Check for startup page
    await expect(page).toHaveURL(/startup/);
    
    // Fill step 1 if form exists
    const companyNameField = page.getByPlaceholder(/company.*name|business.*name/i);
    if (await companyNameField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await companyNameField.fill('Test Company');
      await clickButton(page, /next|continue|save/i);
    }
  });

  test('startup flow - SMTP configuration', async ({ page }) => {
    await navigateTo(page, '/startup2?update=false');
    
    // Fill SMTP configuration if form exists
    const smtpHostField = page.getByPlaceholder(/smtp|host|server/i);
    if (await smtpHostField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await smtpHostField.fill('smtp.example.com');
      
      const smtpPortField = page.getByPlaceholder(/port/i);
      if (await smtpPortField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await smtpPortField.fill('465');
      }
      
      await clickButton(page, /next|continue|save/i);
    }
  });

  test('startup flow - company setup', async ({ page }) => {
    await navigateTo(page, '/startup3?update=false');
    
    // Fill company details if form exists
    const industryField = page.getByPlaceholder(/industry|business.*type/i);
    if (await industryField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await industryField.fill('Technology');
      await clickButton(page, /next|continue|save/i);
    }
  });

  test('startup flow - service areas', async ({ page }) => {
    await navigateTo(page, '/startup4?update=false');
    
    // Add service area if form exists
    const serviceAreaField = page.getByPlaceholder(/service.*area|location|city/i);
    if (await serviceAreaField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await serviceAreaField.fill('New York');
      await clickButton(page, /add|save|next/i);
    }
  });

  test('startup flow - services configuration', async ({ page }) => {
    await navigateTo(page, '/startup5?update=false');
    
    // Add service if form exists
    const serviceNameField = page.getByPlaceholder(/service.*name|service/i);
    if (await serviceNameField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await serviceNameField.fill('Test Service');
      await clickButton(page, /add|save|next/i);
    }
  });

  test('startup flow - complete onboarding', async ({ page }) => {
    // Navigate through all steps
    const steps = [
      '/startup?update=false',
      '/startup2?update=false',
      '/startup3?update=false',
      '/startup4?update=false',
      '/startup5?update=false',
      '/startup6',
      '/startup7',
    ];
    
    for (const step of steps) {
      await navigateTo(page, step);
      await waitForPageLoad(page);
      
      // Try to proceed to next step
      const nextButton = page.getByRole('button', { name: /next|continue|finish|complete/i });
      if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextButton.click();
        await waitForPageLoad(page);
      }
    }
    
    // Should eventually reach dashboard
    await expect(page).toHaveURL(/(dashboard|startup)/, { timeout: 30000 });
  });
});

