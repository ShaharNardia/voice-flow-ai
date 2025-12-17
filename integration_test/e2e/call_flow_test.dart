import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter/material.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Call Flow E2E', () {
    testWidgets('Place Call → View Details → Update flow', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // TODO: Implement login flow using test credentials
      
      // Navigate to place call page
      final placeCallLink = find.text('Place Call');
      if (placeCallLink.evaluate().isNotEmpty) {
        await tester.tap(placeCallLink);
        await tester.pumpAndSettle();
      }

      // Fill call form
      final textFields = find.byType(TextField);
      if (textFields.evaluate().isNotEmpty) {
        await tester.enterText(textFields.first, 'Test Customer');
      }

      if (textFields.evaluate().length > 1) {
        await tester.enterText(textFields.at(1), '+15551234567');
      }

      // Place call
      final placeCallButton = find.text('Place Call');
      if (placeCallButton.evaluate().isNotEmpty) {
        await tester.tap(placeCallButton);
        await tester.pumpAndSettle(const Duration(seconds: 10));
      }

      // Should show success message or call details
      final successWidget = find.text('Success');
      final detailsWidget = find.text('Call Details');
      expect(
        successWidget.evaluate().isNotEmpty || detailsWidget.evaluate().isNotEmpty,
        isTrue,
      );

      // Navigate to call logs
      final callLogsLink = find.text('Call Logs');
      if (callLogsLink.evaluate().isNotEmpty) {
        await tester.tap(callLogsLink);
        await tester.pumpAndSettle();
      }

      // View call details
      final callRows = find.byType(ListTile);
      if (callRows.evaluate().isNotEmpty) {
        await tester.tap(callRows.first);
        await tester.pumpAndSettle();

        // Should show call details
        expect(find.text('Duration'), findsWidgets);
      }

      // Update agent if button exists
      final updateAgentButton = find.text('Update Agent');
      if (updateAgentButton.evaluate().isNotEmpty) {
        await tester.tap(updateAgentButton);
        await tester.pumpAndSettle();

        // Select agent and save
        final saveButton = find.text('Save');
        if (saveButton.evaluate().isNotEmpty) {
          await tester.tap(saveButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }
    });
  });
}

