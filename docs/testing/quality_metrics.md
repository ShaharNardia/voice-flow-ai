# Quality Metrics & Release Checklist

## Key Performance Indicators

| KPI | Target | Description |
| --- | --- | --- |
| Test Case Execution Coverage | ≥ 95% of planned cases per cycle | (Executed / Planned) |
| Automation Pass Rate | ≥ 98% on smoke suite | Failures must be triaged within 4h |
| Escaped Defects | ≤ 1 per release | Bugs found in production post-release |
| Mean Time To Detect (MTTD) | < 1 day for critical defects | Time from defect creation to detection |
| Mean Time To Resolve (MTTR) | < 2 days for critical defects | Time from detection to fix deployed |
| Code Coverage | ≥ 70% for backend & critical Flutter modules | Enforced via CI |

## Reporting

- **Daily QA Standup**: share execution status, blockers.
- **CI Dashboard**: integrate Playwright, Newman, Flutter reports into a single Grafana/Data Studio board.
- **Defect Dashboard**: Jira filter by severity, include trend lines.
- **Release Readout**: include summary table:

| Metric | Value | Status |
| --- | --- | --- |
| Planned test cases | 120 | ✅ |
| Executed | 118 | ⚠️ |
| Passed | 116 | ✅ |
| Blockers | 0 | ✅ |

## Release Checklist

1. Regression suite executed (manual + automation).
2. All critical/high severity defects closed or waived with approval.
3. Staging environment stable for 24h (monitoring, logs reviewed).
4. Seed data refreshed and validated.
5. Backup of production Firestore/Functions in place.
6. Change log and user comms prepared.
7. Rollback plan documented (`docs/releases/<version>/rollback.md`).
8. Stakeholder sign-off (Product, Engineering, QA).

> Maintain this checklist per release and attach evidence links (reports, Jira queries). Update KPI targets annually.

