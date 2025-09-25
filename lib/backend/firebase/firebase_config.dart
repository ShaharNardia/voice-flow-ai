import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

Future initFirebase() async {
  try {
    if (kIsWeb) {
      await Firebase.initializeApp(
          options: FirebaseOptions(
              apiKey: "AIzaSyDzcCqM4hD7XMYhR-60ULyJ9CLNqn8dni8",
              authDomain: "voiceflow-ai-202509231639.firebaseapp.com",
              projectId: "voiceflow-ai-202509231639",
              storageBucket: "voiceflow-ai-202509231639.firebasestorage.app",
              messagingSenderId: "900818829902",
              appId: "1:900818829902:web:6854982612847bd1cdf91f"));
    } else {
      await Firebase.initializeApp();
    }
    
    // Configure Firestore settings to handle connection issues gracefully
    if (kIsWeb) {
      FirebaseFirestore.instance.settings = const Settings(
        persistenceEnabled: false, // Disable persistence on web to avoid conflicts
        cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
      );
    }
    
    // Add error handling for Firestore operations
    FirebaseFirestore.instance.enableNetwork().catchError((error) {
      if (kDebugMode) {
        print('Firebase network initialization warning: $error');
      }
    });
    
  } catch (e) {
    if (kDebugMode) {
      print('Firebase initialization error: $e');
    }
    // Re-throw to ensure app doesn't start with broken Firebase
    rethrow;
  }
}
