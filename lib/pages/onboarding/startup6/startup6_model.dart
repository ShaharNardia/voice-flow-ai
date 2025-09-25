import '/auth/firebase_auth/auth_util.dart';
import '/backend/api_requests/api_calls.dart';
import '/backend/backend.dart';
import '/backend/schema/enums/enums.dart';
import '/backend/schema/structs/index.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/extra_components/waiting_alert/waiting_alert_widget.dart';
import '/pages/onboarding/progress_bar/progress_bar_widget.dart';
import 'dart:async';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import '/index.dart';
import 'startup6_widget.dart' show Startup6Widget;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:collection/collection.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class Startup6Model extends FlutterFlowModel<Startup6Widget> {
  ///  Local state fields for this page.

  int codeCheck = 0;

  int? planType = 0;

  String? priceId;

  String? customerId;

  ///  State fields for stateful widgets in this page.

  // Model for ProgressBar component.
  late ProgressBarModel progressBarModel;
  // Stores action output result for [Backend Call - API (createCustomer)] action in Button widget.
  ApiCallResponse? stripe;
  // Stores action output result for [Firestore Query - Query a collection] action in Button widget.
  AdminRecord? admin;
  // Stores action output result for [Backend Call - API (createSession)] action in Button widget.
  ApiCallResponse? apiResultxjo;
  // Stores action output result for [Backend Call - Read Document] action in Button widget.
  CompanyRecord? comapny;
  // Stores action output result for [Firestore Query - Query a collection] action in Button widget.
  AdminRecord? admin2;
  // Stores action output result for [Backend Call - API (Search Number)] action in Button widget.
  ApiCallResponse? checkPhoneNumber;
  // Stores action output result for [Backend Call - API (Buy Phone Number)] action in Button widget.
  ApiCallResponse? buyTwillio;
  // Stores action output result for [Backend Call - API (Create Phone Number)] action in Button widget.
  ApiCallResponse? vapiPhoneNumber;

  @override
  void initState(BuildContext context) {
    progressBarModel = createModel(context, () => ProgressBarModel());
  }

  @override
  void dispose() {
    progressBarModel.dispose();
  }
}
