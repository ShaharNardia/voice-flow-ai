# Jobs / Bookings Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| JOB-01 | Smoke | Authenticated, role Dispatcher | 1. Go to `Bookings`<br>2. Click `New Booking`<br>3. Fill minimal fields<br>4. Save | Job created, appears in table and Firestore |
| JOB-02 | Core | Job exists, technician available | 1. Select job<br>2. Click `Assign Technician`<br>3. Choose tech<br>4. Confirm | Technician assignment saved, notification sent |
| JOB-03 | Core | Job scheduled | 1. Open job details<br>2. Edit schedule date/time<br>3. Save | Calendar updated, change reflected in timeline |
| JOB-04 | Edge | Status Completed | 1. Set job status to `Completed` | Job locked for edits except notes; invoice triggers if configured |
| JOB-05 | Edge | Cancel Scenario | 1. Cancel job<br>2. Provide reason | Job flagged as canceled, audit log entry created |

