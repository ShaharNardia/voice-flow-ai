# VoiceFlow AI

VoiceFlow AI is a cross-platform Flutter application designed for voice-based workflows and AI-powered interactions.

## Features

- Audio playback and recording
- Integration with Firebase (Firestore, Storage, Cloud Functions)
- Rich media support (images, videos, PDFs, Rive animations)
- Platform support: Android, iOS, Windows, Linux, macOS, Web

## Project Structure

- `lib/` - Dart source code
- `assets/` - Application assets (audio, images, fonts, etc.)
- `firebase/` - Firebase configuration and rules
- `android/`, `ios/`, `windows/`, `linux/`, `macos/`, `web/` - Platform-specific code

## Getting Started

1. **Install Flutter:**  
   [Flutter installation guide](https://docs.flutter.dev/get-started/install)

## Development Workflow

### Install Dependencies

```bash
flutter pub get
cd firebase/functions && npm install
```

### Local QA Commands

| Component | Command | Purpose |
|-----------|---------|---------|
| Flutter linting/tests | `flutter analyze`<br>`flutter test` | Static analysis & unit/widget tests. |
| Firebase Functions | `npm run lint`<br>`npm run test:functions` | eslint & lightweight verification. |
| Emulator suite | `npm run serve` | Spins up Firebase emulators (Functions, Firestore, etc.). |

Refer to `docs/testing_checklist.md` for the full release checklist.

### Building for Desktop

- **Windows** – see `windows/runner/`
- **Linux** – see `linux/`
- **macOS** – see `macos/`

### Firebase Setup

Configure Firebase by placing your credentials and configuration files in the `firebase/` directory and exporting required environment variables (Twilio, Stripe, etc.) before deploying Functions.

---

License: Apache License 2.0 (see `LICENSE`).
