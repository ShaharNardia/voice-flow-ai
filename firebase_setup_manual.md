# 🔥 VoiceFlow AI - Firebase Setup Manual

## 📋 Prerequisites

1. **Firebase CLI installed:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Google account with Firebase access**

## 🚀 Quick Setup Script

Run the PowerShell script:
```powershell
.\setup_firebase_project.ps1
```

## 📝 Manual Setup (Alternative)

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `voiceflow-ai-[your-name]`
4. Enable Google Analytics (optional)
5. Click "Create project"

### Step 2: Enable Services

#### 🔐 Authentication
1. Go to **Authentication > Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** (add your domain)
4. Enable **Apple** (if needed)

#### 📊 Firestore Database
1. Go to **Firestore Database**
2. Click "Create database"
3. Select **Start in test mode** (for development)
4. Choose location (closest to your users)

#### 💾 Storage
1. Go to **Storage**
2. Click "Get started"
3. Select **Start in test mode**
4. Choose same location as Firestore

#### ⚡ Cloud Functions
1. Go to **Functions**
2. Click "Get started"
3. Enable billing (required for Functions)

### Step 3: Create Web App

1. Go to **Project Settings > General**
2. Scroll to "Your apps"
3. Click **Add app** > **Web** (</>)
4. App nickname: `VoiceFlow AI Web`
5. Check "Also set up Firebase Hosting"
6. Click "Register app"
7. **Copy the config object**

### Step 4: Update Project Configuration

#### Update `lib/backend/firebase/firebase_config.dart`:
```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

Future initFirebase() async {
  if (kIsWeb) {
    await Firebase.initializeApp(
        options: FirebaseOptions(
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_PROJECT.firebaseapp.com",
            projectId: "YOUR_PROJECT_ID",
            storageBucket: "YOUR_PROJECT.appspot.com",
            messagingSenderId: "YOUR_SENDER_ID",
            appId: "YOUR_APP_ID"));
  } else {
    await Firebase.initializeApp();
  }
}
```

#### Update `web/index.html`:
Add before `{{flutter_bootstrap_js}}`:
```html
<script>
  // Firebase configuration
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  {{flutter_bootstrap_js}}
</script>
```

### Step 5: Deploy Firebase Rules

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules  
firebase deploy --only storage

# Deploy Cloud Functions
firebase deploy --only functions
```

## 🗂️ Required Collections Structure

The app expects these Firestore collections:

- **`user`** - User profiles and settings
- **`Jobs`** - Technical service jobs
- **`Technician`** - Technician profiles
- **`Company`** - Company information
- **`Lead`** - Potential customer leads
- **`Call`** - Call records and logs
- **`admin`** - Admin users and settings

## 🔒 Security Rules

Firestore rules are configured to:
- Allow authenticated users to read/write their own data
- Allow authenticated users to read/write Jobs, Technicians, Companies, Leads, Calls
- Restrict admin collection (create/delete disabled)

## 🧪 Testing

1. **Clean and rebuild:**
   ```bash
   flutter clean
   flutter pub get
   ```

2. **Run the app:**
   ```bash
   flutter run -d chrome
   ```

3. **Test features:**
   - User registration/login
   - Creating leads
   - Adding technicians
   - AI Dispatch functionality

## 🚨 Troubleshooting

### Common Issues:

1. **"Firebase not initialized"**
   - Check `firebase_config.dart` has correct values
   - Verify `index.html` has Firebase SDK loaded

2. **"Permission denied"**
   - Check Firestore rules are deployed
   - Verify user is authenticated

3. **"Project not found"**
   - Verify project ID is correct
   - Check Firebase project is active

4. **"Billing required"**
   - Enable billing for Cloud Functions
   - Or remove Functions from deployment

## 📞 Support

If you encounter issues:
1. Check Firebase Console for error logs
2. Check browser console (F12) for JavaScript errors
3. Verify all services are enabled
4. Ensure billing is enabled for Functions

## 🎯 Next Steps

After setup:
1. Create your first user account
2. Add company information
3. Create AI assistants
4. Test the complete workflow

---

**Your VoiceFlow AI Firebase project is now ready! 🚀**

