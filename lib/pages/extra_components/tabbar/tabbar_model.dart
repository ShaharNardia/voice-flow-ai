import '/flutter_flow/flutter_flow_button_tabbar.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/extra_components/systerm_setting/systerm_setting_widget.dart';
import 'dart:ui';
import '/flutter_flow/random_data_util.dart' as random_data;
import 'tabbar_widget.dart' show TabbarWidget;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:percent_indicator/percent_indicator.dart';
import 'package:provider/provider.dart';

class TabbarModel extends FlutterFlowModel<TabbarWidget> {
  ///  State fields for stateful widgets in this component.

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
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController1 = FlutterFlowDataTableController<int>();
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode2;
  TextEditingController? textController2;
  String? Function(BuildContext, String?)? textController2Validator;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController2 = FlutterFlowDataTableController<int>();
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode3;
  TextEditingController? textController3;
  String? Function(BuildContext, String?)? textController3Validator;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController3 = FlutterFlowDataTableController<int>();
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode4;
  TextEditingController? textController4;
  String? Function(BuildContext, String?)? textController4Validator;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController4 = FlutterFlowDataTableController<int>();
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode5;
  TextEditingController? textController5;
  String? Function(BuildContext, String?)? textController5Validator;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController5 = FlutterFlowDataTableController<int>();

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    tabBarController?.dispose();
    textFieldFocusNode1?.dispose();
    textController1?.dispose();

    paginatedDataTableController1.dispose();
    textFieldFocusNode2?.dispose();
    textController2?.dispose();

    paginatedDataTableController2.dispose();
    textFieldFocusNode3?.dispose();
    textController3?.dispose();

    paginatedDataTableController3.dispose();
    textFieldFocusNode4?.dispose();
    textController4?.dispose();

    paginatedDataTableController4.dispose();
    textFieldFocusNode5?.dispose();
    textController5?.dispose();

    paginatedDataTableController5.dispose();
  }
}
