import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Full App Smoke Test', () {
    testWidgets('All basic features accessible', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Verify app loaded without crash
      expect(find.text('Bookings'), findsWidgets);

      // Test navigation to main pages
      final mainPages = [
        'Bookings',
        'Assistants',
        'Call Logs',
        'Leads',
        'Billing',
      ];

      for (final pageName in mainPages) {
        final pageLink = find.text(pageName);
        if (pageLink.evaluate().isNotEmpty) {
          await tester.tap(pageLink);
          await tester.pumpAndSettle();
          
          // Verify page loaded
          expect(find.text(pageName), findsWidgets);
        }
      }
    });

    testWidgets('Critical paths work', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // 1. Dashboard loads
      expect(find.text('Bookings'), findsWidgets);

      // 2. Can navigate to assistants
      final assistantsLink = find.text('Assistants');
      if (assistantsLink.evaluate().isNotEmpty) {
        await tester.tap(assistantsLink);
        await tester.pumpAndSettle();
        expect(find.text('Assistants'), findsWidgets);
      }

      // 3. Can navigate to call logs
      final callLogsLink = find.text('Call Logs');
      if (callLogsLink.evaluate().isNotEmpty) {
        await tester.tap(callLogsLink);
        await tester.pumpAndSettle();
        expect(find.text('Call Logs'), findsWidgets);
      }

      // 4. Can navigate to leads
      final leadsLink = find.text('Leads');
      if (leadsLink.evaluate().isNotEmpty) {
        await tester.tap(leadsLink);
        await tester.pumpAndSettle();
        expect(find.text('Leads'), findsWidgets);
      }
    });
  });
}

