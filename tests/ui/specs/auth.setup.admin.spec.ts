import * as fs from 'fs';
import * as path from 'path';
import { test as setup } from '@playwright/test';
import { loginWithPersona } from '../utils/session';

const authFile = path.join(__dirname, '../.auth/admin.json');

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? '';
  const password = process.env.E2E_ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    throw new Error(
      'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set (chromium-admin project should not run without them)',
    );
  }

  await loginWithPersona(page, { email, password });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
