import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/extra_components/edit_route/edit_route_widget.dart';
import 'dart:ui';
import 'call_route_widget.dart' show CallRouteWidget;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class CallRouteModel extends FlutterFlowModel<CallRouteWidget> {
  ///  State fields for stateful widgets in this page.

  // Model for navbar component.
  late NavbarModel navbarModel;
  // Model for header component.
  late HeaderModel headerModel;

  @override
  void initState(BuildContext context) {
    navbarModel = createModel(context, () => NavbarModel());
    headerModel = createModel(context, () => HeaderModel());
  }

  @override
  void dispose() {
    navbarModel.dispose();
    headerModel.dispose();
  }
}
