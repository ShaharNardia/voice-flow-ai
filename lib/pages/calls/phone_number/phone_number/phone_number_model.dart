import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/backend/schema/enums/enums.dart';
import '/backend/schema/structs/index.dart';
import '/backend/workflows/workflow_service.dart';
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
import '/index.dart';
import 'phone_number_widget.dart' show PhoneNumberWidget;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class PhoneNumberModel extends FlutterFlowModel<PhoneNumberWidget> {
  ///  Local state fields for this page.

  List<AvailablePhoneNumber> searchResults = const [];
  bool isSearching = false;
  String? searchError;
  String? selectedAreaCode;
  AvailablePhoneNumber? selectedNumber;
  String? processingPhone;

  ///  State fields for stateful widgets in this page.

  // Model for navbar component.
  late NavbarModel navbarModel;
  // Model for header component.
  late HeaderModel headerModel;
  // Stores action output result for [Backend Call - Read Document] action in Button widget.
  CompanyRecord? comapny;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController =
      FlutterFlowDataTableController<PhoneNumberStruct>();
  // Model for Subscribe component.
  late SubscribeModel subscribeModel;
  TextEditingController? areaCodeController;
  FocusNode? areaCodeFocusNode;

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
    areaCodeController?.dispose();
    areaCodeFocusNode?.dispose();
  }
}
