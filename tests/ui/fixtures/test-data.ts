/**
 * Test data fixtures for UI tests
 */

export const testUsers = {
  valid: {
    email: process.env.QA_EMAIL ?? 'test@example.com',
    password: process.env.QA_PASSWORD ?? 'testpassword123',
  },
  invalid: {
    email: 'invalid@example.com',
    password: 'wrongpassword',
  },
};

export const testAssistants = {
  valid: {
    name: `Test Assistant ${Date.now()}`,
    firstMessage: 'Hello, how can I help you?',
    language: 'en',
  },
  invalid: {
    name: '',
    firstMessage: '',
  },
};

export const testLeads = {
  valid: {
    name: `Test Lead ${Date.now()}`,
    phoneNumber: '+15551234567',
    email: `lead${Date.now()}@example.com`,
  },
  invalid: {
    name: '',
    phoneNumber: 'invalid',
    email: 'not-an-email',
  },
};

export const testJobs = {
  valid: {
    customerName: `Test Customer ${Date.now()}`,
    phoneNumber: '+15551234567',
    address: '123 Test Street',
  },
  invalid: {
    customerName: '',
    phoneNumber: 'invalid',
  },
};

export const testPhoneNumbers = {
  valid: {
    number: '+15551234567',
    forwardingNumber: '+15559876543',
  },
  invalid: {
    number: 'invalid',
    forwardingNumber: 'invalid',
  },
};

export const testCampaigns = {
  valid: {
    name: `QA Campaign ${Date.now()}`,
    description: 'Created by automated test',
  },
};

export const testScenarios = {
  valid: {
    name: `QA Scenario ${Date.now()}`,
    description: 'Created by automated test',
  },
};

