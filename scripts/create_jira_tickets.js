/**
 * JIRA Ticket Creator Script
 * Creates QA test tickets for Voice Flow AI Pre-Production testing
 */

const https = require('https');

// JIRA Configuration
const JIRA_CONFIG = {
  domain: 'lancelotech.atlassian.net',
  email: 'shahar@lancelotech.com',
  apiToken: process.env.JIRA_API_TOKEN || 'YOUR_API_TOKEN_HERE',
  projectKey: 'PHON'
};

// Tickets to create
const TICKETS = [
  {
    id: 'QA-001',
    summary: 'QA-001: בדיקת התחברות והרשמה',
    priority: 'Highest',
    labels: ['qa', 'authentication', 'smoke-test'],
    description: `h2. תיאור
בדיקת כל תהליכי האימות במערכת - התחברות, הרשמה, שחזור סיסמה.

h2. Acceptance Criteria

* *AC1:* התחברות עם אימייל וסיסמה עובדת
** התחבר עם: info@lancelotech.com / Lancelotech2025!
** וודא ניתוב לדאשבורד לאחר התחברות

* *AC2:* הודעת שגיאה מוצגת עבור פרטים שגויים
** נסה להתחבר עם סיסמה שגויה
** וודא שמוצגת הודעת שגיאה ברורה

* *AC3:* תהליך שחזור סיסמה עובד
** לחץ על "שכחתי סיסמה"
** הזן אימייל קיים
** וודא שנשלח מייל שחזור

* *AC4:* תהליך הרשמה עובד (אם רלוונטי)
** נווט למסך הרשמה
** מלא פרטים תקינים
** וודא קבלת מייל אימות

* *AC5:* התנתקות מהמערכת עובדת
** לחץ על כפתור ההתנתקות
** וודא שהמשתמש מנותב למסך התחברות

h2. Test Data
{code}
אימייל: info@lancelotech.com
סיסמה: Lancelotech2025!
{code}

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-002',
    summary: 'QA-002: בדיקת דאשבורד ראשי',
    priority: 'High',
    labels: ['qa', 'dashboard', 'smoke-test'],
    description: `h2. תיאור
בדיקת טעינת הדאשבורד הראשי, הצגת KPIs ופעולות מהירות.

h2. Acceptance Criteria

* *AC1:* הדאשבורד נטען ללא שגיאות
** לאחר התחברות, הדאשבורד מוצג
** אין שגיאות בקונסול הדפדפן

* *AC2:* KPI Widgets מציגים נתונים
** וידג'ט הזמנות פעילות מציג מספר
** וידג'ט לידים מציג מספר
** וידג'ט שיחות מציג נתונים

* *AC3:* פעולות מהירות עובדות
** כפתורי פעולה מהירה נגישים
** לחיצה על כפתור מנווטת לעמוד הנכון

* *AC4:* פיד פעילות אחרונה מוצג
** רשימת אירועים אחרונים מוצגת
** הרשימה ממוינת לפי תאריך

h2. זמן משוער
1 שעה`
  },
  {
    id: 'QA-003',
    summary: 'QA-003: בדיקת ניהול עוזרים (Assistants)',
    priority: 'Highest',
    labels: ['qa', 'assistants', 'core-feature'],
    description: `h2. תיאור
בדיקת CRUD מלא עבור עוזרי AI - יצירה, צפייה, עריכה ומחיקה.

h2. Acceptance Criteria

* *AC1:* רשימת עוזרים מוצגת
** נווט לעמוד Assistants
** רשימה של כל העוזרים מוצגת

* *AC2:* יצירת עוזר חדש
** לחץ על "Create Assistant"
** מלא שם ותיאור
** הגדר פרמטרים (קול, שפה, הנחיות)
** שמור ווודא שהעוזר נוסף לרשימה

* *AC3:* עריכת עוזר קיים
** בחר עוזר מהרשימה
** ערוך את השם או התיאור
** שמור ווודא שהשינויים נשמרו

* *AC4:* מחיקת עוזר
** בחר עוזר למחיקה
** אשר את המחיקה
** וודא שהעוזר הוסר מהרשימה

* *AC5:* הקצאת עוזר למספר טלפון
** בחר עוזר
** הקצה אותו למספר טלפון
** וודא שההקצאה נשמרה

h2. זמן משוער
3 שעות`
  },
  {
    id: 'QA-004',
    summary: 'QA-004: בדיקת ניהול שיחות',
    priority: 'Highest',
    labels: ['qa', 'calls', 'twilio'],
    description: `h2. תיאור
בדיקת מערכת השיחות - לוגים, ביצוע שיחות, והקלטות.

h2. Acceptance Criteria

* *AC1:* צפייה בלוג שיחות
** נווט ל-Call Logs
** רשימת שיחות מוצגת עם פרטים
** סינון לפי תאריך עובד

* *AC2:* צפייה בפרטי שיחה
** לחץ על שיחה מהרשימה
** פרטים מלאים מוצגים (משך, סטטוס, תמלול)

* *AC3:* ביצוע שיחה יוצאת (אם רלוונטי)
** לחץ על "Place Call"
** בחר מספר יעד ועוזר
** וודא שהשיחה מתחילה

* *AC4:* צפייה בהקלטות (אם זמינות)
** פתח שיחה עם הקלטה
** נגן את ההקלטה

* *AC5:* תיעוד סיום שיחה נשמר נכון
** בצע שיחה
** וודא שהפרטים נשמרים בסיום

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-005',
    summary: 'QA-005: בדיקת ניהול לידים',
    priority: 'High',
    labels: ['qa', 'leads', 'crm'],
    description: `h2. תיאור
בדיקת מערכת ניהול הלידים - הוספה, עריכה, והמרה לעבודות.

h2. Acceptance Criteria

* *AC1:* צפייה ברשימת לידים
** נווט ל-Leads
** רשימת לידים מוצגת
** סינון וחיפוש עובדים

* *AC2:* הוספת ליד חדש
** לחץ על "Add Lead"
** מלא פרטי לקוח (שם, טלפון, אימייל)
** שמור ווודא שהליד נוסף

* *AC3:* עריכת ליד קיים
** בחר ליד מהרשימה
** ערוך פרטים
** שמור ווודא שהשינויים נשמרו

* *AC4:* העלאה המונית (Bulk Upload)
** הכן קובץ CSV עם לידים
** העלה את הקובץ
** וודא שכל הלידים נוספו

* *AC5:* המרת ליד לעבודה
** בחר ליד
** לחץ על "Convert to Job"
** וודא שנוצרה עבודה חדשה

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-006',
    summary: 'QA-006: בדיקת ניהול הזמנות/עבודות',
    priority: 'High',
    labels: ['qa', 'jobs', 'bookings'],
    description: `h2. תיאור
בדיקת מערכת הזמנות ועבודות - יצירה, הקצאה, ועדכון סטטוס.

h2. Acceptance Criteria

* *AC1:* צפייה ברשימת עבודות
** נווט ל-Bookings
** רשימת עבודות מוצגת
** סינון לפי סטטוס עובד

* *AC2:* יצירת עבודה חדשה
** לחץ על "New Booking"
** מלא פרטי לקוח ועבודה
** שמור ווודא שהעבודה נוספה

* *AC3:* הקצאת טכנאי לעבודה
** בחר עבודה
** הקצה טכנאי
** וודא שההקצאה נשמרה

* *AC4:* עדכון סטטוס עבודה
** שנה סטטוס (פתוח → בעבודה → הושלם)
** וודא שהסטטוס מתעדכן בזמן אמת

* *AC5:* תזמון מחדש (Reschedule)
** בחר עבודה
** שנה תאריך ושעה
** וודא שהשינוי נשמר

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-007',
    summary: 'QA-007: בדיקת ניהול טכנאים',
    priority: 'Medium',
    labels: ['qa', 'technicians', 'team'],
    description: `h2. תיאור
בדיקת מערכת ניהול טכנאים - הוספה, זמינות, וביצועים.

h2. Acceptance Criteria

* *AC1:* צפייה ברשימת טכנאים
** נווט ל-Technicians/Professionals
** רשימה מוצגת עם פרטים

* *AC2:* הוספת טכנאי חדש
** לחץ על "Add Professional"
** מלא פרטים
** שמור ווודא שנוסף

* *AC3:* עריכת פרטי טכנאי
** בחר טכנאי
** ערוך פרטים
** שמור

* *AC4:* צפייה בזמינות
** צפה בלוח זמינות
** וודא שמידע מוצג נכון

h2. זמן משוער
1 שעה`
  },
  {
    id: 'QA-008',
    summary: 'QA-008: בדיקת חיובים ותשלומים',
    priority: 'Highest',
    labels: ['qa', 'billing', 'stripe'],
    description: `h2. תיאור
בדיקת מערכת החיובים - צפייה בחשבוניות ועדכון אמצעי תשלום.

h2. Acceptance Criteria

* *AC1:* צפייה בחשבוניות
** נווט ל-Billing
** רשימת חשבוניות מוצגת
** פרטים (סכום, תאריך, סטטוס) נכונים

* *AC2:* צפייה בפרטי מנוי
** מידע על המנוי הנוכחי מוצג
** תאריך חידוש, סוג תוכנית

* *AC3:* עדכון אמצעי תשלום
** לחץ על עדכון כרטיס
** הזן פרטי כרטיס בדיקה (Stripe Test)
** וודא שעדכון נשמר

* *AC4:* שדרוג תוכנית
** בחר תוכנית חדשה
** וודא שהתהליך מתחיל

* *AC5:* הורדת חשבונית
** לחץ על הורדת PDF
** וודא שקובץ תקין יורד

h2. Test Data - Stripe
{code}
כרטיס בדיקה: 4242 4242 4242 4242
תוקף: כל תאריך עתידי
CVC: כל 3 ספרות
{code}

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-009',
    summary: 'QA-009: בדיקת הגדרות מערכת',
    priority: 'Medium',
    labels: ['qa', 'settings', 'profile'],
    description: `h2. תיאור
בדיקת הגדרות פרופיל, חברה והרשאות.

h2. Acceptance Criteria

* *AC1:* עדכון פרטי פרופיל אישי
** נווט ל-Profile
** שנה שם תצוגה
** שמור ווודא שינוי

* *AC2:* שינוי סיסמה
** לחץ על Change Password
** הזן סיסמה ישנה וחדשה
** וודא שהסיסמה השתנתה

* *AC3:* עדכון פרטי חברה
** נווט להגדרות חברה
** עדכן שם או פרטים
** שמור

* *AC4:* ניהול משתמשים (Admin)
** צפה ברשימת משתמשים
** וודא שהרשאות מוצגות נכון

h2. זמן משוער
1 שעה`
  },
  {
    id: 'QA-010',
    summary: 'QA-010: בדיקת מספרי טלפון',
    priority: 'High',
    labels: ['qa', 'phone-numbers', 'twilio'],
    description: `h2. תיאור
בדיקת ניהול מספרי טלפון - צפייה, הגדרה ותצורה.

h2. Acceptance Criteria

* *AC1:* צפייה במספרי טלפון
** נווט ל-Phone Numbers
** רשימת מספרים מוצגת

* *AC2:* הגדרת מספר
** בחר מספר
** הקצה עוזר
** שמור תצורה

* *AC3:* חיפוש מספרים זמינים (אם רלוונטי)
** חפש מספרים לרכישה
** תוצאות מוצגות

* *AC4:* הגדרות ניתוב שיחות
** הגדר ניתוב
** שמור ווודא

h2. זמן משוער
1.5 שעות`
  },
  {
    id: 'QA-011',
    summary: 'QA-011: בדיקת ביצועים ועומסים',
    priority: 'High',
    labels: ['qa', 'performance', 'load-test'],
    description: `h2. תיאור
בדיקת זמני תגובה ויציבות המערכת תחת עומס.

h2. Acceptance Criteria

* *AC1:* זמן טעינת דפים < 3 שניות
** מדוד זמן טעינה של דאשבורד
** מדוד זמן טעינה של רשימות

* *AC2:* אין Memory Leaks בניווט
** נווט בין עמודים
** בדוק צריכת זיכרון בדפדפן

* *AC3:* גלילה חלקה ברשימות גדולות
** פתח רשימה עם 100+ פריטים
** וודא גלילה חלקה

* *AC4:* תגובה תחת עומס
** בצע מספר פעולות במקביל
** וודא שהמערכת יציבה

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-012',
    summary: 'QA-012: בדיקת אבטחה בסיסית',
    priority: 'Highest',
    labels: ['qa', 'security', 'critical'],
    description: `h2. תיאור
בדיקות אבטחה בסיסיות לפני עלייה ל-Production.

h2. Acceptance Criteria

* *AC1:* אין גישה ללא התחברות
** נסה לגשת ישירות לכתובות פנימיות
** וודא ניתוב להתחברות

* *AC2:* Session נמחק בהתנתקות
** התנתק
** נסה ללחוץ "חזור" בדפדפן
** וודא שאין גישה

* *AC3:* הרשאות תקינות
** משתמש רגיל לא יכול לגשת ל-Admin
** וודא הפרדת הרשאות

* *AC4:* אין מידע רגיש בקונסול
** פתח Developer Console
** וודא שאין סיסמאות/טוקנים מודפסים

* *AC5:* HTTPS פעיל
** וודא שהאתר רץ על HTTPS
** וודא תעודה תקפה

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-013',
    summary: 'QA-013: בדיקת תאימות דפדפנים',
    priority: 'Medium',
    labels: ['qa', 'cross-browser', 'compatibility'],
    description: `h2. תיאור
בדיקת תאימות לדפדפנים עיקריים.

h2. Acceptance Criteria

* *AC1:* Chrome - כל הפונקציות עובדות
* *AC2:* Firefox - כל הפונקציות עובדות
* *AC3:* Safari - כל הפונקציות עובדות
* *AC4:* Edge - כל הפונקציות עובדות
* *AC5:* Mobile (Chrome/Safari) - התאמה ותצוגה נכונה

h2. זמן משוער
2 שעות`
  },
  {
    id: 'QA-014',
    summary: 'QA-014: בדיקת E2E - תהליך מלא',
    priority: 'Highest',
    labels: ['qa', 'e2e', 'regression', 'critical'],
    description: `h2. תיאור
בדיקת End-to-End של תהליך עסקי מלא מקבלת ליד ועד סגירת עבודה.

h2. Acceptance Criteria

* *AC1:* תהליך מלא עובר בהצלחה:

{code}
1. התחברות למערכת
   ↓
2. קבלת ליד חדש (ידני או משיחה)
   ↓
3. עריכת פרטי הליד
   ↓
4. המרת הליד לעבודה
   ↓
5. הקצאת טכנאי לעבודה
   ↓
6. עדכון סטטוס ל"בעבודה"
   ↓
7. השלמת העבודה
   ↓
8. צפייה בעבודה המושלמת בהיסטוריה
{code}

* *AC2:* כל הנתונים נשמרים נכון ב-DB
* *AC3:* לוגים נוצרים לכל הפעולות
* *AC4:* אין שגיאות לאורך כל התהליך

h2. זמן משוער
3 שעות`
  }
];

// Priority mapping for JIRA
const PRIORITY_MAP = {
  'Highest': '1',
  'High': '2',
  'Medium': '3',
  'Low': '4',
  'Lowest': '5'
};

// Create a single ticket
function createTicket(ticket) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`).toString('base64');
    
    const issueData = {
      fields: {
        project: {
          key: JIRA_CONFIG.projectKey
        },
        summary: ticket.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: ticket.description
                }
              ]
            }
          ]
        },
        issuetype: {
          name: 'Task'
        },
        labels: ticket.labels
      }
    };

    const postData = JSON.stringify(issueData);

    const options = {
      hostname: JIRA_CONFIG.domain,
      port: 443,
      path: '/rest/api/3/issue',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 201) {
          const response = JSON.parse(data);
          resolve({
            success: true,
            id: ticket.id,
            key: response.key,
            url: `https://${JIRA_CONFIG.domain}/browse/${response.key}`
          });
        } else {
          reject({
            success: false,
            id: ticket.id,
            statusCode: res.statusCode,
            error: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject({
        success: false,
        id: ticket.id,
        error: error.message
      });
    });

    req.write(postData);
    req.end();
  });
}

