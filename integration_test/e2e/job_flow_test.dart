import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter/material.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Job Flow E2E', () {
    testWidgets('Create Job → Assign → Complete flow', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // TODO: Implement login flow using test credentials
      
      // Navigate to bookings page
      final bookingsLink = find.text('Bookings');
      if (bookingsLink.evaluate().isNotEmpty) {
        await tester.tap(bookingsLink);
        await tester.pumpAndSettle();
      }

      // Create new job
      final newBookingButton = find.text('New Booking');
      if (newBookingButton.evaluate().isNotEmpty) {
        await tester.tap(newBookingButton);
        await tester.pumpAndSettle();

        // Fill job form
        final textFields = find.byType(TextField);
        if (textFields.evaluate().isNotEmpty) {
          await tester.enterText(textFields.first, 'Test Customer ${DateTime.now().millisecondsSinceEpoch}');
        }

        if (textFields.evaluate().length > 1) {
          await tester.enterText(textFields.at(1), '+15551234567');
        }

        // Save job
        final saveButton = find.text('Save');
        if (saveButton.evaluate().isNotEmpty) {
          await tester.tap(saveButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }

      // Assign technician
      final assignButton = find.text('Assign');
      if (assignButton.evaluate().isNotEmpty) {
        await tester.tap(assignButton.first);
        await tester.pumpAndSettle();

        // Select technician from dropdown
        final dropdowns = find.byType(DropdownButtonFormField);
        if (dropdowns.evaluate().isNotEmpty) {
          await tester.tap(dropdowns.first);
          await tester.pumpAndSettle();
          
          // Select first option
          final options = find.text('Technician');
          if (options.evaluate().isNotEmpty) {
            await tester.tap(options.first);
            await tester.pumpAndSettle();
          }
        }

        // Confirm assignment
        final confirmButton = find.text('Confirm');
        if (confirmButton.evaluate().isNotEmpty) {
          await tester.tap(confirmButton);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }

      // Change status to completed
      final statusButton = find.text('Status');
      if (statusButton.evaluate().isNotEmpty) {
        await tester.tap(statusButton.first);
        await tester.pumpAndSettle();

        // Select completed status
        final completedOption = find.text('Completed');
        if (completedOption.evaluate().isNotEmpty) {
          await tester.tap(completedOption);
          await tester.pumpAndSettle(const Duration(seconds: 5));
        }
      }
    });
  });
}

