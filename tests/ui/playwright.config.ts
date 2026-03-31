import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const authDir = path.resolve(__dirname, '.auth');
const adminStorageState = path.join(authDir, 'admin.json');
const userStorageState = path.join(authDir, 'user.json');

function hasAdminCreds(): boolean {
  return !!(
    process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD
  );
}

function hasUserCreds(): boolean {
  return !!(
    (process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD) ||
    (process.env.QA_EMAIL && process.env.QA_PASSWORD)
  );
}

/** Specs that use their own login or are covered by persona projects */
const legacyIgnore = [
  /auth\.setup\.(admin|user)\.spec\.ts$/,
  /e2e\.(admin|customer)\.spec\.ts$/,
];

export default defineConfig({
  testDir: './specs',
  timeout: 60 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...(hasAdminCreds()
      ? [
          {
            name: 'setup-admin',
            testMatch: /auth\.setup\.admin\.spec\.ts$/,
          },
          {
            name: 'chromium-admin',
            dependencies: ['setup-admin'],
            testMatch: /e2e\.admin\.spec\.ts$/,
            use: {
              ...devices['Desktop Chrome'],
              storageState: adminStorageState,
            },
          },
        ]
      : []),
    ...(hasUserCreds()
      ? [
          {
            name: 'setup-user',
            testMatch: /auth\.setup\.user\.spec\.ts$/,
          },
          {
            name: 'chromium-user',
            dependencies: ['setup-user'],
            testMatch: /e2e\.customer\.spec\.ts$/,
            use: {
              ...devices['Desktop Chrome'],
              storageState: userStorageState,
            },
          },
        ]
      : []),
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: legacyIgnore,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: legacyIgnore,
    },
  ],
});
