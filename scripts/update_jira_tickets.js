/**
 * Update JIRA tickets with fix information and reassign to Chen
 */

const https = require('https');

const JIRA_CONFIG = {
  domain: 'lancelotech.atlassian.net',
  email: 'shahar@lancelotech.com',
  apiToken: process.env.JIRA_API_TOKEN || 'ATATT3xFfGF0RwBQn_kVb4HlS7gwYjsPQCfihao39UFWoErDTCpINZuEEamtOgtBJBNBWACqRbKixy870UtSlpCsqosIaQEq1D_XyE94viZCKPW5g8JXo-D1RFlxg6ulzH5_JG651FuV6u4ntAG41erboOT3Mq7pdGBZu4eXcE48CgVbDPBYfNg=2790AACD'
};

// Tickets to update with their fix descriptions
const TICKETS_TO_UPDATE = [
  {
    key: 'PHON-16',
    comment: `✅ תוקן ופורסם!

**הבעיה:** לא היה כפתור חזרה בעמודים ScenarioList ו-Startup4

**הפתרון:**
1. הוספתי IconButton עם חץ חזרה (arrow_back_rounded) לעמוד ScenarioList
2. הוספתי כפתור חזרה לעמוד Startup4 כשנגישים אליו כעמוד ראשי (mainpage=true)

**קבצים שעודכנו:**
- lib/pages/scenarios/scenario_list/scenario_list_widget.dart
- lib/pages/onboarding/startup4/startup4_widget.dart

**נבדק ופורסם ב:** ${new Date().toLocaleDateString('he-IL')}

הכפתור מופיע עכשיו בכותרת העמוד ומאפשר חזרה למסך הקודם.`
  },
  {
    key: 'PHON-18',
    comment: `✅ תוקן ופורסם!

**הבעיה:** לא ניתן לרכוש מספר טלפון

**הפתרון:**
1. שיפרתי את ה-error handling ברכיב BuyNumberComponent
2. הוספתי loading indicator במהלך קריאת ה-API
3. הוספתי הודעות שגיאה מפורטות יותר

**קובץ שעודכן:**
- lib/pages/calls/phone_number/buy_number_component/buy_number_component_widget.dart

**נבדק ופורסם ב:** ${new Date().toLocaleDateString('he-IL')}

עכשיו המשתמש יראה הודעת שגיאה ברורה אם יש בעיה ברכישה.`
  },
  {
    key: 'PHON-19',
    comment: `✅ תוקן ופורסם!

**הבעיה:** שלב הבחירה של החבילה לא נותן להמשיך לתשלום

**הפתרון:**
1. הוספתי בדיקה לוודא ש-stripeCustomerId קיים לפני יצירת session
2. אם ה-customerId חסר, המערכת יוצרת לקוח Stripe חדש אוטומטית
3. הוספתי מניעה של המשך אם יצירת הלקוח נכשלה

**קובץ שעודכן:**
- lib/pages/onboarding/startup6/startup6_widget.dart

**נבדק ופורסם ב:** ${new Date().toLocaleDateString('he-IL')}

תהליך התשלום עובד כעת תקין - בדקתי והמנוי מופיע כפעיל (Subscription Activated).`
  }
];

// Chen's account ID (we'll fetch it)
let CHEN_ACCOUNT_ID = null;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`).toString('base64');

    const options = {
      hostname: JIRA_CONFIG.domain,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve(data);
          }
        } else {
          reject({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function findChenAccountId() {
  try {
    // Get the issue PHON-16 which is currently assigned to Chen in some tickets
    const issue = await makeRequest('GET', '/rest/api/3/issue/PHON-2');
    if (issue.fields.assignee && issue.fields.assignee.displayName.includes('Chen')) {
      CHEN_ACCOUNT_ID = issue.fields.assignee.accountId;
      console.log(`Found Chen's account ID: ${CHEN_ACCOUNT_ID}`);
      return CHEN_ACCOUNT_ID;
    }
  } catch (error) {
    console.log('Could not find Chen account ID from issues');
  }
  return null;
}

async function addComment(issueKey, commentText) {
  const body = {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: commentText
            }
          ]
        }
      ]
    }
  };

  return await makeRequest('POST', `/rest/api/3/issue/${issueKey}/comment`, body);
}

async function assignToUser(issueKey, accountId) {
  const body = {
    accountId: accountId
  };

  return await makeRequest('PUT', `/rest/api/3/issue/${issueKey}/assignee`, body);
}

async function getTransitions(issueKey) {
  return await makeRequest('GET', `/rest/api/3/issue/${issueKey}/transitions`);
}

async function transitionIssue(issueKey, transitionId) {
  const body = {
    transition: {
      id: transitionId
    }
  };

  return await makeRequest('POST', `/rest/api/3/issue/${issueKey}/transitions`, body);
}

async function updateTickets() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Updating JIRA Tickets with Fix Information             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // First, find Chen's account ID
  await findChenAccountId();

  for (const ticket of TICKETS_TO_UPDATE) {
    console.log(`\n📝 Updating ${ticket.key}...`);
    console.log('─'.repeat(50));

    try {
      // 1. Add comment
      console.log('   Adding comment...');
      await addComment(ticket.key, ticket.comment);
      console.log('   ✅ Comment added');

      // 2. Assign to Chen
      if (CHEN_ACCOUNT_ID) {
        console.log('   Assigning to Chen...');
        await assignToUser(ticket.key, CHEN_ACCOUNT_ID);
        console.log('   ✅ Assigned to Chen');
      }

      // 3. Get available transitions
      console.log('   Getting transitions...');
      const transitions = await getTransitions(ticket.key);
      console.log(`   Available transitions: ${transitions.transitions.map(t => `${t.name}(${t.id})`).join(', ')}`);

      // 4. Find "Done" or "Resolved" transition
      const doneTransition = transitions.transitions.find(t => 
        t.name.toLowerCase().includes('done') || 
        t.name.toLowerCase().includes('resolved') ||
        t.name.toLowerCase().includes('complete')
      );

      if (doneTransition) {
        console.log(`   Transitioning to ${doneTransition.name}...`);
        await transitionIssue(ticket.key, doneTransition.id);
        console.log(`   ✅ Transitioned to ${doneTransition.name}`);
      } else {
        console.log('   ⚠️  No "Done" transition found');
      }

      console.log(`\n   ✅ ${ticket.key} updated successfully!`);

    } catch (error) {
      console.log(`   ❌ Error updating ${ticket.key}:`, error);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('All tickets updated!');
}

updateTickets().catch(console.error);

