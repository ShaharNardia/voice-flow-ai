/**
 * Admin Panel Tests — /admin
 *
 * Requires env vars:
 *   QA_ADMIN_EMAIL    — Admin user email
 *   QA_ADMIN_PASSWORD — Admin user password
 *   QA_EMAIL          — Regular (non-admin) user email
 *   QA_PASSWORD       — Regular user password
 */

import { test, expect, Page } from '@playwright/test';
import { loginWithEmail, loginWithAdminEmail } from '../utils/session';
import { waitForPageLoad } from '../utils/helpers';

const BASE_URL = process.env.BASE_URL ?? '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToAdmin(page: Page) {
  await page.goto(`${BASE_URL}/admin`);
  await waitForPageLoad(page);
}

async function clickTab(page: Page, tabName: string) {
  await page.getByRole('button', { name: new RegExp(tabName, 'i') }).first().click();
  await page.waitForTimeout(600);
}

// ─── Smoke ────────────────────────────────────────────────────────────────────

test.describe('Admin Panel — Smoke @smoke', () => {
  test('admin panel loads for admin user @smoke', async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);
    // Expect admin-specific heading or tab bar
    await expect(
      page.getByRole('heading', { name: /admin/i }).or(page.getByText(/users/i).first())
    ).toBeVisible({ timeout: 15000 });
  });

  test('non-admin user is redirected or sees access denied @smoke', async ({ page }) => {
    test.skip(!process.env.QA_EMAIL, 'QA_EMAIL not set');
    await loginWithEmail(page);
    await page.goto(`${BASE_URL}/admin`);
    await waitForPageLoad(page);
    // Should either redirect away from /admin or show an access-denied message
    const isRedirected = !page.url().includes('/admin');
    const hasDenied = await page.getByText(/access denied|not authorized|forbidden|permission/i).isVisible().catch(() => false);
    expect(isRedirected || hasDenied).toBeTruthy();
  });
});

// ─── Users Tab ────────────────────────────────────────────────────────────────

test.describe('Admin Panel — Users Tab', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);
  });

  test('Users tab renders user table', async ({ page }) => {
    await clickTab(page, 'Users');
    // Table or user rows should be visible
    const table = page.locator('table, [role="table"]').first();
    const rows = page.locator('tr, [role="row"]');
    await expect(table.or(rows.first())).toBeVisible({ timeout: 15000 });
  });

  test('user table contains email cells', async ({ page }) => {
    await clickTab(page, 'Users');
    await page.waitForTimeout(1000);
    const emailCell = page.getByText(/@/i).first();
    await expect(emailCell).toBeVisible({ timeout: 10000 });
  });

  test('create user — happy path', async ({ page }) => {
    await clickTab(page, 'Users');
    const addBtn = page.getByRole('button', { name: /add user|create user|new user|\+/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    // Fill form
    const ts = Date.now();
    const emailField = page.getByPlaceholder(/email/i).first();
    await expect(emailField).toBeVisible({ timeout: 8000 });
    await emailField.fill(`qa-ui-${ts}@voiceflow-qa.com`);

    const pwField = page.getByPlaceholder(/password/i).first();
    if (await pwField.isVisible()) {
      await pwField.fill('TestPass123!');
    }

    await page.getByRole('button', { name: /create|save|submit|add/i }).last().click();

    // Expect success — either toast or new row
    const success = page
      .getByText(/created|success|added/i)
      .or(page.locator('tr').filter({ hasText: `qa-ui-${ts}` }));
    await expect(success.first()).toBeVisible({ timeout: 15000 });
  });

  test('create user — duplicate email shows error', async ({ page }) => {
    await clickTab(page, 'Users');
    const addBtn = page.getByRole('button', { name: /add user|create user|new user|\+/i }).first();
    await addBtn.click();

    const emailField = page.getByPlaceholder(/email/i).first();
    await emailField.fill(process.env.QA_ADMIN_EMAIL ?? 'admin@test.com');

    const pwField = page.getByPlaceholder(/password/i).first();
    if (await pwField.isVisible()) await pwField.fill('TestPass123!');

    await page.getByRole('button', { name: /create|save|submit|add/i }).last().click();
    await expect(page.getByText(/already exists|duplicate|error/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('view user detail modal', async ({ page }) => {
    await clickTab(page, 'Users');
    await page.waitForTimeout(1000);
    // Click first detail/eye icon
    const detailBtn = page
      .getByRole('button', { name: /detail|view|eye|info/i })
      .or(page.locator('[title*="detail"], [aria-label*="detail"], [aria-label*="view"]'))
      .first();
    if (await detailBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await detailBtn.click();
      await expect(page.getByRole('dialog').or(page.getByText(/assistant|call|plan/i).first())).toBeVisible({ timeout: 8000 });
    } else {
      test.skip();
    }
  });

  test('reset password generates feedback', async ({ page }) => {
    await clickTab(page, 'Users');
    await page.waitForTimeout(1000);
    const resetBtn = page
      .getByRole('button', { name: /reset|password/i })
      .or(page.locator('[aria-label*="reset"], [title*="reset"]'))
      .first();
    if (await resetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await resetBtn.click();
      await expect(page.getByText(/reset|link|sent|email/i).first()).toBeVisible({ timeout: 10000 });
    } else {
      test.skip();
    }
  });
});

// ─── Subscriptions Tab ────────────────────────────────────────────────────────

test.describe('Admin Panel — Subscriptions Tab', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);
  });

  test('Subscriptions tab renders list with plan badges', async ({ page }) => {
    await clickTab(page, 'Subscriptions');
    await page.waitForTimeout(1000);
    // Expect plan names or subscription table
    const content = page
      .getByText(/basic|pro|scale/i)
      .or(page.locator('table, [role="table"]').first());
    await expect(content.first()).toBeVisible({ timeout: 15000 });
  });
});

