# VoiceFlow AI — Test Plan
## Complete Feature Testing Guide

---

## How to Report Results

For EACH test, report in this format:
```
[PASS/FAIL] Test Name
Screenshot: (if relevant)
Error: (exact error text if FAIL)
Notes: (anything unexpected)
```

Send me results in batches (per section). I'll fix all FAILs immediately.

---

## SECTION 1: Authentication (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | Login | Go to /login, enter shahar@lancelotech.com + password | Redirect to /dashboard |
| 1.2 | Login bad password | Enter wrong password | Error message, stay on login |
| 1.3 | Signup | Go to /signup, create new test user | Redirect to /onboarding |
| 1.4 | Onboarding flow | Complete all onboarding steps | Redirect to /dashboard |
| 1.5 | Logout | Click user avatar → Logout | Redirect to /login |
| 1.6 | Admin sidebar | Login as admin | "Admin" link visible in sidebar |

---

## SECTION 2: Dashboard (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | Dashboard loads | Go to /dashboard | Stats cards visible (Live calls, Calls today, etc.) |
| 2.2 | Recent calls | Check table below stats | Shows recent calls with status badges |
| 2.3 | Usage meter | Check bottom of dashboard (BASIC plan) | Shows minutes used / max |
| 2.4 | Upgrade button | Click upgrade (BASIC only) | Opens billing/checkout |

---

## SECTION 3: Assistants (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | List assistants | Go to /assistants | See "Leny - Lancelot" card |
| 3.2 | Create assistant | Click "New" → fill wizard (all 4 steps) | New assistant created |
| 3.3 | Edit assistant | Click edit on existing assistant | Edit page loads with settings |
| 3.4 | Change voice | Edit → change voice dropdown → Save | Voice saved |
| 3.5 | TTS preview | Edit → click Play button next to voice | Hear voice sample |
| 3.6 | Knowledge base - file | Edit → Knowledge Base tab → upload PDF | File processes successfully |
| 3.7 | Knowledge base - text | Add text knowledge | Text indexed |
| 3.8 | Knowledge base - URL | Add URL knowledge | URL processed |
| 3.9 | Delete assistant | Create temp assistant → delete | Removed from list |

---

## SECTION 4: Phone Numbers (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | List numbers | Go to /phone-numbers | See phone numbers with correct country flags (IL not US) |
| 4.2 | Sync from Twilio | Click Sync button | Numbers refresh |
| 4.3 | Assign to assistant | Click gear → select assistant → Save | Green "assigned" status, no error |
| 4.4 | Country display | Check Israeli numbers (+972) | Show "IL" not "US" |
| 4.5 | Buy number | Go to /phone-numbers/buy → search US → buy | Number added to list |

---

## SECTION 5: Calls (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Calls list | Go to /calls | See call history table |
| 5.2 | Place call - lead selector | Click Place Call → check lead dropdown | Shows saved leads |
| 5.3 | Place call - auto FROM | Select assistant with assigned phone | FROM field auto-fills + locked (green) |
| 5.4 | Place call - execute | Fill TO number → Place Call | Call initiated, SID shown |
| 5.5 | Call detail | Click on a call → /calls/detail | See metadata + conversation |
| 5.6 | Recording playback | Call detail → click play on recording | Audio plays (no Twilio auth popup!) |
| 5.7 | Inbound call | Call the Twilio number from your phone | Bot answers, greeting plays instantly |
| 5.8 | Hebrew conversation | Speak Hebrew to bot | Bot responds in Hebrew, natural sounding |
| 5.9 | English conversation | Speak English to bot | Bot responds in English |
| 5.10 | Greeting latency | Time from answer to hearing greeting | Should be < 2 seconds |

---

## SECTION 6: Leads (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | Leads list | Go to /leads | See leads table |
| 6.2 | Add lead manually | Click Add → fill form → Add Lead | Lead appears in list (no permission error!) |
| 6.3 | Search leads | Type in search box | Filters results |
| 6.4 | Edit lead | Click edit on lead | Edit form works |
| 6.5 | Delete lead | Click delete on lead | Removed from list |
| 6.6 | Bulk upload CSV | Upload CSV with name,phone columns | Leads imported |

---

## SECTION 7: Campaigns (Manual, PRO plan only)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 7.1 | Campaign list | Go to /campaigns | See campaigns or empty state |
| 7.2 | Create campaign | Click New → upload leads → select assistant → create | Campaign created as Draft |
| 7.3 | Start campaign | Click Start on campaign | Status changes to Running |
| 7.4 | Pause campaign | Click Pause | Campaign pauses |
| 7.5 | Campaign detail | Click campaign → detail page | See leads + status per lead |
| 7.6 | BASIC plan locked | Login as basic user → go to /campaigns | Shows upgrade modal |

---

## SECTION 8: Scenarios (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 8.1 | Scenarios list | Go to /scenarios | See scenarios or empty state |
| 8.2 | Create scenario | Click New → enter name | Scenario created |
| 8.3 | Edit - add nodes | Open editor → drag nodes (Say, Gather, Condition) | Nodes added to canvas |
| 8.4 | Connect nodes | Draw edges between nodes | Connections appear |
| 8.5 | Save scenario | Click Save | Saved successfully |
| 8.6 | Delete scenario | Delete from list | Removed |

