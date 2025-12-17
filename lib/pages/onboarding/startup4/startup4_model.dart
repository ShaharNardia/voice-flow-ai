import '/auth/firebase_auth/auth_util.dart';
import '/backend/api_requests/api_calls.dart';
import '/backend/backend.dart';
import '/flutter_flow/flutter_flow_drop_down.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/flutter_flow/form_field_controller.dart';
import '/pages/onboarding/progress_bar/progress_bar_widget.dart';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import '/index.dart';
import 'startup4_widget.dart' show Startup4Widget;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easy_debounce/easy_debounce.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class Startup4Model extends FlutterFlowModel<Startup4Widget> {
  ///  State fields for stateful widgets in this page.

  final formKey1 = GlobalKey<FormState>();
  final formKey2 = GlobalKey<FormState>();
  // Model for ProgressBar component.
  late ProgressBarModel progressBarModel;
  // State field(s) for TabBar widget.
  TabController? tabBarController;
  int get tabBarCurrentIndex =>
      tabBarController != null ? tabBarController!.index : 0;
  int get tabBarPreviousIndex =>
      tabBarController != null ? tabBarController!.previousIndex : 0;

  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode1;
  TextEditingController? textController1;
  String? Function(BuildContext, String?)? textController1Validator;
  String? _textController1Validator(BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'John is required';
    }

    return null;
  }

  // State field(s) for DropDownagent widget.
  String? dropDownagentValue;
  FormFieldController<String>? dropDownagentValueController;
  // State field(s) for DropDown widget.
  String? dropDownValue1;
  FormFieldController<String>? dropDownValueController1;
  // State field(s) for DropDown widget.
  String? dropDownValue2;
  FormFieldController<String>? dropDownValueController2;
  // State field(s) for DropDownprovider widget.
  String? dropDownproviderValue;
  FormFieldController<String>? dropDownproviderValueController;
  // State field(s) for DropDownlanguage widget.
  String? dropDownlanguageValue;
  FormFieldController<String>? dropDownlanguageValueController;
  // State field(s) for DropDown widget.
  String? dropDownValue3;
  FormFieldController<String>? dropDownValueController3;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode2;
  TextEditingController? textController2;
  String? Function(BuildContext, String?)? textController2Validator;
  String? _textController2Validator(BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'TextField is required';
    }

    return null;
  }

  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode3;
  TextEditingController? textController3;
  String? Function(BuildContext, String?)? textController3Validator;
  String? _textController3Validator(BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'OutBound Message is required';
    }

    return null;
  }

  // State field(s) for Switch widget.
  bool? switchValue1;
  // State field(s) for Switch widget.
  bool? switchValue2;
  // State field(s) for Switch widget.
  bool? switchValue3;
  // State field(s) for Switch widget.
  bool? switchValue4;
  // State field(s) for Switch widget.
  bool? switchValue5;
  // State field(s) for Switch widget.
  bool? switchValue6;
  // State field(s) for inbound widget.
  bool? inboundValue;
  // State field(s) for outboundCallHandling widget.
  bool? outboundCallHandlingValue;
  // State field(s) for emailoutbound widget.
  bool? emailoutboundValue;
  // State field(s) for smsnotifiction widget.
  bool? smsnotifictionValue;
  // State field(s) for freeEstimation widget.
  bool? freeEstimationValue;
  // State field(s) for fallbackNumber widget.
  FocusNode? fallbackNumberFocusNode;
  TextEditingController? fallbackNumberTextController;
  String? Function(BuildContext, String?)?
      fallbackNumberTextControllerValidator;
  String? _fallbackNumberTextControllerValidator(
      BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'Field is required';
    }

    return null;
  }

  // Stores action output result for [Backend Call - API (getTool)] action in Button widget.
  ApiCallResponse? apiResultpgr;
  // Stores action output result for [Backend Call - API (Update tool)] action in Button widget.
  ApiCallResponse? apiResult6r1;
  // State field(s) for createJob widget.
  bool? createJobValue;
  // State field(s) for leavemssage widget.
  bool? leavemssageValue;
  // State field(s) for resheduleJob widget.
  bool? resheduleJobValue;
  // State field(s) for cancelJob widget.
  bool? cancelJobValue;
  // State field(s) for addNote widget.
  bool? addNoteValue;
  // State field(s) for priceNegociation widget.
  bool? priceNegociationValue;
  // State field(s) for legalAdvice widget.
  bool? legalAdviceValue;
  // State field(s) for MedicalAdvice widget.
  bool? medicalAdviceValue;
  // State field(s) for PersonalQuestion widget.
  bool? personalQuestionValue;
  // State field(s) for additionalRestrictions widget.
  FocusNode? additionalRestrictionsFocusNode;
  TextEditingController? additionalRestrictionsTextController;
  String? Function(BuildContext, String?)?
      additionalRestrictionsTextControllerValidator;
  // State field(s) for additionalInstructions widget.
  FocusNode? additionalInstructionsFocusNode;
  TextEditingController? additionalInstructionsTextController;
  String? Function(BuildContext, String?)?
      additionalInstructionsTextControllerValidator;

  @override
  void initState(BuildContext context) {
    progressBarModel = createModel(context, () => ProgressBarModel());
    textController1Validator = _textController1Validator;
    textController2Validator = _textController2Validator;
    textController3Validator = _textController3Validator;
    fallbackNumberTextControllerValidator =
        _fallbackNumberTextControllerValidator;
  }

  @override
  void dispose() {
    progressBarModel.dispose();
    tabBarController?.dispose();
    textFieldFocusNode1?.dispose();
    textController1?.dispose();

    textFieldFocusNode2?.dispose();
    textController2?.dispose();

    textFieldFocusNode3?.dispose();
    textController3?.dispose();

    fallbackNumberFocusNode?.dispose();
    fallbackNumberTextController?.dispose();

    additionalRestrictionsFocusNode?.dispose();
    additionalRestrictionsTextController?.dispose();

    additionalInstructionsFocusNode?.dispose();
    additionalInstructionsTextController?.dispose();
  }
}
