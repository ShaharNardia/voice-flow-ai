import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/extra_components/google1/google1_widget.dart';
import 'startup_google_widget.dart' show StartupGoogleWidget;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class StartupGoogleModel extends FlutterFlowModel<StartupGoogleWidget> {
  ///  State fields for stateful widgets in this page.

  // Model for google1 component.
  late Google1Model google1Model;

  @override
  void initState(BuildContext context) {
    google1Model = createModel(context, () => Google1Model());
  }

  @override
  void dispose() {
    google1Model.dispose();
  }
}
