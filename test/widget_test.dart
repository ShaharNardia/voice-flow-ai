// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility that Flutter provides. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _MockFirebaseApp extends FirebaseAppPlatform {
  _MockFirebaseApp(super.name, super.options);
}

class _MockFirebasePlatform extends FirebasePlatform {
  _MockFirebasePlatform();

  final List<FirebaseAppPlatform> _registeredApps = <FirebaseAppPlatform>[];

  @override
  List<FirebaseAppPlatform> get apps => List.unmodifiable(_registeredApps);

  @override
  FirebaseAppPlatform app([String name = defaultFirebaseAppName]) {
    return _registeredApps.firstWhere(
      (app) => app.name == name,
      orElse: () => _MockFirebaseApp(
        name,
        const FirebaseOptions(
          apiKey: 'test',
          appId: 'test',
          messagingSenderId: 'test',
          projectId: 'test',
        ),
      ),
    );
  }

  @override
  Future<FirebaseAppPlatform> initializeApp({
    String? name,
    FirebaseOptions? options,
  }) async {
    final FirebaseOptions resolvedOptions = options ??
        const FirebaseOptions(
          apiKey: 'test',
          appId: 'test',
          messagingSenderId: 'test',
          projectId: 'test',
        );
    final appName = name ?? defaultFirebaseAppName;
    final app = _MockFirebaseApp(appName, resolvedOptions);
    _registeredApps.add(app);
    return app;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FirebasePlatform.instance = _MockFirebasePlatform();

  testWidgets('smoke renders basic widget', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Text('Smoke Test'),
        ),
      ),
    );

    expect(find.text('Smoke Test'), findsOneWidget);
  });
}