// Main function to create all tickets
async function createAllTickets() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     JIRA Ticket Creator - Voice Flow AI QA Tickets        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Project: ${JIRA_CONFIG.projectKey}`);
  console.log(`Domain: ${JIRA_CONFIG.domain}`);
  console.log(`Total tickets to create: ${TICKETS.length}`);
  console.log('');
  console.log('Creating tickets...');
  console.log('─'.repeat(60));

  const results = {
    success: [],
    failed: []
  };

  for (let i = 0; i < TICKETS.length; i++) {
    const ticket = TICKETS[i];
    console.log(`\n[${i + 1}/${TICKETS.length}] Creating: ${ticket.summary}`);
    
    try {
      const result = await createTicket(ticket);
      results.success.push(result);
      console.log(`   ✅ Created: ${result.key}`);
      console.log(`   🔗 ${result.url}`);
    } catch (error) {
      results.failed.push(error);
      console.log(`   ❌ Failed: ${error.error}`);
    }
    
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✅ Successfully created: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log('');

  if (results.success.length > 0) {
    console.log('Created Tickets:');
    results.success.forEach(r => {
      console.log(`  • ${r.key}: ${r.url}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\nFailed Tickets:');
    results.failed.forEach(r => {
      console.log(`  • ${r.id}: ${r.error}`);
    });
  }

  console.log('\n✨ Done!');
}

// Run the script
createAllTickets().catch(console.error);

