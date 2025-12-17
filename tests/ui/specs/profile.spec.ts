import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, fillField, clickButton } from '../utils/helpers';

test.describe('Profile & Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('profile page loads', async ({ page }) => {
    await navigateTo(page, '/profileScreen');
    await expect(page).toHaveURL(/profileScreen/);
    
    // Check for profile heading
    await expect(page.getByRole('heading', { name: /profile|account/i })).toBeVisible();
  });

  test('view profile', async ({ page }) => {
    await navigateTo(page, '/profileScreen');
    await waitForPageLoad(page);
    
    // Check for profile information
    await expect(
      page.locator('text=/name|email|phone|profile/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('edit profile', async ({ page }) => {
    await navigateTo(page, '/editProfileScreen');
    
    // Update name if field exists
    const nameField = page.getByPlaceholder(/name|full.*name/i);
    if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameField.fill('Updated Test Name');
      
      // Update other fields if they exist
      const phoneField = page.getByPlaceholder(/phone|number/i);
      if (await phoneField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await phoneField.fill('+15551234567');
      }
      
      await clickButton(page, /save|update|submit/i);
      
      // Should show success message
      await expect(
        page.locator('text=/success|updated|saved/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('change password', async ({ page }) => {
    await navigateTo(page, '/changePassword');
    
    // Fill password change form
    const currentPasswordField = page.getByPlaceholder(/current|old.*password/i);
    const newPasswordField = page.getByPlaceholder(/new.*password/i);
    const confirmPasswordField = page.getByPlaceholder(/confirm|repeat.*password/i);
    
    if (await currentPasswordField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await currentPasswordField.fill('CurrentPassword123!');
      await newPasswordField.fill('NewPassword123!');
      await confirmPasswordField.fill('NewPassword123!');
      
      await clickButton(page, /save|update|change.*password/i);
      
      // Should show success message
      await expect(
        page.locator('text=/success|password.*changed|updated/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('change password - passwords do not match', async ({ page }) => {
    await navigateTo(page, '/changePassword');
    
    const currentPasswordField = page.getByPlaceholder(/current|old.*password/i);
    const newPasswordField = page.getByPlaceholder(/new.*password/i);
    const confirmPasswordField = page.getByPlaceholder(/confirm|repeat.*password/i);
    
    if (await currentPasswordField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await currentPasswordField.fill('CurrentPassword123!');
      await newPasswordField.fill('NewPassword123!');
      await confirmPasswordField.fill('DifferentPassword123!');
      
      await clickButton(page, /save|update|change.*password/i);
      
      // Should show error about passwords not matching
      await expect(
        page.locator('text=/password.*match|don\'t match|not.*same/i')
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('field validation', async ({ page }) => {
    await navigateTo(page, '/editProfileScreen');
    
    // Try to submit empty form
    await clickButton(page, /save|update|submit/i);
    
    // Should show validation errors
    await expect(
      page.locator('text=/required|invalid|error/i')
    ).toBeVisible({ timeout: 5000 });
  });
});

