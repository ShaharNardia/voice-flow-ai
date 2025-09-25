import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/onboarding/progress_bar/progress_bar_widget.dart';
import 'dart:ui';
import '/index.dart';
import 'startup7_widget.dart' show Startup7Widget;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class Startup7Model extends FlutterFlowModel<Startup7Widget> {
  ///  State fields for stateful widgets in this page.

  // Model for ProgressBar component.
  late ProgressBarModel progressBarModel;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode;
  TextEditingController? textController;
  String? Function(BuildContext, String?)? textControllerValidator;

  @override
  void initState(BuildContext context) {
    progressBarModel = createModel(context, () => ProgressBarModel());
  }

  @override
  void dispose() {
    progressBarModel.dispose();
    textFieldFocusNode?.dispose();
    textController?.dispose();
  }
}
