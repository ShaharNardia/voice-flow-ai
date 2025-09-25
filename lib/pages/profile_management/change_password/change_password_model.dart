import '/auth/firebase_auth/auth_util.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import 'dart:ui';
import '/index.dart';
import 'change_password_widget.dart' show ChangePasswordWidget;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class ChangePasswordModel extends FlutterFlowModel<ChangePasswordWidget> {
  ///  State fields for stateful widgets in this page.

  final formKey = GlobalKey<FormState>();
  // State field(s) for pastPasswordField widget.
  FocusNode? pastPasswordFieldFocusNode;
  TextEditingController? pastPasswordFieldTextController;
  String? Function(BuildContext, String?)?
      pastPasswordFieldTextControllerValidator;
  String? _pastPasswordFieldTextControllerValidator(
      BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'Previous Password is required';
    }

    return null;
  }

  // State field(s) for newPasswordField widget.
  FocusNode? newPasswordFieldFocusNode;
  TextEditingController? newPasswordFieldTextController;
  String? Function(BuildContext, String?)?
      newPasswordFieldTextControllerValidator;
  String? _newPasswordFieldTextControllerValidator(
      BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'Create Password is required';
    }

    return null;
  }

  @override
  void initState(BuildContext context) {
    pastPasswordFieldTextControllerValidator =
        _pastPasswordFieldTextControllerValidator;
    newPasswordFieldTextControllerValidator =
        _newPasswordFieldTextControllerValidator;
  }

  @override
  void dispose() {
    pastPasswordFieldFocusNode?.dispose();
    pastPasswordFieldTextController?.dispose();

    newPasswordFieldFocusNode?.dispose();
    newPasswordFieldTextController?.dispose();
  }
}
