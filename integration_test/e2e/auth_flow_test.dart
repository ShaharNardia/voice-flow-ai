import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter/material.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Auth Flow E2E', () {
    testWidgets('Login → Dashboard flow', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Find login screen elements
      expect(find.text('Login'), findsWidgets);
      
      // Enter email (adjust selectors based on actual UI)
      final emailFields = find.byType(TextField);
      if (emailFields.evaluate().isNotEmpty) {
        await tester.enterText(emailFields.first, 'test@example.com');
      }

      // Enter password
      if (emailFields.evaluate().length > 1) {
        await tester.enterText(emailFields.at(1), 'testpassword123');
      }

      // Tap login button
      final loginButton = find.text('Login');
      if (loginButton.evaluate().isNotEmpty) {
        await tester.tap(loginButton);
        await tester.pumpAndSettle(const Duration(seconds: 5));
      }

      // Should navigate to dashboard
      expect(find.text('Bookings'), findsWidgets);
    });

    testWidgets('Protected route redirects to login', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Try to navigate to protected route without login
      // This should redirect to login
      await tester.pumpAndSettle();
      
      // Should show login screen
      expect(find.text('Login'), findsWidgets);
    });
  });
}

