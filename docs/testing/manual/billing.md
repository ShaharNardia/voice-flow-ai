# Billing & Subscription Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| BILL-01 | Smoke | Stripe customer linked | 1. Navigate to `Billing`<br>2. Observe invoice table | Invoices fetched, totals match Stripe |
| BILL-02 | Core | Active subscription | 1. Click `Upgrade`<br>2. Select plan<br>3. Confirm payment | Subscription updated, confirmation message shown |
| BILL-03 | Core | Payment method available | 1. Click `Update Payment`<br>2. Submit new card | Stripe setup intent succeeds, card saved |
| BILL-04 | Edge | Overdue account | 1. Simulate failed payment (Stripe test card)<br>2. Refresh billing page | Overdue badge displayed, retry option available |

