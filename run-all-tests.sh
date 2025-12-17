#!/bin/bash
# Voice Flow AI - Run All Tests Script (Bash)
# This script runs all test suites: API, UI, and Flutter Integration

echo "╔════════════════════════════════════════╗"
echo "║  Voice Flow AI - Test Suite Runner    ║"
echo "╚════════════════════════════════════════╝"
echo ""

failed=0

# Check if Node.js is installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js found: $NODE_VERSION"
else
    echo "✗ Node.js not found. Please install Node.js first."
    exit 1
fi

# Check if Flutter is installed
if command -v flutter &> /dev/null; then
    FLUTTER_VERSION=$(flutter --version | head -n 1)
    echo "✓ Flutter found: $FLUTTER_VERSION"
else
    echo "✗ Flutter not found. Please install Flutter first."
    exit 1
fi

echo ""

# 1. Run API Tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Running API Tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd tests/api_tests || exit 1

if [ -d "node_modules" ]; then
    echo "✓ Dependencies already installed"
else
    echo "Installing API test dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "✗ Failed to install API test dependencies"
        ((failed++))
    fi
fi

if [ -n "$FIREBASE_FUNCTIONS_URL" ]; then
    echo "✓ FIREBASE_FUNCTIONS_URL is set"
else
    echo "⚠ FIREBASE_FUNCTIONS_URL not set. Some tests may fail."
    echo "  Set it with: export FIREBASE_FUNCTIONS_URL='https://...'"
fi

npm test
if [ $? -ne 0 ]; then
    ((failed++))
fi

cd ../..

echo ""

# 2. Run UI Tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Running UI Tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd tests/ui || exit 1

if [ -d "node_modules" ]; then
    echo "✓ Dependencies already installed"
else
    echo "Installing UI test dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "✗ Failed to install UI test dependencies"
        ((failed++))
    fi
fi

if [ -f ".env.test" ]; then
    echo "✓ .env.test file found"
else
    echo "⚠ .env.test file not found. Creating from example..."
    if [ -f ".env.test.example" ]; then
        cp .env.test.example .env.test
        echo "  Please edit .env.test with your test credentials"
    else
        echo "  Please create .env.test file with BASE_URL, QA_EMAIL, QA_PASSWORD"
    fi
fi

echo "Installing Playwright browsers..."
npx playwright install --with-deps
if [ $? -ne 0 ]; then
    echo "⚠ Playwright installation had issues"
fi

npm test
if [ $? -ne 0 ]; then
    ((failed++))
fi

cd ../..

echo ""

# 3. Run Flutter Integration Tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Running Flutter Integration Tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Getting Flutter dependencies..."
flutter pub get
if [ $? -ne 0 ]; then
    echo "✗ Failed to get Flutter dependencies"
    ((failed++))
fi

flutter test integration_test/
if [ $? -ne 0 ]; then
    ((failed++))
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Test Suite Summary                     ║"
echo "╚════════════════════════════════════════╝"
echo ""

if [ $failed -eq 0 ]; then
    echo "✓ ALL TEST SUITES PASSED!"
    echo ""
    echo "The system is ready for production deployment."
    exit 0
else
    echo "✗ SOME TEST SUITES FAILED"
    echo "Failed suites: $failed"
    echo ""
    echo "Please review the failed tests above and fix the issues."
    exit 1
fi

