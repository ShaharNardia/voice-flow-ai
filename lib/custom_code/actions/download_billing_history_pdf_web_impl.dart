import 'dart:typed_data';
import 'dart:html' as html;

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

Future<void> downloadBillingHistoryPdfImpl(
  List<dynamic> billingList,
  String selectedMonth,
) async {
  final filteredList = billingList.where((invoice) {
    if (selectedMonth.isEmpty) return true;
    final timestamp = invoice['created'];
    if (timestamp == null) return false;
    final createdDate = DateTime.fromMillisecondsSinceEpoch(timestamp * 1000);
    final monthName = DateFormat.MMMM().format(createdDate);
    final selectedMonthOnly = selectedMonth.split(' ').first;
    return monthName == selectedMonthOnly;
  }).toList();

  final pdf = pw.Document();
  pdf.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(20),
      build: (context) {
        return pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              selectedMonth.isEmpty
                  ? 'Billing History (All Months)'
                  : 'Billing History for $selectedMonth',
              style: pw.TextStyle(
                fontSize: 18,
                fontWeight: pw.FontWeight.bold,
              ),
            ),
            pw.SizedBox(height: 20),
            pw.Table.fromTextArray(
              border: pw.TableBorder.all(width: 0.5),
              cellPadding:
                  const pw.EdgeInsets.symmetric(vertical: 6, horizontal: 4),
              headerStyle: pw.TextStyle(
                fontWeight: pw.FontWeight.bold,
                fontSize: 12,
              ),
              cellStyle: pw.TextStyle(fontSize: 10),
              headers: const [
                'Transaction',
                'Date',
                'Amount',
                'Status',
                'Description',
              ],
              data: filteredList.map((invoice) {
                final date = DateTime.fromMillisecondsSinceEpoch(
                  (invoice['created'] ?? 0) * 1000,
                );
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

  final Uint8List bytes = await pdf.save();
  final blob = html.Blob([bytes]);
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.AnchorElement(href: url)
    ..target = 'blank'
    ..download = 'billing_history.pdf'
    ..click();
  html.Url.revokeObjectUrl(url);
}

