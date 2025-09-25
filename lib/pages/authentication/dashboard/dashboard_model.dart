import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/dispatch/calls/audio_component/audio_component_widget.dart';
import '/pages/dispatch/calls/call_details/call_details_widget.dart';
import '/pages/dispatch/calls/summary_comp/summary_comp_widget.dart';
import 'dart:ui';
import '/index.dart';
import 'dashboard_widget.dart' show DashboardWidget;
import 'package:aligned_dialog/aligned_dialog.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class DashboardModel extends FlutterFlowModel<DashboardWidget> {
  ///  State fields for stateful widgets in this page.

  // Model for navbar component.
  late NavbarModel navbarModel;
  // Model for header component.
  late HeaderModel headerModel;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController =
      FlutterFlowDataTableController<CallRecord>();
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
