# Smoke Automation Suite

## UI (Playwright)

| Spec | Tag | Description |
| --- | --- | --- |
| `auth.spec.ts` | `@smoke` | Login email/password, Google OAuth |
| `jobs.spec.ts` | `@smoke` | Create job, assign technician, complete workflow |
| `billing.spec.ts` | `@smoke` | Verify invoices rendered for seeded customer |

### Example Outline (`jobs.spec.ts`)
```ts
test.describe('Jobs smoke', () => {
  test.use({ storageState: 'storage-state.json' });

  test('create job end-to-end @smoke', async ({ page }) => {
    await page.goto(`${process.env.BASE_URL}/bookings`);
    await page.getByRole('button', { name: 'New Booking' }).click();
    await page.fill('[name="customerName"]', 'QA Smoke');
    await page.click('text=Save');
    await expect(page.getByText('QA Smoke')).toBeVisible();
  });
});
```

## API (Postman/Newman)

Collection: `tests/api/collections/staging.postman_collection.json`

| Folder | Purpose |
| --- | --- |
| `Auth` | obtain Firebase ID token |
| `Jobs` | CRUD endpoints (`/jobs`, `/jobs/{id}`) |
| `Billing` | `/stripe/invoices` read-only verification |

CI command:
```bash
newman run tests/api/collections/staging.postman_collection.json \
  -e tests/api/environments/staging.postman_environment.json \
  --reporters cli,junit --reporter-junit-export reports/newman.xml
```

## Flutter Integration

File: `integration_test/dispatcher_smoke_test.dart`

Flow: login dispatcher ➜ open bookings ➜ confirm seeded job cards ➜ mark job completed (mock backend).

Run on CI with `flutter test integration_test/dispatcher_smoke_test.dart -d linux`.

## Maintenance

- Tag additional specs with `@regression` to expand coverage later.
- Keep runtime under 10 minutes for pipeline efficiency.
- Update baseline screenshots/selectors after UI changes.

