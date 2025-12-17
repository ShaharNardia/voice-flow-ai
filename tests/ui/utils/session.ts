import { expect, Page } from '@playwright/test';

export async function loginWithEmail(page: Page) {
  const baseUrl = process.env.BASE_URL ?? '';
  const email = process.env.QA_EMAIL ?? '';
  const password = process.env.QA_PASSWORD ?? '';

  if (!email || !password) {
    throw new Error('QA_EMAIL and QA_PASSWORD must be defined in environment variables');
  }

  await page.goto(`${baseUrl}/loginScreen`);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /Login/ }).click();
  await expect(page).toHaveURL(/dashboard/);
}





