import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/backend/schema/structs/index.dart';
import '/flutter_flow/flutter_flow_drop_down.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/flutter_flow/form_field_controller.dart';
import '/pages/components/loader/loader_widget.dart';
import '/pages/extra_components/date_time/date_time_widget.dart';
import '/pages/onboarding/progress_bar/progress_bar_widget.dart';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import '/index.dart';
import 'startup2_widget.dart' show Startup2Widget;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class Startup2Model extends FlutterFlowModel<Startup2Widget> {
  ///  Local state fields for this page.

  List<ScheduleStruct> schedule = [];
  void addToSchedule(ScheduleStruct item) => schedule.add(item);
  void removeFromSchedule(ScheduleStruct item) => schedule.remove(item);
  void removeAtIndexFromSchedule(int index) => schedule.removeAt(index);
  void insertAtIndexInSchedule(int index, ScheduleStruct item) =>
      schedule.insert(index, item);
  void updateScheduleAtIndex(int index, Function(ScheduleStruct) updateFn) =>
      schedule[index] = updateFn(schedule[index]);

  List<ServiceAreaStruct> serviceAreas = [];
  void addToServiceAreas(ServiceAreaStruct item) => serviceAreas.add(item);
  void removeFromServiceAreas(ServiceAreaStruct item) =>
      serviceAreas.remove(item);
  void removeAtIndexFromServiceAreas(int index) => serviceAreas.removeAt(index);
  void insertAtIndexInServiceAreas(int index, ServiceAreaStruct item) =>
      serviceAreas.insert(index, item);
  void updateServiceAreasAtIndex(
          int index, Function(ServiceAreaStruct) updateFn) =>
      serviceAreas[index] = updateFn(serviceAreas[index]);

  bool loading = true;

  ///  State fields for stateful widgets in this page.

  final formKey2 = GlobalKey<FormState>();
  final formKey1 = GlobalKey<FormState>();
  // Stores action output result for [Backend Call - Read Document] action in Startup2 widget.
  CompanyRecord? company;
  // Model for loader component.
  late LoaderModel loaderModel;
  // Model for ProgressBar component.
  late ProgressBarModel progressBarModel;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode1;
  TextEditingController? textController1;
  String? Function(BuildContext, String?)? textController1Validator;
  // State field(s) for DropDown widget.
  String? dropDownValue1;
  FormFieldController<String>? dropDownValueController1;
  // State field(s) for DropDown widget.
  String? dropDownValue2;
  FormFieldController<String>? dropDownValueController2;
  // State field(s) for Checkbox widget.
  bool? checkboxValue;
  // Stores action output result for [Alert Dialog - Custom Dialog] action in Container widget.
  ScheduleStruct? updatedScheuleM;
  // Stores action output result for [Alert Dialog - Custom Dialog] action in Container widget.
  ScheduleStruct? updatedScheuleT;
  // Stores action output result for [Alert Dialog - Custom Dialog] action in Container widget.
  ScheduleStruct? updatedScheuleW;
  // Stores action output result for [Alert Dialog - Custom Dialog] action in Container widget.
  ScheduleStruct? updatedScheulet;
  // Stores action output result for [Alert Dialog - Custom Dialog] action in Container widget.
  ScheduleStruct? updatedScheuleF;
  // Stores action output result for [Alert Dialog - Custom Dialog] action in Container widget.
  ScheduleStruct? updatedScheuleS;
  // Stores action output result for [Alert Dialog - Custom Dialog] action in Container widget.
  ScheduleStruct? updatedScheuleSu;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode2;
  TextEditingController? textController2;
  String? Function(BuildContext, String?)? textController2Validator;
  String? _textController2Validator(BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'Enter city is required';
    }

    return null;
  }

  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode3;
  TextEditingController? textController3;
  String? Function(BuildContext, String?)? textController3Validator;
  String? _textController3Validator(BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'Enter state is required';
    }

    return null;
  }

  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode4;
  TextEditingController? textController4;
  String? Function(BuildContext, String?)? textController4Validator;
  String? _textController4Validator(BuildContext context, String? val) {
    if (val == null || val.isEmpty) {
      return 'Enter ZIP code is required';
    }

    return null;
  }

  @override
  void initState(BuildContext context) {
    loaderModel = createModel(context, () => LoaderModel());
    progressBarModel = createModel(context, () => ProgressBarModel());
    textController2Validator = _textController2Validator;
    textController3Validator = _textController3Validator;
    textController4Validator = _textController4Validator;
  }

  @override
  void dispose() {
    loaderModel.dispose();
    progressBarModel.dispose();
    textFieldFocusNode1?.dispose();
    textController1?.dispose();

    textFieldFocusNode2?.dispose();
    textController2?.dispose();

    textFieldFocusNode3?.dispose();
    textController3?.dispose();

    textFieldFocusNode4?.dispose();
    textController4?.dispose();
  }
}
