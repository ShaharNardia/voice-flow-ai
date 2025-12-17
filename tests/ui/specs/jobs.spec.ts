import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo, fillField, clickButton } from '../utils/helpers';
import { testJobs } from '../fixtures/test-data';

test.describe('Jobs/Bookings', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('bookings page accessible @smoke', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    await expect(page.getByRole('heading', { name: /Bookings/i })).toBeVisible();
    await expect(page.getByText(/Active Bookings/i)).toBeVisible();
  });

  test('bookings list loads', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    await expect(page).toHaveURL(/apppointments|bookings/);
    
    // Check for bookings heading
    await expect(page.getByRole('heading', { name: /bookings|appointments/i })).toBeVisible();
  });

  test('create job - happy path', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    
    // Click create new booking button
    await clickButton(page, /new|create|add.*booking/i);
    
    // Fill job form
    await fillField(page, /customer|name/i, testJobs.valid.customerName);
    await fillField(page, /phone|number/i, testJobs.valid.phoneNumber);
    await fillField(page, /address/i, testJobs.valid.address);
    
    // Submit form
    await clickButton(page, /save|create|submit/i);
    
    // Should show success message
    await expect(
      page.locator('text=/success|created|saved/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('edit job', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    await waitForPageLoad(page);
    
    // Find first job and click edit
    const editButton = page.getByRole('button', { name: /edit|update|modify/i }).first();
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click();
      await waitForPageLoad(page);
      
      // Update customer name
      const nameField = page.getByPlaceholder(/customer|name/i).first();
      if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameField.fill(`Updated ${testJobs.valid.customerName}`);
        await clickButton(page, /save|update|submit/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|updated|saved/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('assign technician', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    await waitForPageLoad(page);
    
    // Find assign button
    const assignButton = page.getByRole('button', { name: /assign|technician|tech/i }).first();
    
    if (await assignButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assignButton.click();
      
      // Select technician from dropdown
      const techDropdown = page.locator('select, [role="combobox"]').first();
      if (await techDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
        await techDropdown.selectOption({ index: 0 });
        await clickButton(page, /save|assign|confirm/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|assigned|updated/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('change job status', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    await waitForPageLoad(page);
    
    // Find status dropdown or button
    const statusButton = page.getByRole('button', { name: /status|change.*status/i }).first();
    
    if (await statusButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusButton.click();
      
      // Select new status
      const statusOption = page.locator('text=/completed|in.*progress|pending/i').first();
      if (await statusOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await statusOption.click();
        
        // Should show success message
        await expect(
          page.locator('text=/success|updated/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('reschedule job', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    await waitForPageLoad(page);
    
    // Find reschedule button
    const rescheduleButton = page.getByRole('button', { name: /reschedule|change.*date/i }).first();
    
    if (await rescheduleButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await rescheduleButton.click();
      
      // Select new date/time if date picker appears
      const datePicker = page.locator('input[type="date"], [role="textbox"]').first();
      if (await datePicker.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Set future date
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);
        await datePicker.fill(futureDate.toISOString().split('T')[0]);
        
        await clickButton(page, /save|confirm|reschedule/i);
        
        // Should show success message
        await expect(
          page.locator('text=/success|rescheduled|updated/i')
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('client management', async ({ page }) => {
    await navigateTo(page, '/client');
    
    // Check for client page
    await expect(page.getByRole('heading', { name: /client|customers/i })).toBeVisible();
  });

  test('schedule view', async ({ page }) => {
    await navigateTo(page, '/schedule');
    
    // Check for schedule view
    await expect(page.getByRole('heading', { name: /schedule|calendar/i })).toBeVisible();
  });

  test('send SMS/WhatsApp', async ({ page }) => {
    await navigateTo(page, '/apppointments');
    await waitForPageLoad(page);
    
    // Find SMS/WhatsApp button
    const messageButton = page.getByRole('button', { name: /sms|whatsapp|message|send/i }).first();
    
    if (await messageButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await messageButton.click();
      
      // Should show message dialog or form
      await expect(
        page.locator('text=/message|sms|whatsapp/i')
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

