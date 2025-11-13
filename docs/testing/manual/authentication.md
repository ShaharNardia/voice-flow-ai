# Authentication & Onboarding Test Cases

| ID | Priority | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| AUTH-01 | Smoke | User not registered | 1. Navigate to `/signup`<br>2. Enter valid company, email, password<br>3. Submit form | User receives verification email, redirected to confirmation screen |
| AUTH-02 | Smoke | Verified account exists | 1. Navigate to `/login`<br>2. Enter valid credentials<br>3. Submit | Dashboard loads with user context stored |
| AUTH-03 | Core | Account exists | 1. Navigate to `/forgot-password`<br>2. Submit registered email<br>3. Follow reset link | Password reset email sent; user can set new password and log in |
| AUTH-04 | Edge | Google OAuth configured | 1. Click `Continue with Google`<br>2. Select Google account | New session created, user record auto-provisioned if first login |
| AUTH-05 | Edge | User suspended flag true | 1. Attempt to login with suspended account | Login blocked with proper error message |

> Update these cases when onboarding flow changes (e.g., additional profile steps). Add screenshots in `docs/testing/screenshots/auth/`.

