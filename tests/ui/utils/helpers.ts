import { Page, expect } from '@playwright/test';

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Wait for element to be visible with retry
 */
export async function waitForVisible(page: Page, selector: string, timeout = 10000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Fill form field safely
 */
export async function fillField(page: Page, placeholder: string | RegExp, value: string) {
  const field = page.getByPlaceholder(placeholder);
  await field.waitFor({ state: 'visible', timeout: 5000 });
  await field.fill(value);
}

/**
 * Click button safely
 */
export async function clickButton(page: Page, name: string | RegExp) {
  const button = page.getByRole('button', { name });
  await button.waitFor({ state: 'visible', timeout: 5000 });
  await button.click();
}

/**
 * Check if element contains text
 */
export async function expectText(page: Page, text: string | RegExp) {
  await expect(page.locator(`text=${text}`)).toBeVisible({ timeout: 5000 });
}

/**
 * Navigate to page
 */
export async function navigateTo(page: Page, path: string) {
  const baseUrl = process.env.BASE_URL ?? '';
  await page.goto(`${baseUrl}${path}`);
  await waitForPageLoad(page);
}

/**
 * Take screenshot for debugging
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/${name}-${Date.now()}.png`, fullPage: true });
}

/**
 * Wait for API call to complete
 */
export async function waitForApiCall(page: Page, urlPattern: string | RegExp) {
  await page.waitForResponse((response) => {
    const url = response.url();
    return typeof urlPattern === 'string' 
      ? url.includes(urlPattern)
      : urlPattern.test(url);
  }, { timeout: 10000 });
}

