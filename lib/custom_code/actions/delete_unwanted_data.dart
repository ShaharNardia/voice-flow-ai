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

Future<bool> deleteUnwantedData() async {
  // Add your function code here!

  try {
    // Get a reference to the users collection
    final usersCollection = FirebaseFirestore.instance.collection('user');

    // Get a reference to the companies collection
    final companiesCollection =
        FirebaseFirestore.instance.collection('Company');

    // Deleting users except for the one with email 'test@user.com'
    final usersSnapshot = await usersCollection
        .where('email', isNotEqualTo: 'test@user.com')
        .get();

    // Delete all users except the one with 'test@user.com'
    for (var userDoc in usersSnapshot.docs) {
      await userDoc.reference.delete();
    }
    print('Users deleted except for test@user.com');

    // Deleting companies except the one with the document ID 'kAhcmVUJNgesro3oIjv2'
    final companiesSnapshot = await companiesCollection.get();

    // Delete all companies except the one with the specific reference
    for (var companyDoc in companiesSnapshot.docs) {
      if (companyDoc.reference != 'Company/kAhcmVUJNgesro3oIjv2') {
        await companyDoc.reference.delete();
      }
    }
    print('Company documents deleted except for /Company/kAhcmVUJNgesro3oIjv2');

    // If no errors occurred, return true
    return true;
  } catch (e) {
    // Log the error and return false if an exception occurs
    print('Error occurred during deletion: $e');
    return false;
  }
}
