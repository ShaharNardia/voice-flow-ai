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

import 'dart:typed_data'; // For using Uint8List
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:intl/intl.dart'; // Correctly imported for date formatting
import 'dart:html' as html; // Correctly use dart:html for web

Future<void> downloadBillingHistoryPdf(
  List<dynamic> billingList,
  String selectedMonth,
) async {
  // Step 1: Filter the list based on the selected month
  List<dynamic> filteredList = billingList.where((invoice) {
    if (selectedMonth == null || selectedMonth.isEmpty) return true;

    final timestamp = invoice['created'];
    if (timestamp == null) return false;

    final createdDate = DateTime.fromMillisecondsSinceEpoch(timestamp * 1000);
    final monthName = DateFormat.MMMM().format(createdDate);
    final selectedMonthOnly = selectedMonth.split(' ')[0];

    return monthName == selectedMonthOnly;
  }).toList();

  // Step 2: Create the PDF
  final pdf = pw.Document();

  pdf.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(20),
      build: (pw.Context context) {
        return pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              selectedMonth == null || selectedMonth.isEmpty
                  ? 'Billing History (All Months)'
                  : 'Billing History for $selectedMonth',
              style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
            ),
            pw.SizedBox(height: 20),
            pw.Table.fromTextArray(
              border: pw.TableBorder.all(width: 0.5),
              cellPadding:
                  const pw.EdgeInsets.symmetric(vertical: 6, horizontal: 4),
              headerStyle:
                  pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12),
              cellStyle: pw.TextStyle(fontSize: 10),
              headers: [
                'Transaction',
                'Date',
                'Amount',
                'Status',
                'Description',
              ],
              data: filteredList.map((invoice) {
                final date = DateTime.fromMillisecondsSinceEpoch(
                    (invoice['created'] ?? 0) * 1000);
                final amount =
                    ((invoice['amount_paid'] ?? 0) / 100).toStringAsFixed(2);
                final currency = invoice['currency'] ?? '';
                final transaction = invoice['number'] ?? '-';
                final status = invoice['status'] ?? '-';
                final description =
                    invoice['lines']?['data']?[0]?['description'] ?? '-';

                return [
                  transaction,
                  DateFormat.yMMMd().format(date),
                  '$amount $currency',
                  status,
                  description,
                ];
              }).toList(),
            ),
          ],
        );
      },
    ),
  );

  // Step 3: Encode PDF and trigger download
  final Uint8List bytes = await pdf.save();

  // Web-specific download logic using dart:html
  // Wrap the Uint8List in a list that can be passed to the Blob constructor
  final blob = html.Blob([bytes]);

  // Create a URL from the Blob
  final url = html.Url.createObjectUrlFromBlob(blob);

  // Create an anchor tag and trigger the download
  final anchor = html.AnchorElement(href: url)
    ..target = 'blank'
    ..download = 'billing_history.pdf'
    ..click();

  // Revoke the URL to release memory
  html.Url.revokeObjectUrl(url); // Cleanup the URL
}
