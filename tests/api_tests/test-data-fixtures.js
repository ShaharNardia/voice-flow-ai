/**
 * Test Data Fixtures
 * Provides test data for API tests
 */

module.exports = {
  testCompany: {
    id: 'test-company-id',
    name: 'Test Company',
    phoneNumber: '+15551234567',
  },
  
  testLead: {
    id: 'test-lead-id',
    name: 'Test Lead',
    phoneNumber: '+15551234567',
    email: 'test@example.com',
  },
  
  testAssistant: {
    id: 'test-assistant-id',
    name: 'Test Assistant',
    company: 'test-company',
    model: 'gpt-4o',
    voice: 'alloy',
    instructions: 'Test instructions',
  },
  
  testJob: {
    id: 'test-job-id',
    companyId: 'test-company-id',
    customerName: 'Test Customer',
    phoneNumber: '+15551234567',
    address: '123 Test Street',
  },
  
  testCall: {
    call_session_id: `test-call-${Date.now()}`,
    phone_number: '+15551234567',
    duration: 120,
    status: 'completed',
    transcript: 'Test transcript',
  },
  
  generateTestData: () => {
    const timestamp = Date.now();
    return {
      company: {
        id: `test-company-${timestamp}`,
        name: `Test Company ${timestamp}`,
      },
      lead: {
        id: `test-lead-${timestamp}`,
        name: `Test Lead ${timestamp}`,
        phoneNumber: '+15551234567',
        email: `test${timestamp}@example.com`,
      },
      assistant: {
        id: `test-assistant-${timestamp}`,
        name: `Test Assistant ${timestamp}`,
      },
      job: {
        id: `test-job-${timestamp}`,
        customerName: `Test Customer ${timestamp}`,
      },
    };
  },
};

