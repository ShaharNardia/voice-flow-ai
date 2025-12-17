import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';

test.describe('Authentication', () => {
  const baseUrl = process.env.BASE_URL ?? '';
  const email = process.env.QA_EMAIL ?? 'test@example.com';
  const password = process.env.QA_PASSWORD ?? 'testpassword123';

  test.describe('Login', () => {
    test('email login - happy path @smoke', async ({ page }) => {
      await loginWithEmail(page);
      await expect(page).toHaveURL(/dashboard/);
      await expect(page.getByRole('heading', { name: /Bookings/i })).toBeVisible();
    });

    test('email login - invalid email', async ({ page }) => {
      await page.goto(`${baseUrl}/loginScreen`);
      await page.getByPlaceholder('Email').fill('invalid-email');
      await page.getByPlaceholder('Password').fill(password);
      await page.getByRole('button', { name: /Login/ }).click();
      
      // Should show validation error or stay on login page
      await expect(page).toHaveURL(/loginScreen/);
    });

    test('email login - wrong password', async ({ page }) => {
      await page.goto(`${baseUrl}/loginScreen`);
      await page.getByPlaceholder('Email').fill(email);
      await page.getByPlaceholder('Password').fill('wrongpassword');
      await page.getByRole('button', { name: /Login/ }).click();
      
      // Should show error message
      await expect(page.locator('text=/error|invalid|incorrect/i')).toBeVisible({ timeout: 5000 });
    });

    test('email login - empty fields', async ({ page }) => {
      await page.goto(`${baseUrl}/loginScreen`);
      await page.getByRole('button', { name: /Login/ }).click();
      
      // Should show validation errors or stay on login page
      await expect(page).toHaveURL(/loginScreen/);
    });
  });

  test.describe('Signup', () => {
    test('signup - happy path', async ({ page }) => {
      await page.goto(`${baseUrl}/signupScreen`);
      
      const timestamp = Date.now();
      const testEmail = `test${timestamp}@example.com`;
      
      await page.getByPlaceholder(/email/i).fill(testEmail);
      await page.getByPlaceholder(/password/i).first().fill('TestPassword123!');
      await page.getByPlaceholder(/confirm|repeat/i).fill('TestPassword123!');
      await page.getByRole('button', { name: /sign up|create account|register/i }).click();
      
      // Should redirect to dashboard or onboarding
      await expect(page).toHaveURL(/(dashboard|startup|onboarding)/, { timeout: 10000 });
    });

    test('signup - passwords do not match', async ({ page }) => {
      await page.goto(`${baseUrl}/signupScreen`);
      
      const timestamp = Date.now();
      const testEmail = `test${timestamp}@example.com`;
      
      await page.getByPlaceholder(/email/i).fill(testEmail);
      await page.getByPlaceholder(/password/i).first().fill('TestPassword123!');
      await page.getByPlaceholder(/confirm|repeat/i).fill('DifferentPassword123!');
      await page.getByRole('button', { name: /sign up|create account|register/i }).click();
      
      // Should show error about passwords not matching
      await expect(page.locator('text=/password.*match|don\'t match/i')).toBeVisible({ timeout: 5000 });
    });

    test('signup - existing email', async ({ page }) => {
      await page.goto(`${baseUrl}/signupScreen`);
      
      await page.getByPlaceholder(/email/i).fill(email);
      await page.getByPlaceholder(/password/i).first().fill('TestPassword123!');
      await page.getByPlaceholder(/confirm|repeat/i).fill('TestPassword123!');
      await page.getByRole('button', { name: /sign up|create account|register/i }).click();
      
      // Should show error about email already in use
      await expect(page.locator('text=/already.*use|email.*exists/i')).toBeVisible({ timeout: 5000 });
    });

    test('signup - invalid email format', async ({ page }) => {
      await page.goto(`${baseUrl}/signupScreen`);
      
      await page.getByPlaceholder(/email/i).fill('not-an-email');
      await page.getByPlaceholder(/password/i).first().fill('TestPassword123!');
      await page.getByPlaceholder(/confirm|repeat/i).fill('TestPassword123!');
      await page.getByRole('button', { name: /sign up|create account|register/i }).click();
      
      // Should show validation error
      await expect(page).toHaveURL(/signupScreen/);
    });
  });

  test.describe('Forget Password', () => {
    test('forget password - send reset email', async ({ page }) => {
      await page.goto(`${baseUrl}/forgetPassword`);
      
      await page.getByPlaceholder(/email/i).fill(email);
      await page.getByRole('button', { name: /send|reset|submit/i }).click();
      
      // Should show success message
      await expect(page.locator('text=/sent|email|reset/i')).toBeVisible({ timeout: 5000 });
    });

    test('forget password - empty email', async ({ page }) => {
      await page.goto(`${baseUrl}/forgetPassword`);
      
      await page.getByRole('button', { name: /send|reset|submit/i }).click();
      
      // Should show validation error
      await expect(page.locator('text=/required|email/i')).toBeVisible({ timeout: 5000 });
    });

    test('forget password - invalid email', async ({ page }) => {
      await page.goto(`${baseUrl}/forgetPassword`);
      
      await page.getByPlaceholder(/email/i).fill('invalid-email');
      await page.getByRole('button', { name: /send|reset|submit/i }).click();
      
      // Should show validation error
      await expect(page).toHaveURL(/forgetPassword/);
    });
  });

  test.describe('Session & Navigation', () => {
    test('protected routes redirect to login', async ({ page }) => {
      await page.goto(`${baseUrl}/dashboard`);
      
      // Should redirect to login if not authenticated
      await expect(page).toHaveURL(/loginScreen/, { timeout: 5000 });
    });

    test('session persistence', async ({ page, context }) => {
      // Login first
      await loginWithEmail(page);
      await expect(page).toHaveURL(/dashboard/);
      
      // Save storage state
      await context.storageState({ path: 'storage-state.json' });
      
      // Create new context with saved state
      const newContext = await context.browser()?.newContext({
        storageState: 'storage-state.json',
      });
      const newPage = await newContext?.newPage();
      
      if (newPage) {
        await newPage.goto(`${baseUrl}/dashboard`);
        // Should be logged in
        await expect(newPage).toHaveURL(/dashboard/);
        await newPage.close();
      }
    });

    test('logout', async ({ page }) => {
      await loginWithEmail(page);
      await expect(page).toHaveURL(/dashboard/);
      
      // Find and click logout button
      await page.getByRole('button', { name: /logout|sign out|exit/i }).click();
      
      // Should redirect to login
      await expect(page).toHaveURL(/loginScreen/, { timeout: 5000 });
    });
  });
});

