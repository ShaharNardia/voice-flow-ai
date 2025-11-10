import 'package:flutter/foundation.dart';

Future<void> downloadBillingHistoryPdfImpl(
  List<dynamic> billingList,
  String selectedMonth,
) async {
  debugPrint(
    'downloadBillingHistoryPdf is only implemented for web targets. '
    'Skipping download for ${defaultTargetPlatform.name}.',
  );
}

