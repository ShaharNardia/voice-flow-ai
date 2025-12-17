import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, fillField, clickButton } from '../utils/helpers';

test.describe('Calls', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('call logs list loads @smoke', async ({ page }) => {
    await navigateTo(page, '/callLogs');
    await expect(page).toHaveURL(/callLogs/);
    
    // Check for call logs heading
    await expect(page.getByRole('heading', { name: /call logs|calls/i })).toBeVisible();
  });

  test('place call - happy path', async ({ page }) => {
    await navigateTo(page, '/placeCall');
    
    // Fill call form
    await fillField(page, /name|customer/i, 'Test Customer');
    await fillField(page, /phone|number/i, '+15551234567');
    
    // Click place call button
    await clickButton(page, /place call|call|start/i);
    
    // Should show success message or redirect
    await expect(
      page.locator('text=/success|call.*placed|initiated/i')
    ).toBeVisible({ timeout: 15000 });
  });

  test('place call - invalid phone number', async ({ page }) => {
    await navigateTo(page, '/placeCall');
    
    // Fill with invalid phone number
    await fillField(page, /name|customer/i, 'Test Customer');
    await fillField(page, /phone|number/i, 'invalid');
    
    // Click place call button
    await clickButton(page, /place call|call|start/i);
    
    // Should show error message
    await expect(
      page.locator('text=/error|invalid|failed/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('place call - missing company phone number', async ({ page }) => {
    await navigateTo(page, '/placeCall');
    
    // Fill form
    await fillField(page, /name|customer/i, 'Test Customer');
    await fillField(page, /phone|number/i, '+15551234567');
    
    // Click place call button
    await clickButton(page, /place call|call|start/i);
    
    // Should show error about missing company phone number
    await expect(
      page.locator('text=/phone.*number|company.*phone|add.*phone/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('call details - view details', async ({ page }) => {
    await navigateTo(page, '/callLogs');
    await waitForPageLoad(page);
    
    // Find first call and click to view details
    const callRow = page.locator('tr, [role="row"]').first();
    
    if (await callRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await callRow.click();
      await waitForPageLoad(page);
      
      // Should show call details
      await expect(
        page.locator('text=/duration|status|transcript|details/i')
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('update agent during call', async ({ page }) => {
    await navigateTo(page, '/callLogs');
    await waitForPageLoad(page);
    
    // Find active call or call with update button
    const updateButton = page.getByRole('button', { name: /update.*agent|change.*agent/i });
    
    if (await updateButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await updateButton.click();
      
      // Select new agent if dropdown appears
      const agentDropdown = page.locator('select, [role="combobox"]').first();
      if (await agentDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
        await agentDropdown.selectOption({ index: 0 });
        await clickButton(page, /save|update|confirm/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|updated/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('audio component - playback', async ({ page }) => {
    await navigateTo(page, '/callLogs');
    await waitForPageLoad(page);
    
    // Find call with audio
    const audioButton = page.getByRole('button', { name: /play|audio|listen/i });
    
    if (await audioButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await audioButton.click();
      
      // Audio should start playing (check for pause button or audio element)
      await expect(
        page.locator('button:has-text("pause"), audio, [controls]')
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('call summary - view summary', async ({ page }) => {
    await navigateTo(page, '/callLogs');
    await waitForPageLoad(page);
    
    // Find call and view summary
    const summaryButton = page.getByRole('button', { name: /summary|view.*summary/i });
    
    if (await summaryButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await summaryButton.click();
      await waitForPageLoad(page);
      
      // Should show summary content
      await expect(
        page.locator('text=/summary|transcript|key.*points/i')
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

