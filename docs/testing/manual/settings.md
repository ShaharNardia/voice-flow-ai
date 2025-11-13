# Settings & Administration Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| SET-01 | Core | Admin user | 1. Go to `Settings` ➜ `Team`<br>2. Invite new member<br>3. Assign role | Invite email sent, role stored |
| SET-02 | Core | Existing member | 1. Edit member role | Permissions update, change reflected immediately |
| SET-03 | Edge | Remove self | 1. Attempt to remove own Admin account | Operation blocked with warning |
| SET-04 | Edge | Update company info | 1. Modify company profile fields<br>2. Save | Firestore document updated, visible in navbar |

