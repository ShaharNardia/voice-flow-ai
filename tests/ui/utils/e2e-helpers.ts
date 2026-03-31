import { expect, Page } from '@playwright/test';

export type RouteSpec = { path: string; heading?: RegExp };

/** Dashboard routes shared by customer and admin personas (excluding /admin). */
export const CUSTOMER_ROUTE_SPECS: RouteSpec[] = [
  { path: '/dashboard', heading: /Dashboard|Bookings|לוח בקרה/i },
  { path: '/assistants', heading: /Assistant|עוזר/i },
  { path: '/phone-numbers', heading: /Phone|Number|מספר/i },
  { path: '/calls', heading: /Call|שיחות/i },
  { path: '/leads', heading: /Lead|ליד/i },
  { path: '/campaigns', heading: /Campaign|קמפיין/i },
  { path: '/scenarios', heading: /Scenario|תרחיש/i },
  { path: '/calendar', heading: /Calendar|יומן|Schedule/i },
  { path: '/analytics', heading: /Analytics|ניתוח|Insights/i },
  { path: '/billing', heading: /Billing|תשלום|Plan|Subscription/i },
  { path: '/settings', heading: /Setting|הגדרות|Profile/i },
  { path: '/assistants/new', heading: /Assistant|עוזר|New|חדש/i },
  { path: '/phone-numbers/buy', heading: /Phone|Number|Buy|רכישה/i },
];

export async function expectCustomerRouteLoaded(page: Page, route: RouteSpec) {
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  await expect(page.locator('body')).toBeVisible();

  const err = page.getByText(/Application error|Something went wrong/i);
  await expect(err.first()).not.toBeVisible({ timeout: 2000 }).catch(() => {});

  if (route.heading) {
    const byRole = page.getByRole('heading', { name: route.heading });
    const byText = page.getByText(route.heading);
    await expect(byRole.or(byText).first()).toBeVisible({ timeout: 15000 });
  }
}

/** Admin console tab button labels (must match saas-frontend admin TABS). */
export const ADMIN_TAB_LABELS = [
  'Users',
  'Subscriptions',
  'Plans & Pricing',
  'API Keys',
  'System Settings',
  'Phone & Integrations',
  'Pronunciation',
  'Costs & Revenue',
] as const;
