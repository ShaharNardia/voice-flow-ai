/**
 * Read all JIRA tickets from PhoneBot project
 */

const https = require('https');

const JIRA_CONFIG = {
  domain: 'lancelotech.atlassian.net',
  email: 'shahar@lancelotech.com',
  apiToken: 'ATATT3xFfGF0RwBQn_kVb4HlS7gwYjsPQCfihao39UFWoErDTCpINZuEEamtOgtBJBNBWACqRbKixy870UtSlpCsqosIaQEq1D_XyE94viZCKPW5g8JXo-D1RFlxg6ulzH5_JG651FuV6u4ntAG41erboOT3Mq7pdGBZu4eXcE48CgVbDPBYfNg=2790AACD',
  projectKey: 'PHON'
};

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`).toString('base64');

    const options = {
      hostname: JIRA_CONFIG.domain,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function getTicketComments(issueKey) {
  try {
    const data = await makeRequest(`/rest/api/3/issue/${issueKey}/comment`);
    return data.comments || [];
  } catch (error) {
    return [];
  }
}

function makePostRequest(path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`).toString('base64');
    const postData = JSON.stringify(body);

    const options = {
      hostname: JIRA_CONFIG.domain,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function getAllTickets() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Reading JIRA Tickets - PhoneBot Project                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Get all issues from PHON project using the new API
    const searchBody = {
      jql: `project = ${JIRA_CONFIG.projectKey} ORDER BY created ASC`,
      maxResults: 100,
      fields: ["summary", "status", "priority", "assignee", "description", "updated", "created", "comment"]
    };
    const data = await makePostRequest('/rest/api/3/search/jql', searchBody);

    console.log(`Found ${data.total} tickets in project ${JIRA_CONFIG.projectKey}\n`);
    console.log('═'.repeat(70));

    for (const issue of data.issues) {
      const key = issue.key;
      const summary = issue.fields.summary;
      const status = issue.fields.status.name;
      const priority = issue.fields.priority?.name || 'None';
      const assignee = issue.fields.assignee?.displayName || 'Unassigned';
      const description = issue.fields.description;
      const updated = issue.fields.updated;
      const created = issue.fields.created;
      
      console.log(`\n📋 ${key}: ${summary}`);
      console.log('─'.repeat(70));
      console.log(`   Status: ${status}`);
      console.log(`   Priority: ${priority}`);
      console.log(`   Assignee: ${assignee}`);
      console.log(`   Created: ${new Date(created).toLocaleString()}`);
      console.log(`   Updated: ${new Date(updated).toLocaleString()}`);
      
      // Check if updated is different from created (indicates changes)
      const createdDate = new Date(created);
      const updatedDate = new Date(updated);
      const hasChanges = (updatedDate - createdDate) > 60000; // More than 1 minute difference
      
      if (hasChanges) {
        console.log(`   ⚠️  HAS UPDATES SINCE CREATION!`);
      }

      // Get comments
      const comments = await getTicketComments(key);
      if (comments.length > 0) {
        console.log(`\n   💬 Comments (${comments.length}):`);
        for (const comment of comments) {
          const author = comment.author?.displayName || 'Unknown';
          const createdAt = new Date(comment.created).toLocaleString();
          let body = '';
          
          // Extract text from Atlassian Document Format
          if (comment.body && comment.body.content) {
            body = extractTextFromADF(comment.body);
          }
          
          console.log(`\n   ┌─ ${author} (${createdAt}):`);
          console.log(`   │  ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`);
          console.log(`   └${'─'.repeat(50)}`);
        }
      }
      
      console.log('');
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY BY STATUS:');
    console.log('═'.repeat(70));
    
    const statusCounts = {};
    const ticketsWithComments = [];
    const ticketsWithUpdates = [];
    
    for (const issue of data.issues) {
      const status = issue.fields.status.name;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      const createdDate = new Date(issue.fields.created);
      const updatedDate = new Date(issue.fields.updated);
      if ((updatedDate - createdDate) > 60000) {
        ticketsWithUpdates.push(issue.key);
      }
    }
    
    for (const [status, count] of Object.entries(statusCounts)) {
      console.log(`  ${status}: ${count} tickets`);
    }
    
    if (ticketsWithUpdates.length > 0) {
      console.log(`\n⚠️  Tickets with updates: ${ticketsWithUpdates.join(', ')}`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

function extractTextFromADF(adf) {
  let text = '';
  
  function traverse(node) {
    if (node.type === 'text') {
      text += node.text;
    }
    if (node.content) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }
  
  traverse(adf);
  return text.trim();
}

getAllTickets().catch(console.error);

