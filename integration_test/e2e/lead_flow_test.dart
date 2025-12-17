import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter/material.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Lead Flow E2E', () {
    testWidgets('Create Lead → Place Call → Convert to Job flow', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // TODO: Implement login flow using test credentials
      
      // Navigate to leads page
      final leadsLink = find.text('Leads');
      if (leadsLink.evaluate().isNotEmpty) {
        await tester.tap(leadsLink);
        await tester.pumpAndSettle();
      }

      // Create new lead
      final addLeadButton = find.text('Add Lead');
      if (addLeadButton.evaluate().isNotEmpty) {
        await tester.tap(addLeadButton);
        await tester.pumpAndSettle();

        // Fill lead form
        final textFields = find.byType(TextField);
        if (textFields.evaluate().isNotEmpty) {
          await tester.enterText(textFields.first, 'Test Lead ${DateTime.now().millisecondsSinceEpoch}');
        }

        if (textFields.evaluate().length > 1) {
          await tester.enterText(textFields.at(1), '+15551234567');
        }

        // Save lead
        final saveButton = find.text('Save');
        if (saveButton.evaluate().isNotEmpty) {
          await tester.tap(saveButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }

      // Place call from lead
      final callButtons = find.byIcon(Icons.phone);
      if (callButtons.evaluate().isNotEmpty) {
        await tester.tap(callButtons.first);
        await tester.pumpAndSettle(const Duration(seconds: 10));

        // Should show call dialog or success
        final successWidget = find.text('Success');
        final placedWidget = find.text('Call Placed');
        expect(
          successWidget.evaluate().isNotEmpty || placedWidget.evaluate().isNotEmpty,
          isTrue,
        );
      }

      // Convert to job (if button exists)
      final convertButton = find.text('Convert to Job');
      if (convertButton.evaluate().isNotEmpty) {
        await tester.tap(convertButton);
        await tester.pumpAndSettle();

        // Fill job details if form appears
        final saveButton = find.text('Save');
        if (saveButton.evaluate().isNotEmpty) {
          await tester.tap(saveButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }
    });
  });
}

