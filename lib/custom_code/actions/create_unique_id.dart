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

import 'dart:math' as math;

Future<int> createUniqueId() async {
  // Add your function code here!
  int timestamp = DateTime.now().millisecondsSinceEpoch;

  // Generate a random number (for added uniqueness)
  int randomNumber =
      math.Random().nextInt(1000); // Random number between 0 and 999

  // Combine the timestamp and random number to create a unique ID
  return timestamp + randomNumber;
}
