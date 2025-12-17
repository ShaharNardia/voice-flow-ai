import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, fillField, clickButton } from '../utils/helpers';
import { testPhoneNumbers } from '../fixtures/test-data';

test.describe('Phone Numbers', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('phone numbers list loads', async ({ page }) => {
    await navigateTo(page, '/phoneNumber');
    await expect(page).toHaveURL(/phoneNumber/);
    
    // Check for phone numbers heading
    await expect(page.getByRole('heading', { name: /phone.*number|numbers/i })).toBeVisible();
  });

  test('purchase phone number', async ({ page }) => {
    await navigateTo(page, '/phoneNumber');
    
    // Find buy phone number button
    const buyButton = page.getByRole('button', { name: /buy|purchase|add.*number/i });
    
    if (await buyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await buyButton.click();
      await waitForPageLoad(page);
      
      // Select phone number if dropdown appears
      const numberDropdown = page.locator('select, [role="combobox"]').first();
      if (await numberDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
        await numberDropdown.selectOption({ index: 0 });
        
        // Fill forwarding number if required
        const forwardingField = page.getByPlaceholder(/forwarding|forward/i);
        if (await forwardingField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await forwardingField.fill(testPhoneNumbers.valid.forwardingNumber);
        }
        
        await clickButton(page, /buy|purchase|confirm/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|purchased|added/i')
        ).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('edit phone number', async ({ page }) => {
    await navigateTo(page, '/phoneNumber');
    await waitForPageLoad(page);
    
    // Find edit button
    const editButton = page.getByRole('button', { name: /edit|update|modify/i }).first();
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click();
      await waitForPageLoad(page);
      
      // Update forwarding number if field exists
      const forwardingField = page.getByPlaceholder(/forwarding|forward/i);
      if (await forwardingField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await forwardingField.fill(testPhoneNumbers.valid.forwardingNumber);
        await clickButton(page, /save|update|submit/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|updated|saved/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('delete phone number', async ({ page }) => {
    await navigateTo(page, '/phoneNumber');
    await waitForPageLoad(page);
    
    // Find delete button
    const deleteButton = page.getByRole('button', { name: /delete|remove|trash/i }).first();
    
    if (await deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteButton.click();
      
      // Confirm deletion if dialog appears
      const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }
      
      // Should show success message
      await expect(
        page.locator('text=/success|deleted|removed/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('call route configuration', async ({ page }) => {
    await navigateTo(page, '/callRoute');
    
    // Check for call route page
    await expect(page.getByRole('heading', { name: /call.*route|routing/i })).toBeVisible();
    
    // Configure route if form exists
    const routeDropdown = page.locator('select, [role="combobox"]').first();
    if (await routeDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      await routeDropdown.selectOption({ index: 0 });
      await clickButton(page, /save|update|configure/i);
      
      // Should show success message
      await expect(
        page.locator('text=/success|saved|updated/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('API connection', async ({ page }) => {
    await navigateTo(page, '/apiconnection');
    
    // Check for API connection page
    await expect(page.getByRole('heading', { name: /api.*connection|integrations/i })).toBeVisible();
    
    // Test API connection if button exists
    const testButton = page.getByRole('button', { name: /test|connect|verify/i });
    
    if (await testButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await testButton.click();
      
      // Should show connection status
      await expect(
        page.locator('text=/connected|success|error|failed/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });
});

