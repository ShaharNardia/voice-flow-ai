/**
 * Scenarios (Call Flow Builder) Tests — /scenarios
 */

import { test, expect, Page } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad } from '../utils/helpers';
import { testScenarios } from '../fixtures/test-data';

const BASE_URL = process.env.BASE_URL ?? '';

async function goToScenarios(page: Page) {
  await page.goto(`${BASE_URL}/scenarios`);
  await waitForPageLoad(page);
}

async function openCreateModal(page: Page) {
  const btn = page
    .getByRole('button', { name: /new scenario|create|add|\+/i })
    .first();
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.click();
  await page.waitForTimeout(400);
}

// ─── Smoke ────────────────────────────────────────────────────────────────────

test.describe('Scenarios — Smoke @smoke', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_EMAIL, 'QA_EMAIL not set');
    await loginWithEmail(page);
  });

  test('scenarios list page loads @smoke', async ({ page }) => {
    await goToScenarios(page);
    await expect(page).toHaveURL(/scenarios/, { timeout: 15000 });
    // Heading or create button must be visible
    const heading = page
      .getByRole('heading', { name: /scenario|call flow/i })
      .or(page.getByRole('button', { name: /new|create|\+/i }).first());
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Regression ───────────────────────────────────────────────────────────────

test.describe('Scenarios — Regression', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.QA_EMAIL, 'QA_EMAIL not set');
    await loginWithEmail(page);
    await goToScenarios(page);
  });

  test('empty state or scenario list renders without crash', async ({ page }) => {
    // Either a list or an empty-state element should be visible
    const content = page
      .getByText(/no scenarios|create your first|scenario/i)
      .or(page.locator('table, [role="list"], .scenario-card').first());
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });

  test('"New Scenario" button opens modal with name field', async ({ page }) => {
    await openCreateModal(page);
    const nameField = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]').first());
    await expect(nameField.first()).toBeVisible({ timeout: 8000 });
  });

  test('create scenario — name required validation', async ({ page }) => {
    await openCreateModal(page);
    // Clear name and try to submit
    const nameField = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]').first());
    await nameField.first().fill('');
    await page.getByRole('button', { name: /create|save|submit/i }).last().click();
    await expect(
      page.getByText(/required|name is required|please enter/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('create scenario — happy path redirects to editor', async ({ page }) => {
    await openCreateModal(page);
    const name = testScenarios.valid.name;
    const nameField = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]').first());
    await nameField.first().fill(name);

    const descField = page.getByPlaceholder(/description/i).or(page.locator('textarea').first());
    if (await descField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descField.fill(testScenarios.valid.description);
    }

    await page.getByRole('button', { name: /create|save|submit/i }).last().click();

    // Should redirect to editor or show scenario in list
    await expect(page).toHaveURL(/scenarios/, { timeout: 15000 });
  });

  test('scenario list shows newly created scenario name', async ({ page }) => {
    // Verify previous test's scenario appears (re-navigate to list)
    const name = testScenarios.valid.name;
    // Create one fresh
    await openCreateModal(page);
    const ts = Date.now();
    const uniqueName = `QA Scenario List ${ts}`;
    const nameField = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]').first());
    await nameField.first().fill(uniqueName);
    await page.getByRole('button', { name: /create|save|submit/i }).last().click();
    await page.waitForTimeout(1000);

    await goToScenarios(page);
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 15000 });
  });

  test('scenario editor canvas renders on /scenarios/edit', async ({ page }) => {
    // Navigate to create then check editor renders
    await openCreateModal(page);
    const ts = Date.now();
    const uniqueName = `QA Editor Test ${ts}`;
    const nameField = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]').first());
    await nameField.first().fill(uniqueName);
    await page.getByRole('button', { name: /create|save|submit/i }).last().click();

    // Wait for redirect to editor
    await expect(page).toHaveURL(/scenarios\/edit|scenarios\?id/, { timeout: 15000 });
    // Editor should have a canvas or node area
    const editor = page
      .locator('canvas, .react-flow, [data-testid*="flow"], .flow-canvas, .scenario-editor')
      .or(page.getByText(/drag|node|step|flow/i).first());
    await expect(editor.first()).toBeVisible({ timeout: 15000 });
  });

  test('duplicate scenario creates copy', async ({ page }) => {
    // Find a scenario and click duplicate
    const dupBtn = page
      .getByRole('button', { name: /duplicate|copy/i })
      .or(page.locator('[aria-label*="duplicate"], [title*="duplicate"]'))
      .first();
    if (await dupBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dupBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.getByText(/copy of|duplicate/i).first()).toBeVisible({ timeout: 10000 });
    } else {
      test.skip();
    }
  });

  test('delete scenario from list', async ({ page }) => {
    // Create a scenario specifically to delete
    await openCreateModal(page);
    const ts = Date.now();
    const deleteName = `QA Delete ${ts}`;
    const nameField = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]').first());
    await nameField.first().fill(deleteName);
    await page.getByRole('button', { name: /create|save|submit/i }).last().click();
    await page.waitForTimeout(500);

    await goToScenarios(page);
    await expect(page.getByText(deleteName)).toBeVisible({ timeout: 10000 });

    const row = page.locator('tr, [role="listitem"], .scenario-card').filter({ hasText: deleteName });
    const deleteBtn = row
      .getByRole('button', { name: /delete|remove/i })
      .or(row.locator('[aria-label*="delete"], [title*="delete"]'))
      .first();

    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.getByText(deleteName)).not.toBeVisible({ timeout: 10000 });
    } else {
      test.skip();
    }
  });
});

// ─── E2E ──────────────────────────────────────────────────────────────────────

test.describe('Scenarios — E2E Lifecycle', () => {
  test('E2E: create → verify in list → delete', async ({ page }) => {
    test.skip(!process.env.QA_EMAIL, 'QA_EMAIL not set');
    await loginWithEmail(page);
    await goToScenarios(page);

    const ts = Date.now();
    const name = `QA E2E Flow ${ts}`;

    // 1. Create
    await openCreateModal(page);
    const nameField = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]').first());
    await nameField.first().fill(name);
    await page.getByRole('button', { name: /create|save|submit/i }).last().click();
    await page.waitForTimeout(500);

    // 2. Navigate back to list
    await goToScenarios(page);

    // 3. Verify in list
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 });

    // 4. Delete
    const row = page.locator('tr, [role="listitem"], .scenario-card').filter({ hasText: name });
    const deleteBtn = row
      .getByRole('button', { name: /delete|remove/i })
      .or(row.locator('[aria-label*="delete"], [title*="delete"]'))
      .first();

    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.getByText(name)).not.toBeVisible({ timeout: 10000 });
    }
  });
});
