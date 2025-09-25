import '/flutter_flow/flutter_flow_button_tabbar.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/components/customize_dashboard/customize_dashboard_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/extra_components/eles/eles_widget.dart';
import '/pages/extra_components/elses/elses_widget.dart';
import '/pages/extra_components/whatsaps/whatsaps_widget.dart';
import '/pages/extra_components/whatspa/whatspa_widget.dart';
import 'dart:ui';
import 'sms_whatsap_widget.dart' show SmsWhatsapWidget;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class SmsWhatsapModel extends FlutterFlowModel<SmsWhatsapWidget> {
  ///  Local state fields for this page.

  int con = 0;

  bool showmesaged = false;

  bool smsWhatsap = false;

  ///  State fields for stateful widgets in this page.

  // Model for navbar component.
  late NavbarModel navbarModel;
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
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode2;
  TextEditingController? textController2;
  String? Function(BuildContext, String?)? textController2Validator;
  // Model for whatsaps component.
  late WhatsapsModel whatsapsModel;
  // Model for whatspa component.
  late WhatspaModel whatspaModel;
  // Model for Elses component.
  late ElsesModel elsesModel;
  // Model for eles component.
  late ElesModel elesModel;

  @override
  void initState(BuildContext context) {
    navbarModel = createModel(context, () => NavbarModel());
    whatsapsModel = createModel(context, () => WhatsapsModel());
    whatspaModel = createModel(context, () => WhatspaModel());
    elsesModel = createModel(context, () => ElsesModel());
    elesModel = createModel(context, () => ElesModel());
  }

  @override
  void dispose() {
    navbarModel.dispose();
    tabBarController?.dispose();
    textFieldFocusNode1?.dispose();
    textController1?.dispose();

    textFieldFocusNode2?.dispose();
    textController2?.dispose();

    whatsapsModel.dispose();
    whatspaModel.dispose();
    elsesModel.dispose();
    elesModel.dispose();
  }
}
