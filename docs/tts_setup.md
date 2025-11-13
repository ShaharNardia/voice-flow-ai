# Hebrew TTS Built-in Providers – Quick Checklist

## 1. Prepare Cloud Function Environment
- **Open terminal** in `firebase/functions/`.
- **Set required secrets** (run once per environment):
  - `firebase functions:secrets:set ELEVENLABS_API_KEY`
  - `firebase functions:secrets:set AZURE_TTS_KEY`
  - `firebase functions:secrets:set AZURE_TTS_REGION`
  - `firebase functions:secrets:set GOOGLE_APPLICATION_CREDENTIALS_JSON` (paste service-account JSON when prompted)
- **Confirm Node version** matches `20` (e.g. with `nvm use 20`).

## 2. Install & Deploy Functions
- `npm install` (inside `firebase/functions/`).
- `npm run lint` (optional but recommended).
- Deploy only the new endpoints:
  ```bash
  firebase deploy --only functions:listTtsVoices,functions:synthesizeTts
  ```

## 3. Local Testing (Optional)
- Run the functions locally to test without deploying:
  ```bash
  firebase emulators:start --only functions
  ```
- Call the endpoints with curl/Postman:
  ```bash
  curl -X POST \
       -H "Content-Type: application/json" \
       -d '{"provider":"google"}' \
       http://127.0.0.1:5001/<PROJECT-ID>/us-central1/listTtsVoices
  ```
  Replace `<PROJECT-ID>` with the Firebase project id shown in the emulator logs.

## 4. Flutter App – Voice Provider Setup
- Run `flutter pub get` at repo root (ensures new dependencies are fetched).
- Start the app (`flutter run` or your IDE run configuration).
- Navigate to **Onboarding → Voice** tab (`startup4` screen).
- For each provider (`Google`, `Azure`, `ElevenLabs`):
  1. Select the provider from the dropdown.
  2. Wait for the voice list to load (spinner disappears).
  3. Pick the preferred Hebrew voice.
  4. Press **"Play sample"** (button text in Hebrew) to ensure latency and quality meet expectations.
  5. Confirm the latency label updates with the measured ms.
  6. Save the configuration (continue through onboarding).

## 5. Production Verification
- Trigger a test call/conversation that uses the selected provider.
- Confirm the generated speech matches expectations and latency is acceptable.
- Monitor Cloud Function logs for any errors:
  ```bash
  firebase functions:log --only listTtsVoices,synthesizeTts
  ```

## 6. Maintenance Tips
- Re-run `firebase deploy --only functions:listTtsVoices,functions:synthesizeTts` after any code changes to `tts_service.js`.
- If latency spikes, regenerate ElevenLabs keys or adjust `optimize_streaming_latency` in the Flutter options map.
- Keep Google/Azure credentials rotated per company policy.
