import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:voice_flow_a_i/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Dispatcher smoke flow', (tester) async {
    app.main();
    await tester.pumpAndSettle();

    // TODO: Implement login flow using test credentials.
    // Example:
    // await tester.enterText(find.bySemanticsLabel('Email'), const String.fromEnvironment('QA_EMAIL'));
    // await tester.enterText(find.bySemanticsLabel('Password'), const String.fromEnvironment('QA_PASSWORD'));
    // await tester.tap(find.text('Log in'));
    // await tester.pumpAndSettle();

    // For now, assert app loaded without crash.
    expect(find.text('Bookings'), findsWidgets);
  });
}

