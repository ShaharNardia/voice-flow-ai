# Automation Strategy

## Tooling

| Layer | Tool | Reason |
| --- | --- | --- |
| UI (Web) | Playwright (`tests/ui/`) | Cross-browser, CI-friendly, rich tracing |
| Mobile (Technician app) | Flutter Integration Tests (`integration_test/`) | Runs on emulator, shares Flutter code |
| API | Postman Collection + Newman CLI (`tests/api/`) | Simple assertions & auth flows |
| Backend Logic | Jest (Cloud Functions) | Unit & integration of callable/HTTP functions |

## Repository Structure

```
tests/
  ui/
    playwright.config.ts
    specs/
      auth.spec.ts
      jobs.spec.ts
  api/
    collections/
      staging.postman_collection.json
    environments/
      staging.postman_environment.json
  data/
    fixtures/
      jobs.json
integration_test/
  dispatcher_smoke_test.dart
```

### Environment Variables

Use `.env.test` for Playwright:
```
BASE_URL=https://staging.voiceflow-ai.app
FIREBASE_API_KEY=...
```
Load via `dotenv` in config.

## Smoke Suite Scope

- Login (Email + Google)
- Dashboard KPI assertion
- Create job, assign technician, complete job
- Billing invoices visible

CI command:
```bash
npx playwright test --config tests/ui/playwright.config.ts --project=chromium --grep "@smoke"
newman run tests/api/collections/staging.postman_collection.json -e tests/api/environments/staging.postman_environment.json
flutter test integration_test/dispatcher_smoke_test.dart -d linux
```

## Test Data Management

- Leverage staging seed script (see `docs/testing/qa_environment.md`).
- For UI tests, use fixtures to restore data via Firebase Admin REST between runs.
- Keep deterministic IDs to avoid flaky selectors.

## Reporting

- Publish Playwright HTML report artifact.
- Capture Newman junit report for CI (export `--reporters cli,junit`).
- Store Flutter integration logcat output for debugging.

