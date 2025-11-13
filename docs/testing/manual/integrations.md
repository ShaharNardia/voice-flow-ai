# Integrations Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| INT-01 | Core | Stripe test keys configured | 1. Trigger invoice creation (completed job)<br>2. Observe webhook processing | Webhook acknowledged, invoice status updated |
| INT-02 | Core | Twilio credentials set | 1. Initiate outbound call | Call log entry created with SID |
| INT-03 | Edge | Webhook signature invalid | 1. Replay Stripe event with wrong secret | Request rejected, 400 logged without side effects |
| INT-04 | Edge | Calendar sync disabled | 1. Attempt to sync schedule | User sees informative error and re-auth prompt |

