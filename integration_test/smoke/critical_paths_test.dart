import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Critical Paths Test', () {
    testWidgets('Authentication path', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Should show login or dashboard
      final loginWidget = find.text('Login');
      final bookingsWidget = find.text('Bookings');
      expect(
        loginWidget.evaluate().isNotEmpty || bookingsWidget.evaluate().isNotEmpty,
        isTrue,
      );
    });

    testWidgets('Dashboard → Assistants path', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate to assistants
      final assistantsLink = find.text('Assistants');
      if (assistantsLink.evaluate().isNotEmpty) {
        await tester.tap(assistantsLink);
        await tester.pumpAndSettle();
        
        // Should be on assistants page
        expect(find.text('Assistants'), findsWidgets);
      }
    });

    testWidgets('Dashboard → Calls path', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate to call logs
      final callLogsLink = find.text('Call Logs');
      if (callLogsLink.evaluate().isNotEmpty) {
        await tester.tap(callLogsLink);
        await tester.pumpAndSettle();
        
        // Should be on call logs page
        expect(find.text('Call Logs'), findsWidgets);
      }
    });

    testWidgets('Dashboard → Leads path', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate to leads
      final leadsLink = find.text('Leads');
      if (leadsLink.evaluate().isNotEmpty) {
        await tester.tap(leadsLink);
        await tester.pumpAndSettle();
        
        // Should be on leads page
        expect(find.text('Leads'), findsWidgets);
      }
    });

    testWidgets('Dashboard → Bookings path', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Should already be on bookings/dashboard
      expect(find.text('Bookings'), findsWidgets);
    });
  });
}

