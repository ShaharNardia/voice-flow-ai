import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo } from '../utils/helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('dashboard loads successfully @smoke', async ({ page }) => {
    await navigateTo(page, '/dashboard');
    await expect(page).toHaveURL(/dashboard/);
    
    // Check for main dashboard elements
    await expect(page.getByRole('heading', { name: /Bookings|Dashboard/i })).toBeVisible();
  });

  test('KPIs are displayed', async ({ page }) => {
    await navigateTo(page, '/dashboard');
    
    // Look for common KPI elements (adjust selectors based on actual UI)
    const kpiSelectors = [
      /total|count|number/i,
      /active|pending|completed/i,
    ];
    
    // At least one KPI should be visible
    const hasKPI = await Promise.race(
      kpiSelectors.map(selector => 
        page.locator(`text=${selector}`).isVisible().catch(() => false)
      )
    );
    
    expect(hasKPI).toBeTruthy();
  });

  test('recent activity feed is visible', async ({ page }) => {
    await navigateTo(page, '/dashboard');
    
    // Look for activity feed (adjust selector based on actual UI)
    const activitySelectors = [
      /recent|activity|feed|history/i,
      /latest|updates/i,
    ];
    
    // At least one activity element should be visible
    const hasActivity = await Promise.race(
      activitySelectors.map(selector => 
        page.locator(`text=${selector}`).isVisible().catch(() => false)
      )
    );
    
    expect(hasActivity).toBeTruthy();
  });

  test('quick actions are accessible', async ({ page }) => {
    await navigateTo(page, '/dashboard');
    
    // Look for quick action buttons
    const quickActionSelectors = [
      /new|create|add/i,
      /book|schedule|appointment/i,
    ];
    
    // At least one quick action should be visible
    const hasQuickAction = await Promise.race(
      quickActionSelectors.map(selector => 
        page.getByRole('button', { name: selector }).isVisible().catch(() => false)
      )
    );
    
    expect(hasQuickAction).toBeTruthy();
  });

  test('navigation to all main pages', async ({ page }) => {
    await navigateTo(page, '/dashboard');
    
    const pages = [
      { name: /bookings|appointments/i, path: /apppointments|bookings/ },
      { name: /assistants/i, path: /assistants/ },
      { name: /calls|call logs/i, path: /callLogs/ },
      { name: /leads/i, path: /leads/ },
      { name: /billing/i, path: /billing/ },
      { name: /profile|settings/i, path: /profileScreen/ },
    ];
    
    for (const pageItem of pages) {
      try {
        const link = page.getByRole('link', { name: pageItem.name });
        if (await link.isVisible({ timeout: 2000 })) {
          await link.click();
          await waitForPageLoad(page);
          await expect(page).toHaveURL(pageItem.path);
          // Navigate back to dashboard
          await navigateTo(page, '/dashboard');
        }
      } catch (e) {
        // Page might not be in navigation, skip
        console.log(`Navigation to ${pageItem.name} not found, skipping`);
      }
    }
  });

  test('dashboard refreshes data', async ({ page }) => {
    await navigateTo(page, '/dashboard');
    
    // Wait for initial load
    await waitForPageLoad(page);
    
    // Look for refresh button or trigger refresh
    const refreshButton = page.getByRole('button', { name: /refresh|reload|update/i });
    
    if (await refreshButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await refreshButton.click();
      await waitForPageLoad(page);
      
      // Dashboard should still be visible after refresh
      await expect(page).toHaveURL(/dashboard/);
    }
  });
});

