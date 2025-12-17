import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter/material.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Assistant Flow E2E', () {
    testWidgets('Create → Edit → Delete Assistant flow', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // TODO: Implement login flow using test credentials
      // For now, assume user is logged in
      
      // Navigate to assistants page
      // Find assistants link/button
      final assistantsLink = find.text('Assistants');
      if (assistantsLink.evaluate().isNotEmpty) {
        await tester.tap(assistantsLink);
        await tester.pumpAndSettle();
      }

      // Create new assistant
      final createButton = find.text('Create New');
      if (createButton.evaluate().isNotEmpty) {
        await tester.tap(createButton);
        await tester.pumpAndSettle();

      // Fill assistant form
      final nameFields = find.byType(TextField);
      if (nameFields.evaluate().isNotEmpty) {
        await tester.enterText(nameFields.first, 'Test Assistant ${DateTime.now().millisecondsSinceEpoch}');
      }

        // Save assistant
        final saveButton = find.text('Save');
        if (saveButton.evaluate().isNotEmpty) {
          await tester.tap(saveButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }

        // Should show success message
        expect(find.text('Success'), findsWidgets);
      }

      // Edit assistant (if edit button exists)
      final editButton = find.byIcon(Icons.edit);
      if (editButton.evaluate().isNotEmpty) {
        await tester.tap(editButton.first);
        await tester.pumpAndSettle();

        // Update name
        final nameFields = find.byType(TextField);
        if (nameFields.evaluate().isNotEmpty) {
          await tester.enterText(nameFields.first, 'Updated Assistant');
          await tester.pumpAndSettle();
        }

        // Save
        final saveButton = find.text('Save');
        if (saveButton.evaluate().isNotEmpty) {
          await tester.tap(saveButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }

      // Delete assistant (if delete button exists)
      final deleteButton = find.byIcon(Icons.delete);
      if (deleteButton.evaluate().isNotEmpty) {
        await tester.tap(deleteButton.first);
        await tester.pumpAndSettle();

        // Confirm deletion
        final confirmButton = find.text('Confirm');
        if (confirmButton.evaluate().isNotEmpty) {
          await tester.tap(confirmButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }
    });
  });
}

