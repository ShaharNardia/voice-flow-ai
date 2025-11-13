# Lead Management Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| LEAD-01 | Smoke | Authenticated user with Leads access | 1. Navigate to `Leads`<br>2. Click `New Lead`<br>3. Fill form<br>4. Save | Lead added to table and Firestore |
| LEAD-02 | Core | Existing lead | 1. Open lead detail<br>2. Convert to Job | Lead status updated to Converted, Job created |
| LEAD-03 | Edge | Duplicate email | 1. Attempt to create lead with same email | System warns or merges depending on config |
| LEAD-04 | Edge | Bulk import CSV | 1. Upload CSV with invalid rows | Errors surfaced per row, valid rows imported |

