# Dashboard Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| DASH-01 | Smoke | Authenticated user | 1. Login<br>2. Navigate to `/dashboard` | KPI widgets load correct totals for company |
| DASH-02 | Core | Jobs exist | 1. Observe `Active Bookings` widget<br>2. Cross-check count via Jobs collection | Count matches Firestore query results |
| DASH-03 | Core | Recent activity available | 1. Scroll to activity feed | Feed shows latest 20 events sorted by timestamp |
| DASH-04 | Edge | User with no jobs | 1. Login as new user | Dashboard displays empty states without errors |

