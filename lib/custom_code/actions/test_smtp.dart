// Automatic FlutterFlow imports
import '/backend/backend.dart';
import '/backend/schema/structs/index.dart';
import '/backend/schema/enums/enums.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'index.dart'; // Imports other custom actions
import '/flutter_flow/custom_functions.dart'; // Imports custom functions
import 'package:flutter/material.dart';
// Begin custom action code
// DO NOT REMOVE OR MODIFY THE CODE ABOVE!

import 'package:mailer/mailer.dart';
import 'package:mailer/smtp_server.dart';

Future<bool> testSmtp(String username, String password, String smtpServer,
    int port, bool useSsl) async {
  // Add your function code here!
  final smtpServerConfig = SmtpServer(
    smtpServer,
    port: port,
    username: username,
    password: password,
    ssl: useSsl,
  );

  final message = Message()
    ..from = Address(username)
    ..recipients.add(username) // sending to self as test
    ..subject = 'SMTP Credentials Verification'
    ..text = 'This is a test email to verify SMTP credentials.';

  try {
    // Try sending a test email
    final sendReport = await send(message, smtpServerConfig);
    print('Message sent: ' + sendReport.toString());
    return true; // success means credentials are valid
  } on MailerException catch (e) {
    print('Failed to send message: $e');
    return false;
  }
}