---

## SECTION 9: Calendar (Manual, PRO plan only)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.1 | Calendar view | Go to /calendar | Monthly calendar displays |
| 9.2 | Appointments | Check if scheduled callbacks appear | Shows on correct dates |
| 9.3 | BASIC locked | Login as basic → /calendar | Shows upgrade modal |

---

## SECTION 10: Analytics (Manual, PRO plan only)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 10.1 | Analytics page | Go to /analytics | Charts display (call volume, status) |
| 10.2 | Charts render | Check bar chart and pie chart | Data renders correctly |
| 10.3 | BASIC locked | Login as basic → /analytics | Shows upgrade modal |

---

## SECTION 11: Billing (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 11.1 | Billing page | Go to /billing | Shows current plan + pricing table |
| 11.2 | Plan comparison | Check feature comparison table | All 3 plans listed |
| 11.3 | Upgrade button | Click Upgrade to Pro | Redirects to Stripe checkout |
| 11.4 | Usage meter | Check minutes used display | Accurate count |

---

## SECTION 12: Settings (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 12.1 | Settings page | Go to /settings | Integration status dashboard |
| 12.2 | Integration check | Click Refresh | Shows green/red per service |
| 12.3 | Admin link | Check admin panel link (admin only) | Link visible and works |

---

## SECTION 13: Admin Panel (Manual, Admin only)

### Users Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.1 | Users list | Admin → Users | All users listed |
| 13.2 | Search users | Type in search | Filters by email/name |
| 13.3 | Toggle user | Suspend a user | Status changes |
| 13.4 | Set role | Promote user to admin | Role updates |
| 13.5 | Create user | Click Create User → fill form | New user created |

### Subscriptions Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.6 | Subscriptions list | Admin → Subscriptions | All subscriptions shown |
| 13.7 | Override plan | Change user plan | Plan updated |

### Plans Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.8 | Plan config | Admin → Plans | Shows limits per plan |
| 13.9 | Edit plan | Change limits → Save | Saved successfully |
| 13.10 | Billing config | Check billing section | Credit amount, validity days |

### API Keys Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.11 | Keys list | Admin → API Keys | Shows all keys |
| 13.12 | Edit key | Update key metadata | Saved |

### System Settings Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.13 | System settings | Admin → Settings | Settings form |
| 13.14 | Update setting | Change a setting → Save | Saved |

### Phone & Integrations Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.15 | All numbers | Admin → Phone | Lists all numbers across users |
| 13.16 | Integration health | Click Check Health | Shows status per service |
| 13.17 | Reassign phone | Reassign number to different user | Updated |

### Pronunciation Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.18 | TTS model selector | Admin → Pronunciation | Voice dropdown with 11 options |
| 13.19 | Test voice | Type text → click Play | Hear TTS preview |
| 13.20 | Save default voice | Select voice → Save as Default | Saved to Firestore |
| 13.21 | Add pronunciation | Add word → phonetic fix → Add | Fix added to list |

### Costs & Revenue Tab
| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.22 | Cost dashboard | Admin → Costs | Summary cards (Cost, Revenue, Profit) |
| 13.23 | Period filter | Switch Today/Week/Month | Data updates |
| 13.24 | Cost by service | Check service breakdown | Twilio, LLM, STT, TTS shown |
| 13.25 | Cost by user | Check user breakdown table | Per-user costs shown |
| 13.26 | Rate card | Check provider costs | Editable rates |
| 13.27 | Edit rate card | Click Edit → change rate → Save | Saved |
| 13.28 | Customer pricing | Check pricing model | Markup % or Fixed $/min |
| 13.29 | Save pricing | Change pricing → Save | Saved |

---

## SECTION 14: Voice Bot Quality (Manual)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 14.1 | Hebrew greeting | Call bot → listen to greeting | Natural Hebrew, correct pronunciation |
| 14.2 | Hebrew conversation | Ask question in Hebrew | Natural response, no English |
| 14.3 | English greeting | Call English assistant | Natural English greeting |
| 14.4 | English conversation | Ask question in English | Natural response |
| 14.5 | Number reading | Ask about pricing/dates | Numbers spoken as words (not digits) |
| 14.6 | Response latency | Time from end of speech to bot response | < 3 seconds |
| 14.7 | Voice consistency | Check greeting vs responses | Same voice throughout |
| 14.8 | Barge-in | Interrupt bot while speaking | Bot stops and listens |

---

## Total: 80+ tests across 14 sections

### Priority Order for Testing:
1. **Section 5 (Calls)** — Core functionality
2. **Section 14 (Voice Bot Quality)** — Key differentiator
3. **Section 6 (Leads)** — Recently fixed
4. **Section 4 (Phone Numbers)** — Recently fixed
5. **Section 3 (Assistants)** — Voice selection fix
6. **Section 13 (Admin Panel)** — Admin features
7. **Section 1 (Auth)** — Basic functionality
8. Rest of sections

### Workflow:
1. Test a section
2. Send me all PASS/FAIL results + screenshots for failures
3. I fix all FAILs
4. Retest FAILs only
5. Move to next section
