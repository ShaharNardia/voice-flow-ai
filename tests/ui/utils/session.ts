import { expect, Page } from '@playwright/test';

export type LoginCredentials = { email: string; password: string };

/**
 * Login via /login or /loginScreen (Email + Password placeholders).
 */
export async function loginWithPersona(page: Page, creds: LoginCredentials) {
  const baseUrl = process.env.BASE_URL ?? '';
  const { email, password } = creds;

  if (!email || !password) {
    throw new Error('loginWithPersona: email and password are required');
  }

  for (const loginPath of ['/login', '/loginScreen']) {
    await page.goto(`${baseUrl}${loginPath}`, { waitUntil: 'domcontentloaded' });
    const emailField = page.getByPlaceholder('Email');
    const visible = await emailField.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) continue;

    await emailField.fill(email);
    await page.getByPlaceholder('Password').fill(password);
    const loginBtn = page.getByRole('button', { name: /Login|Sign in|התחבר/i });
    await loginBtn.click();
    await expect(page).toHaveURL(/dashboard|onboarding/, { timeout: 45000 });
    return;
  }

  throw new Error('Login form not found at /login or /loginScreen');
}

/** @deprecated Prefer loginWithPersona with explicit creds or E2E_USER_* */
export async function loginWithEmail(page: Page) {
  const email = process.env.QA_EMAIL ?? '';
  const password = process.env.QA_PASSWORD ?? '';

  if (!email || !password) {
    throw new Error('QA_EMAIL and QA_PASSWORD must be defined in environment variables');
  }

  await loginWithPersona(page, { email, password });
}
