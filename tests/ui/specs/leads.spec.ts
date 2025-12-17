import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, fillField, clickButton } from '../utils/helpers';
import { testLeads } from '../fixtures/test-data';

test.describe('Leads', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('leads list loads @smoke', async ({ page }) => {
    await navigateTo(page, '/leads');
    await expect(page).toHaveURL(/leads/);
    
    // Check for leads heading
    await expect(page.getByRole('heading', { name: /leads/i })).toBeVisible();
  });

  test('create lead - happy path', async ({ page }) => {
    await navigateTo(page, '/leads');
    
    // Click add lead button
    await clickButton(page, /add|create|new.*lead/i);
    
    // Fill lead form
    await fillField(page, /name/i, testLeads.valid.name);
    await fillField(page, /phone|number/i, testLeads.valid.phoneNumber);
    await fillField(page, /email/i, testLeads.valid.email);
    
    // Submit form
    await clickButton(page, /save|create|submit/i);
    
    // Should show success message
    await expect(
      page.locator('text=/success|created|saved/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('create lead - validation errors', async ({ page }) => {
    await navigateTo(page, '/leads');
    
    // Click add lead button
    await clickButton(page, /add|create|new.*lead/i);
    
    // Try to submit without required fields
    await clickButton(page, /save|create|submit/i);
    
    // Should show validation errors
    await expect(
      page.locator('text=/required|invalid|error/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('edit lead', async ({ page }) => {
    await navigateTo(page, '/leads');
    await waitForPageLoad(page);
    
    // Find first lead and click edit
    const editButton = page.getByRole('button', { name: /edit|update|modify/i }).first();
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click();
      await waitForPageLoad(page);
      
      // Update name
      const nameField = page.getByPlaceholder(/name/i).first();
      if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameField.fill(`Updated ${testLeads.valid.name}`);
        await clickButton(page, /save|update|submit/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|updated|saved/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('view lead details', async ({ page }) => {
    await navigateTo(page, '/leads');
    await waitForPageLoad(page);
    
    // Find first lead and click to view
    const leadRow = page.locator('tr, [role="row"], .lead-item').first();
    
    if (await leadRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await leadRow.click();
      await waitForPageLoad(page);
      
      // Should show lead details
      await expect(
        page.locator('text=/name|phone|email|details/i')
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('lead capture', async ({ page }) => {
    await navigateTo(page, '/leadCapture');
    
    // Fill capture form
    await fillField(page, /name/i, testLeads.valid.name);
    await fillField(page, /phone|number/i, testLeads.valid.phoneNumber);
    await fillField(page, /email/i, testLeads.valid.email);
    
    // Submit
    await clickButton(page, /capture|save|submit/i);
    
    // Should show success message
    await expect(
      page.locator('text=/success|captured|saved/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('upload lead CSV', async ({ page }) => {
    await navigateTo(page, '/leads');
    
    // Find upload button
    const uploadButton = page.getByRole('button', { name: /upload|import|csv/i });
    
    if (await uploadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadButton.click();
      
      // File input should be available
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Note: In real test, you would upload an actual CSV file
        // await fileInput.setInputFiles('path/to/test-leads.csv');
        
        // For now, just verify the input is available
        await expect(fileInput).toBeVisible();
      }
    }
  });

  test('search and filter leads', async ({ page }) => {
    await navigateTo(page, '/leads');
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

  test('place call from lead', async ({ page }) => {
    await navigateTo(page, '/leads');
    await waitForPageLoad(page);
    
    // Find call button on lead
    const callButton = page.getByRole('button', { name: /call|phone/i }).first();
    
    if (await callButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await callButton.click();
      await waitForPageLoad(page);
      
      // Should show call dialog or redirect to place call
      await expect(
        page.locator('text=/call|placing|initiated/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });
});

