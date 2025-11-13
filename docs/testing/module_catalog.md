# Module & Flow Inventory

| Module | Key Flows | Business Owner | Technical Owner | Notes |
| --- | --- | --- | --- | --- |
| Authentication & Onboarding | Signup ➜ Email Verify ➜ Profile Setup; Login (Email/Google); Forgot Password | Product Manager | Auth Lead | PRD-Auth-01 |
| Dashboard Overview | Summary KPIs; Recent Activity Feed; Quick Actions | Operations Lead | Frontend Lead | PRD-Core-02 |
| Bookings / Jobs Management | Create/Edit Job; Assign Technician; Change Status; Reschedule | Dispatch Manager | Backend Lead | PRD-Jobs-10 |
| Dispatch Console | Technician Availability; Call Logs Sync; Messaging | Dispatch Manager | Realtime Service Lead | PRD-Dispatch-05 |
| Lead Management | Capture Lead; Convert to Job; Tag & Follow-up | Sales Lead | Backend Lead | PRD-Leads-07 |
| Billing & Subscription | View Invoices; Update Payment Method; Upgrade Plan | Finance Lead | Billing Integrations | PRD-Billing-03 |
| Settings / Admin | Company Profile; Team Access; Roles & Permissions | Admin Lead | Platform Lead | PRD-Settings-06 |
| Help & Live Guide | Guided Tour; FAQ; Support Contact | CS Lead | Frontend Lead | PRD-Docs-04 |
| Integrations | Stripe Webhooks; Twilio Calls; Calendar Sync | Partner Manager | Integrations Lead | PRD-Integrations-11 |

## Traceability Matrix (Snapshot)

| Requirement ID | Linked Flows | Test Case Doc | Coverage Status |
| --- | --- | --- | --- |
| PRD-Auth-01 | Signup, Login, Forgot Password | `docs/testing/manual/authentication.md` | Draft |
| PRD-Core-02 | Dashboard KPI Load, Quick Actions | `docs/testing/manual/dashboard.md` | Draft |
| PRD-Jobs-10 | Job CRUD, Assignment, Status | `docs/testing/manual/jobs.md` | Draft |
| PRD-Dispatch-05 | Technician Roster, Call Log Sync | `docs/testing/manual/dispatch.md` | Draft |
| PRD-Leads-07 | Lead Capture, Conversion | `docs/testing/manual/leads.md` | Draft |
| PRD-Billing-03 | Invoice Listing, Payment Update | `docs/testing/manual/billing.md` | Draft |
| PRD-Settings-06 | Team Roles, Profile Update | `docs/testing/manual/settings.md` | Draft |
| PRD-Docs-04 | Help Tour, FAQ Access | `docs/testing/manual/help.md` | Draft |
| PRD-Integrations-11 | Stripe Webhook, Twilio Call | `docs/testing/manual/integrations.md` | Draft |

> Maintain this table alongside the manual test repository to keep feature-to-test traceability current.

