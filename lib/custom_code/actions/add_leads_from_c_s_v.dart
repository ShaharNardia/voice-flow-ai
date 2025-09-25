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

import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';

Future addLeadsFromCSV(
  FFUploadedFile? uploadedFile,
  DocumentReference company,
) async {
  // Add your function code here!
  if (uploadedFile?.bytes == null) return;

  // Initialize progress to 0 at the beginning
  FFAppState().update(() {
    FFAppState().progress = 0.0;
  });

  try {
    final csvString = utf8.decode(uploadedFile!.bytes!);
    final rows =
        LineSplitter.split(csvString).toList(); // Correctly using LineSplitter

    if (rows.length < 2) return; // No data to process

    final headers = rows.first.split(',').map((e) => e.trim()).toList();

    // Using a batch to optimize Firestore writes
    WriteBatch batch = FirebaseFirestore.instance.batch();

    int totalRows = rows.length - 1; // Total number of rows to process
    int processedRows = 0;

    for (final row in rows.skip(1)) {
      final values = row
          .split(',')
          .map((e) => e.trim())
          .toList(); // Split row into values by commas
      if (values.length != headers.length) continue;

      final Map<String, dynamic> leadData = {};
      String? firstName;
      String? lastName;

      // Loop through each header and assign values
      for (int i = 0; i < headers.length; i++) {
        switch (headers[i].toLowerCase()) {
          case 'first name':
            firstName = values[i];
            break;
          case 'last name':
            lastName = values[i];
            break;
          case 'address':
            leadData['address'] = values[i];
            break;
          case 'phone number': // Fix casing
            leadData['phoneNumber'] = '+1' + values[i];
            break;
          default:
            leadData[headers[i]] = values[i];
        }
      }

      // Combine first name and last name into 'name' field
      if (firstName != null && lastName != null) {
        leadData['name'] = '$firstName $lastName';
      } else if (firstName != null) {
        leadData['name'] = firstName;
      } else if (lastName != null) {
        leadData['name'] = lastName;
      }

      leadData['date'] = FieldValue.serverTimestamp();
      leadData['status'] = 'new';
      leadData['isClient'] = false;
      leadData['company'] = company.id;
      leadData['callStatus'] = 'not contacted';

      // Add to batch
      batch.set(FirebaseFirestore.instance.collection('Lead').doc(), leadData);

      // Increment processed rows and update progress
      processedRows++;
      double progress = processedRows / totalRows;
      FFAppState().update(() {
        FFAppState().progress = progress;
      });
      // Update the progress state
    }

    // Commit batch writes
    await batch.commit();

    // Set progress to 1 when done
    FFAppState().update(() {
      FFAppState().progress = 1;
    });
  } catch (e) {
    print('Error adding leads from CSV: $e');
    FFAppState().update(() {
      FFAppState().progress = 0.0; // Reset progress in case of error
    });
  }
}
