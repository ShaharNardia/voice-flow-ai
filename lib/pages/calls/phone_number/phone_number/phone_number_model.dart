import '/auth/firebase_auth/auth_util.dart';
import '/backend/api_requests/api_calls.dart';
import '/backend/backend.dart';
import '/backend/schema/enums/enums.dart';
import '/backend/schema/structs/index.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/calls/phone_number/edit_number/edit_number_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/extra_components/waiting_alert/waiting_alert_widget.dart';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import '/index.dart';
import 'phone_number_widget.dart' show PhoneNumberWidget;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class PhoneNumberModel extends FlutterFlowModel<PhoneNumberWidget> {
  ///  Local state fields for this page.

  int? codeCheck = 0;
  String? existingPhoneNumber;

  ///  State fields for stateful widgets in this page.

  // Model for navbar component.
  late NavbarModel navbarModel;
  // Model for header component.
  late HeaderModel headerModel;
  // Stores action output result for [Backend Call - Read Document] action in Button widget.
  CompanyRecord? comapny;
  // Stores action output result for [Backend Call - API (Search Number)] action in Button widget.
  ApiCallResponse? checkPhoneNumber;
  // Stores action output result for [Backend Call - API (Buy Phone Number)] action in Button widget.
  ApiCallResponse? buyvonagenumberresponse;
  // Stores action output result for [Backend Call - API (Create Phone Number)] action in Button widget.
  ApiCallResponse? vapiPhoneNumber;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController =
      FlutterFlowDataTableController<PhoneNumberStruct>();
  // Stores action output result for [Backend Call - API (deletePhone)] action in IconButton widget.
  ApiCallResponse? apiResult7or;
  // Model for Subscribe component.
  late SubscribeModel subscribeModel;

  @override
  void initState(BuildContext context) {
    navbarModel = createModel(context, () => NavbarModel());
    headerModel = createModel(context, () => HeaderModel());
    subscribeModel = createModel(context, () => SubscribeModel());
  }

  @override
  void dispose() {
    navbarModel.dispose();
    headerModel.dispose();
    paginatedDataTableController.dispose();
    subscribeModel.dispose();
  }
}
