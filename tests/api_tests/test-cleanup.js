/**
 * Test Cleanup Utilities
 * Cleans up test data after tests run
 */

const axios = require('axios');

const BASE_URL = process.env.FIREBASE_FUNCTIONS_URL || 'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';

/**
 * Cleanup test assistants
 */
async function cleanupTestAssistants(assistantIds = []) {
  console.log('Cleaning up test assistants...');
  
  for (const id of assistantIds) {
    try {
      await axios.delete(`${BASE_URL}/assistantsDelete`, {
        data: { id },
        timeout: 5000,
        validateStatus: () => true
      });
    } catch (error) {
      // Ignore cleanup errors
      console.log(`Failed to cleanup assistant ${id}: ${error.message}`);
    }
  }
  
  console.log('Test assistants cleanup completed');
}

/**
 * Cleanup test data
 */
async function cleanupTestData(data = {}) {
  console.log('Cleaning up test data...');
  
  if (data.assistants && Array.isArray(data.assistants)) {
    await cleanupTestAssistants(data.assistants);
  }
  
  console.log('Test data cleanup completed');
}

module.exports = {
  cleanupTestAssistants,
  cleanupTestData,
};

