import * as fs from 'fs';
import * as path from 'path';
import { test as setup } from '@playwright/test';
import { loginWithPersona } from '../utils/session';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate as customer', async ({ page }) => {
  const email =
    process.env.E2E_USER_EMAIL || process.env.QA_EMAIL || '';
  const password =
    process.env.E2E_USER_PASSWORD || process.env.QA_PASSWORD || '';

  if (!email || !password) {
    throw new Error(
      'E2E_USER_EMAIL/E2E_USER_PASSWORD or QA_EMAIL/QA_PASSWORD must be set',
    );
  }

  await loginWithPersona(page, { email, password });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
