import '/auth/firebase_auth/auth_util.dart';
import '/backend/api_requests/api_calls.dart';
import '/backend/backend.dart';
import '/flutter_flow/flutter_flow_button_tabbar.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_drop_down.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/flutter_flow/form_field_controller.dart';
import '/pages/billing/nopaymetmethod/nopaymetmethod_widget.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import 'dart:ui';
import '/custom_code/actions/index.dart' as actions;
import '/flutter_flow/custom_functions.dart' as functions;
import 'billing_widget.dart' show BillingWidget;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class BillingModel extends FlutterFlowModel<BillingWidget> {
  ///  Local state fields for this page.

  dynamic invoicesList;

  String selectedMonth = '';

  List<dynamic> invoiceList = [];
  void addToInvoiceList(dynamic item) => invoiceList.add(item);
  void removeFromInvoiceList(dynamic item) => invoiceList.remove(item);
  void removeAtIndexFromInvoiceList(int index) => invoiceList.removeAt(index);
  void insertAtIndexInInvoiceList(int index, dynamic item) =>
      invoiceList.insert(index, item);
  void updateInvoiceListAtIndex(int index, Function(dynamic) updateFn) =>
      invoiceList[index] = updateFn(invoiceList[index]);

  ///  State fields for stateful widgets in this page.

  // Model for navbar component.
  late NavbarModel navbarModel;
  // Model for header component.
  late HeaderModel headerModel;
  // State field(s) for TabBar widget.
  TabController? tabBarController;
  int get tabBarCurrentIndex =>
      tabBarController != null ? tabBarController!.index : 0;
  int get tabBarPreviousIndex =>
      tabBarController != null ? tabBarController!.previousIndex : 0;

  // Stores action output result for [Backend Call - API (subscription)] action in Button widget.
  ApiCallResponse? apiResultprh;
  // State field(s) for DropDown widget.
  String? dropDownValue;
  FormFieldController<String>? dropDownValueController;
  // Stores action output result for [Backend Call - API (getInvoices)] action in Button widget.
  ApiCallResponse? apiResultaet;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController =
      FlutterFlowDataTableController<dynamic>();
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
    tabBarController?.dispose();
    paginatedDataTableController.dispose();
    subscribeModel.dispose();
  }
}
