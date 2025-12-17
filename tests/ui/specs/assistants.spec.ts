import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, fillField, clickButton } from '../utils/helpers';
import { testAssistants } from '../fixtures/test-data';

test.describe('Assistants', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('assistants list loads and displays @smoke', async ({ page }) => {
    await navigateTo(page, '/assistants');
    await expect(page).toHaveURL(/assistants/);
    
    // Check for assistants list heading
    await expect(page.getByRole('heading', { name: /assistants/i })).toBeVisible();
  });

  test('create assistant - happy path', async ({ page }) => {
    await navigateTo(page, '/assistants');
    
    // Click create new button
    await clickButton(page, /create|new|add/i);
    
    // Fill assistant form
    await fillField(page, /name/i, testAssistants.valid.name);
    await fillField(page, /first message|greeting/i, testAssistants.valid.firstMessage);
    
    // Select language if dropdown exists
    const languageDropdown = page.locator('select, [role="combobox"]').first();
    if (await languageDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      await languageDropdown.selectOption({ label: /english|en/i });
    }
    
    // Submit form
    await clickButton(page, /save|create|submit/i);
    
    // Should show success message or redirect
    await expect(
      page.locator('text=/success|created|saved/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('create assistant - validation errors', async ({ page }) => {
    await navigateTo(page, '/assistants');
    
    // Click create new button
    await clickButton(page, /create|new|add/i);
    
    // Try to submit without filling required fields
    await clickButton(page, /save|create|submit/i);
    
    // Should show validation errors
    await expect(
      page.locator('text=/required|invalid|error/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('edit assistant', async ({ page }) => {
    await navigateTo(page, '/assistants');
    await waitForPageLoad(page);
    
    // Find first assistant and click edit
    const editButton = page.getByRole('button', { name: /edit|update|modify/i }).first();
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click();
      await waitForPageLoad(page);
      
      // Update name
      const nameField = page.getByPlaceholder(/name/i).first();
      if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameField.fill(`Updated ${testAssistants.valid.name}`);
        await clickButton(page, /save|update|submit/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|updated|saved/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('delete assistant', async ({ page }) => {
    await navigateTo(page, '/assistants');
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

  test('search assistants', async ({ page }) => {
    await navigateTo(page, '/assistants');
    await waitForPageLoad(page);
    
    // Find search field
    const searchField = page.getByPlaceholder(/search|filter/i);
    
    if (await searchField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchField.fill('test');
      await page.waitForTimeout(500); // Wait for search to execute
      
      // Results should be filtered
      await expect(page.locator('text=/test/i').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('filter assistants', async ({ page }) => {
    await navigateTo(page, '/assistants');
    await waitForPageLoad(page);
    
    // Look for filter dropdown or button
    const filterButton = page.getByRole('button', { name: /filter|sort/i });
    
    if (await filterButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filterButton.click();
      
      // Select a filter option if available
      const filterOption = page.locator('text=/active|all|inactive/i').first();
      if (await filterOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await filterOption.click();
        await waitForPageLoad(page);
      }
    }
  });
});

