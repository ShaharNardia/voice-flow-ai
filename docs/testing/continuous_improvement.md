# Continuous Improvement Plan

## Cadence

- **Sprint Retrospective (bi-weekly)**: include QA topic to review execution metrics, flaky tests, environment issues.
- **Quarterly QA Summit**: evaluate toolchain, update KPIs, plan automation roadmap.
- **Release Postmortem**: run whenever a critical/major defect escapes release.

## Action Items

1. Maintain backlog of tech debt & test coverage gaps in Jira (`QA Improvements` board).
2. Require Definition of Done to include:
   - Updated/added manual test cases.
   - Automation coverage assessment.
   - Documentation updates (Help, training, user comms).
3. Rotate QA champion per quarter responsible for enforcement and reporting.

## Review Process

- Use shared `docs/testing/status/qa_scorecard.xlsx` to track metrics by sprint.
- Conduct monthly audit of test suite (remove flaky tests, refactor selectors).
- Tag lessons learned in Confluence/Notion knowledge base.

## Feedback Loop

- Provide feedback form (`Support → Feedback`) linking to QA board for new scenarios.
- Collect user feedback from support tickets and map to missing test coverage.
- Celebrate wins (zero escaped defects) in company all-hands to reinforce quality culture.