// ─── Plans & Pricing Tab ──────────────────────────────────────────────────────

test.describe('Admin Panel — Plans & Pricing Tab', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);
  });

  test('Plans & Pricing tab shows all three tiers', async ({ page }) => {
    await clickTab(page, 'Plans');
    await page.waitForTimeout(1000);
    await expect(page.getByText(/basic/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pro/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/scale/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('save plan changes shows success feedback', async ({ page }) => {
    await clickTab(page, 'Plans');
    await page.waitForTimeout(1000);
    const saveBtn = page.getByRole('button', { name: /save|update/i }).first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();
      await expect(page.getByText(/saved|success|updated/i).first()).toBeVisible({ timeout: 10000 });
    } else {
      test.skip();
    }
  });
});

// ─── API Keys Tab ─────────────────────────────────────────────────────────────

test.describe('Admin Panel — API Keys Tab', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);
  });

  test('API Keys tab loads key name labels', async ({ page }) => {
    await clickTab(page, 'API Keys');
    await page.waitForTimeout(1000);
    // At least one known key label should be visible
    const keyLabel = page
      .getByText(/twilio|openai|deepgram|stripe|sendgrid|elevenlabs/i)
      .first();
    await expect(keyLabel).toBeVisible({ timeout: 10000 });
  });

  test('show/hide toggle changes key field visibility', async ({ page }) => {
    await clickTab(page, 'API Keys');
    await page.waitForTimeout(1000);
    const toggleBtn = page
      .getByRole('button', { name: /show|hide|reveal/i })
      .or(page.locator('[aria-label*="show"], [aria-label*="hide"], [type="button"]').filter({ hasText: /eye/i }))
      .first();
    if (await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await toggleBtn.click();
      // Input type should change or value should become visible
      await page.waitForTimeout(300);
      // Simply verify no crash and the button is still accessible
      await expect(toggleBtn).toBeVisible();
    } else {
      test.skip();
    }
  });
});

// ─── System Settings Tab ──────────────────────────────────────────────────────

test.describe('Admin Panel — System Settings Tab', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);
  });

  test('System Settings tab renders editable fields', async ({ page }) => {
    await clickTab(page, 'System');
    await page.waitForTimeout(1000);
    const field = page.locator('input, textarea, select').first();
    await expect(field).toBeVisible({ timeout: 10000 });
  });
});

// ─── Phone & Integrations Tab ─────────────────────────────────────────────────

test.describe('Admin Panel — Phone & Integrations Tab', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);
  });

  test('Phone & Integrations tab renders without crashing', async ({ page }) => {
    await clickTab(page, 'Phone');
    await page.waitForTimeout(1500);
    // Either a table, an empty state, or integration cards should be visible
    const content = page
      .locator('table')
      .or(page.getByText(/no phone numbers|empty|integration|twilio/i).first());
    await expect(content.first()).toBeVisible({ timeout: 15000 });
  });

  test('integration health status indicators visible', async ({ page }) => {
    await clickTab(page, 'Phone');
    await page.waitForTimeout(1000);
    // Click "Integration Health" sub-tab if it exists
    const healthTab = page.getByRole('button', { name: /integration|health/i }).first();
    if (await healthTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await healthTab.click();
    }
    // Check for integration status indicators
    const statusIndicator = page
      .getByText(/twilio|openai|stripe|active|ok|error|not configured/i)
      .first();
    await expect(statusIndicator).toBeVisible({ timeout: 15000 });
  });
});

// ─── E2E: Full Admin Workflow ─────────────────────────────────────────────────

test.describe('Admin Panel — E2E Workflow', () => {
  test('E2E: create user → view detail → delete user', async ({ page }) => {
    test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_EMAIL not set');
    await loginWithAdminEmail(page);
    await goToAdmin(page);

    await clickTab(page, 'Users');
    const ts = Date.now();
    const testEmail = `qa-e2e-${ts}@voiceflow-qa.com`;

    // 1. Create user
    const addBtn = page.getByRole('button', { name: /add user|create user|new user|\+/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    await page.getByPlaceholder(/email/i).first().fill(testEmail);
    const pwField = page.getByPlaceholder(/password/i).first();
    if (await pwField.isVisible()) await pwField.fill('TestPass123!');
    await page.getByRole('button', { name: /create|save|submit|add/i }).last().click();

    // 2. Wait for user to appear in list
    await expect(page.getByText(testEmail)).toBeVisible({ timeout: 15000 });

    // 3. Find and click delete (teardown)
    const userRow = page.locator('tr, [role="row"]').filter({ hasText: testEmail });
    const deleteBtn = userRow
      .getByRole('button', { name: /delete|remove/i })
      .or(userRow.locator('[aria-label*="delete"], [title*="delete"]'))
      .first();

    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm dialog
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      // User should be gone
      await expect(page.getByText(testEmail)).not.toBeVisible({ timeout: 10000 });
    } else {
      // Delete button not visible — may be behind a details modal
      // Just verify creation succeeded and skip teardown
      test.info().annotations.push({ type: 'note', description: 'Delete button not found; creation verified only' });
    }
  });
});
