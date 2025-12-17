import { test, expect } from '@playwright/test';
import { loginWithEmail } from '../utils/session';
import { waitForPageLoad, navigateTo } from '../utils/helpers';

test.describe('Performance', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
    await waitForPageLoad(page);
  });

  test('dashboard page load time', async ({ page }) => {
    const startTime = Date.now();
    await navigateTo(page, '/dashboard');
    await waitForPageLoad(page);
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    console.log(`Dashboard load time: ${loadTime}ms`);
  });

  test('assistants page load time', async ({ page }) => {
    const startTime = Date.now();
    await navigateTo(page, '/assistants');
    await waitForPageLoad(page);
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    console.log(`Assistants page load time: ${loadTime}ms`);
  });

  test('call logs page load time', async ({ page }) => {
    const startTime = Date.now();
    await navigateTo(page, '/callLogs');
    await waitForPageLoad(page);
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    console.log(`Call logs page load time: ${loadTime}ms`);
  });

  test('network requests optimization', async ({ page }) => {
    const requests: string[] = [];
    
    page.on('request', (request) => {
      requests.push(request.url());
    });
    
    await navigateTo(page, '/dashboard');
    await waitForPageLoad(page);
    
    // Check for unnecessary requests (adjust based on actual requirements)
    const duplicateRequests = requests.filter((url, index) => requests.indexOf(url) !== index);
    expect(duplicateRequests.length).toBe(0);
    
    console.log(`Total requests: ${requests.length}`);
  });

  test('time to interactive', async ({ page }) => {
    await navigateTo(page, '/dashboard');
    
    // Wait for page to be interactive
    const interactiveTime = await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve(performance.timing.domInteractive - performance.timing.navigationStart);
        } else {
          window.addEventListener('load', () => {
            resolve(performance.timing.domInteractive - performance.timing.navigationStart);
          });
        }
      });
    });
    
    // Should be interactive within 3 seconds
    expect(interactiveTime).toBeLessThan(3000);
    console.log(`Time to interactive: ${interactiveTime}ms`);
  });

  test('memory usage', async ({ page, context }) => {
    await navigateTo(page, '/dashboard');
    await waitForPageLoad(page);
    
    // Get memory usage if available
    const memoryInfo = await page.evaluate(() => {
      return (performance as any).memory ? {
        used: (performance as any).memory.usedJSHeapSize,
        total: (performance as any).memory.totalJSHeapSize,
        limit: (performance as any).memory.jsHeapSizeLimit,
      } : null;
    });
    
    if (memoryInfo) {
      console.log(`Memory usage: ${(memoryInfo.used / 1024 / 1024).toFixed(2)}MB`);
      // Memory should be reasonable (less than 100MB for a simple page)
      expect(memoryInfo.used).toBeLessThan(100 * 1024 * 1024);
    }
  });
});

