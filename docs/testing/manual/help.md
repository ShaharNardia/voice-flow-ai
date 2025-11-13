# Help & Live Guide Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| HELP-01 | Smoke | Authenticated user | 1. Open `Help` page | Guide tiles render with descriptions |
| HELP-02 | Core | Live guide configured | 1. Click `Getting Started Guide` | Embedded walkthrough loads inside modal |
| HELP-03 | Edge | Offline mode | 1. Disable network<br>2. Refresh help page | Cached FAQ shown or graceful error |
| HELP-04 | Edge | Accessibility | 1. Tab through help controls | Focus order logical, ARIA labels present |

