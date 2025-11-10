# Voice Flow AI - Production Ready

## Overview
Complete voice AI system with automated workflows, assistant management, and call handling.

## System Status

✅ **Production Ready** - All tests passing (11/11)

### Recent Updates
- ✅ Migrated all N8N workflows to Firebase Cloud Functions
- ✅ Replaced VAPI with in-house AI assistant management
- ✅ Comprehensive API testing suite implemented
- ✅ All integrations tested and validated

## Architecture

### Core Services
- **Firebase** - Backend services, authentication, database
- **Twilio** - Telephony and SMS
- **Stripe** - Payment processing
- **OpenAI** - AI language models (via custom functions)

### Key Features
1. **AI Assistant Management** - Create, update, delete assistants
2. **Call Automation** - Automated inbound/outbound calls
3. **Lead Management** - Track and manage customer leads
4. **Reservation System** - Automated booking and scheduling
5. **Call Logging** - Comprehensive call history and analytics

## Quick Start

### Prerequisites
- Flutter SDK
- Firebase CLI
- Node.js (for Firebase Functions)

### Installation

```bash
# Install Flutter dependencies
flutter pub get

# Install Firebase Functions dependencies
cd firebase/functions
npm install

# Deploy Firebase Functions
firebase deploy --only functions

# Build and deploy web app
flutter build web
firebase deploy --only hosting
```

### Running Tests

```bash
# API Tests (comprehensive)
cd tests/api_tests
npm install
npm test

# Flutter Tests
flutter test

# Analyze code
flutter analyze
```

## Project Structure

```
voice_flow_ai_Lanc/
├── lib/                          # Flutter application code
│   ├── backend/                  # Backend integration layer
│   │   ├── workflows/            # Workflow service (N8N replacement)
│   │   └── api_requests/         # API call definitions
│   ├── pages/                    # UI pages
│   │   ├── dispatch/assistant/   # Assistant management
│   │   ├── calls/phone_number/   # Phone number management
│   │   └── lead_management/      # Lead management
│   └── custom_code/              # Custom Flutter code
├── firebase/
│   └── functions/                # Firebase Cloud Functions
│       ├── assign_assistant.js   # Assign assistant to calls
│       ├── create_reservation.js # Booking system
│       ├── end_of_call_log.js    # Call completion logging
│       ├── get_leads.js          # Lead retrieval
│       ├── transfer_call.js      # Call transfer logic
│       └── voice_service.js      # Voice/Twilio integration
└── tests/
    └── api_tests/                # Comprehensive API tests
        ├── runAllTests.js        # Test runner
        ├── testFirebaseFunctions.js
        ├── smokeTest.js
        └── TEST_RESULTS.md       # Latest test results
```

## Testing

### Automated Test Suite
Complete API testing for all Firebase Functions:
- ✅ 11 tests passing
- ✅ 4 tests skipped (per configuration)
- ✅ 0 tests failing

See [tests/api_tests/README.md](tests/api_tests/README.md) for details.

### Test Coverage
- N8N workflow replacements (6/6 passing)
- VAPI replacements (5/5 passing)
- Error handling and validation
- Authentication and authorization

## Configuration

### Environment Variables (Firebase Functions)
Required in Firebase Console → Functions → Configuration:

```bash
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_DEFAULT_FROM=your_twilio_phone
OPENAI_API_KEY=your_openai_key
SENDGRID_API_KEY=your_sendgrid_key
```

### Admin User
Default admin credentials:
- Email: info@lancelotech.com
- Password: Lancelotech2025!

**Important:** Change these credentials in production!

## Development

### Local Development

```bash
# Run Firebase emulators
firebase emulators:start

# Run Flutter app (web)
flutter run -d chrome

# Watch Firebase Functions
cd firebase/functions
npm run serve
```

### Code Quality

```bash
# Lint Firebase Functions
cd firebase/functions
npm run lint

# Analyze Flutter code
flutter analyze

# Format Flutter code
flutter format lib/
```

## Deployment

### Full Deployment

```bash
# Build Flutter web app
flutter build web

# Deploy everything
firebase deploy

# Deploy specific services
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only firestore:indexes
```

### Deployment Checklist
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Firestore indexes created
- [ ] Admin user created
- [ ] CORS configured (if needed)
- [ ] Monitoring enabled

## Monitoring

### Firebase Console
- Functions logs and metrics
- Firestore usage and performance
- Authentication users and activity

### Recommended Monitoring
- Set up alerts for function failures
- Monitor response times
- Track error rates
- Set up uptime monitoring

## Support

### Common Issues

**Functions not deploying:**
- Check Node.js version (v18+)
- Verify Firebase billing is enabled
- Check function logs for errors

**Tests failing:**
- Verify functions are deployed
- Check environment variables
- Ensure Firestore has data

**Authentication issues:**
- Check Firebase Auth configuration
- Verify user permissions
- Check company associations

## Roadmap

- [ ] Add more comprehensive integration tests
- [ ] Implement automated load testing
- [ ] Add real-time monitoring dashboard
- [ ] Expand AI capabilities
- [ ] Add more telephony features

## License

Proprietary - All rights reserved

## Contact

For support or inquiries: info@lancelotech.com
