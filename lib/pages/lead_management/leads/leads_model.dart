import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/backend/workflows/workflow_service.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_drop_down.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/flutter_flow/form_field_controller.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/call_placed_success/call_placed_success_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/extra_components/leadedits/leadedits_widget.dart';
import '/pages/lead_management/add_lead/add_lead_widget.dart';
import '/pages/lead_management/upload_lead/upload_lead_widget.dart';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import 'leads_widget.dart' show LeadsWidget;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class LeadsModel extends FlutterFlowModel<LeadsWidget> {
  ///  State fields for stateful widgets in this page.

  // Model for navbar component.
  late NavbarModel navbarModel;
  // Model for header component.
  late HeaderModel headerModel;
  // State field(s) for Search widget.
  FocusNode? searchFocusNode;
  TextEditingController? searchTextController;
  String? Function(BuildContext, String?)? searchTextControllerValidator;
  // State field(s) for DropDown widget.
  String? dropDownValue1;
  FormFieldController<String>? dropDownValueController1;
  // State field(s) for DropDown widget.
  String? dropDownValue2;
  FormFieldController<String>? dropDownValueController2;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController =
      FlutterFlowDataTableController<LeadRecord>();
  // Stores action output result for [Backend Call - API (getAssistant)] action in IconButton widget.
  AssistantSummary? assistant;
  // Stores action output result for [Backend Call - Read Document] action in IconButton widget.
  CompanyRecord? company;
  // Stores action output result for [Backend Call - API (Place Call)] action in IconButton widget.
  CallInitiationResult? callResponse;
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
    searchFocusNode?.dispose();
    searchTextController?.dispose();

    paginatedDataTableController.dispose();
    subscribeModel.dispose();
  }
}
