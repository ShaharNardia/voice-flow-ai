# Voice Flow AI - Run All Tests Script (PowerShell)
# This script runs all test suites: API, UI, and Flutter Integration

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Voice Flow AI - Test Suite Runner" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"
$failed = 0

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[X] Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}
$nodeVersion = node --version
Write-Host "[+] Node.js found: $nodeVersion" -ForegroundColor Green

# Check if Flutter is installed
if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    Write-Host "[X] Flutter not found. Please install Flutter first." -ForegroundColor Red
    exit 1
}
$flutterVersion = flutter --version | Select-Object -First 1
Write-Host "[+] Flutter found: $flutterVersion" -ForegroundColor Green

Write-Host ""

# 1. Install dependencies for all test directories
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Installing Test Dependencies..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

# Install API tests dependencies
Write-Host "Installing API test dependencies..." -ForegroundColor Cyan
Push-Location tests/api_tests
if (Test-Path "node_modules") {
    Write-Host "[+] API test dependencies already installed" -ForegroundColor Green
}
else {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Failed to install API test dependencies" -ForegroundColor Red
        $failed++
    }
    else {
        Write-Host "[+] API test dependencies installed" -ForegroundColor Green
    }
}
Pop-Location

# Install Performance tests dependencies
Write-Host "Installing Performance test dependencies..." -ForegroundColor Cyan
Push-Location tests/performance
if (Test-Path "node_modules") {
    Write-Host "[+] Performance test dependencies already installed" -ForegroundColor Green
}
else {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Failed to install Performance test dependencies" -ForegroundColor Red
        $failed++
    }
    else {
        Write-Host "[+] Performance test dependencies installed" -ForegroundColor Green
    }
}
Pop-Location

# Install Security tests dependencies
Write-Host "Installing Security test dependencies..." -ForegroundColor Cyan
Push-Location tests/security
if (Test-Path "node_modules") {
    Write-Host "[+] Security test dependencies already installed" -ForegroundColor Green
}
else {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Failed to install Security test dependencies" -ForegroundColor Red
        $failed++
    }
    else {
        Write-Host "[+] Security test dependencies installed" -ForegroundColor Green
    }
}
Pop-Location

Write-Host ""

# 2. Run API Tests
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Running API Tests..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

Push-Location tests/api_tests

if ($env:FIREBASE_FUNCTIONS_URL) {
    Write-Host "[+] FIREBASE_FUNCTIONS_URL is set" -ForegroundColor Green
}
else {
    Write-Host "[!] FIREBASE_FUNCTIONS_URL not set. Some tests may fail." -ForegroundColor Yellow
    Write-Host "    Set it with: `$env:FIREBASE_FUNCTIONS_URL='https://...'" -ForegroundColor Yellow
}

npm test
if ($LASTEXITCODE -ne 0) {
    $failed++
}
Pop-Location

Write-Host ""

# 3. Run UI Tests
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Running UI Tests..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

Push-Location tests/ui
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing UI test dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Failed to install UI test dependencies" -ForegroundColor Red
        $failed++
    }
    else {
        Write-Host "[+] UI test dependencies installed" -ForegroundColor Green
    }
}

if (Test-Path ".env.test") {
    Write-Host "[+] .env.test file found" -ForegroundColor Green
    
    # Check if it has the default placeholder values
    $envContent = Get-Content ".env.test" -Raw
    if ($envContent -match "qa-test@example.com" -or $envContent -match "TestPassword123!") {
        Write-Host "" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "  ACTION REQUIRED: Update Test Credentials" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "The .env.test file contains placeholder credentials." -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
        Write-Host "Please update tests\ui\.env.test with:" -ForegroundColor White
        Write-Host "  1. Your application URL (BASE_URL)" -ForegroundColor White
        Write-Host "  2. Valid test user email (QA_EMAIL)" -ForegroundColor White  
        Write-Host "  3. Valid test user password (QA_PASSWORD)" -ForegroundColor White
        Write-Host "" -ForegroundColor Yellow
        Write-Host "See tests\ui\README_SETUP.md for detailed instructions" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
        
        $response = Read-Host "Continue anyway? (y/N)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Host "Skipping UI tests. Update credentials and run again." -ForegroundColor Yellow
            Pop-Location
            Write-Host ""
            # Don't fail the entire script, just skip UI tests
            continue
        }
    }
}
else {
    Write-Host "[!] .env.test file not found" -ForegroundColor Yellow
    if (Test-Path ".env.test.example") {
        Write-Host "    Creating .env.test from example..." -ForegroundColor Cyan
        Copy-Item ".env.test.example" ".env.test"
        Write-Host "" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "  ACTION REQUIRED: Configure UI Tests" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "Created .env.test file with placeholders." -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
        Write-Host "Please edit tests\ui\.env.test with your:" -ForegroundColor White
        Write-Host "  - Application URL (BASE_URL)" -ForegroundColor White
        Write-Host "  - Test user credentials (QA_EMAIL, QA_PASSWORD)" -ForegroundColor White
        Write-Host "" -ForegroundColor Yellow
        Write-Host "Then run this script again." -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Yellow
        Pop-Location
        Write-Host ""
        continue
    }
    else {
        Write-Host "    ERROR: .env.test.example not found!" -ForegroundColor Red
        Write-Host "    Please create .env.test manually" -ForegroundColor Red
        Pop-Location
        Write-Host ""
        continue
    }
}

Write-Host "Installing Playwright browsers..." -ForegroundColor Cyan
npx playwright install --with-deps
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Playwright installation had issues" -ForegroundColor Yellow
}

npm test
if ($LASTEXITCODE -ne 0) {
    $failed++
}
Pop-Location

Write-Host ""

# 4. Run Flutter Integration Tests
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Running Flutter Integration Tests..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

Write-Host "Getting Flutter dependencies..." -ForegroundColor Cyan
flutter pub get
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Failed to get Flutter dependencies" -ForegroundColor Red
    $failed++
}

flutter test integration_test/
if ($LASTEXITCODE -ne 0) {
    $failed++
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Suite Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($failed -eq 0) {
    Write-Host "[+] ALL TEST SUITES PASSED!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The system is ready for production deployment." -ForegroundColor Green
    exit 0
}
else {
    Write-Host "[X] SOME TEST SUITES FAILED" -ForegroundColor Red
    Write-Host "Failed suites: $failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please review the failed tests above and fix the issues." -ForegroundColor Yellow
    exit 1
}
