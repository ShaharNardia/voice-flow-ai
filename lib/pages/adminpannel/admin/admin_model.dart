import '/flutter_flow/flutter_flow_button_tabbar.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/extra_components/switch1/switch1_widget.dart';
import '/pages/extra_components/systerm_setting/systerm_setting_widget.dart';
import '/pages/extra_components/tabbar/tabbar_widget.dart';
import 'dart:ui';
import '/flutter_flow/random_data_util.dart' as random_data;
import 'admin_widget.dart' show AdminWidget;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:percent_indicator/percent_indicator.dart';
import 'package:provider/provider.dart';

class AdminModel extends FlutterFlowModel<AdminWidget> {
  ///  State fields for stateful widgets in this page.

  // State field(s) for TabBar widget.
  TabController? tabBarController;
  int get tabBarCurrentIndex =>
      tabBarController != null ? tabBarController!.index : 0;
  int get tabBarPreviousIndex =>
      tabBarController != null ? tabBarController!.previousIndex : 0;

  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController1 = FlutterFlowDataTableController<int>();
  // Model for tabbar component.
  late TabbarModel tabbarModel;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode1;
  TextEditingController? textController1;
  String? Function(BuildContext, String?)? textController1Validator;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode2;
  TextEditingController? textController2;
  String? Function(BuildContext, String?)? textController2Validator;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode3;
  TextEditingController? textController3;
  String? Function(BuildContext, String?)? textController3Validator;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode4;
  TextEditingController? textController4;
  String? Function(BuildContext, String?)? textController4Validator;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode5;
  TextEditingController? textController5;
  String? Function(BuildContext, String?)? textController5Validator;
  // State field(s) for TextField widget.
  FocusNode? textFieldFocusNode6;
  TextEditingController? textController6;
  String? Function(BuildContext, String?)? textController6Validator;
  // State field(s) for PaginatedDataTable widget.
  final paginatedDataTableController2 = FlutterFlowDataTableController<int>();

  // ── System API Keys tab (tab 5) ──────────────────────────────────────
  FocusNode? keysFocusNode1;
  TextEditingController? keysController1; // Twilio Account SID
  FocusNode? keysFocusNode2;
  TextEditingController? keysController2; // Twilio Auth Token
  FocusNode? keysFocusNode3;
  TextEditingController? keysController3; // Twilio Default From
  FocusNode? keysFocusNode4;
  TextEditingController? keysController4; // OpenAI API Key
  FocusNode? keysFocusNode5;
  TextEditingController? keysController5; // Deepgram API Key
  bool keysLoading = false;
  bool keysSaved = false;

  // ── Billing Settings tab (tab 6) ─────────────────────────────────────
  FocusNode? billingFocusNode1;
  TextEditingController? billingController1; // signupCreditCents (shown as $)
  FocusNode? billingFocusNode2;
  TextEditingController? billingController2; // signupCreditDays
  bool billingLoading = false;
  bool billingSaved = false;

  /// Load SystemSettings/keys and SystemSettings/billing into the controllers.
  Future<void> loadSystemSettings() async {
    final db = FirebaseFirestore.instance;
    try {
      final keysDoc = await db.collection('SystemSettings').doc('keys').get();
      final kd = keysDoc.data() ?? {};
      keysController1?.text = kd['twilioAccountSid'] ?? '';
      keysController2?.text = kd['twilioAuthToken'] ?? '';
      keysController3?.text = kd['twilioDefaultFrom'] ?? '';
      keysController4?.text = kd['openaiApiKey'] ?? '';
      keysController5?.text = kd['deepgramApiKey'] ?? '';
    } catch (_) {}
    try {
      final billingDoc =
          await db.collection('SystemSettings').doc('billing').get();
      final bd = billingDoc.data() ?? {};
      final cents = (bd['signupCreditCents'] as num?)?.toInt() ?? 1000;
      billingController1?.text = (cents / 100).toStringAsFixed(2);
      billingController2?.text =
          ((bd['signupCreditDays'] as num?)?.toInt() ?? 30).toString();
    } catch (_) {}
  }

  /// Save API keys to SystemSettings/keys.
  Future<void> saveApiKeys() async {
    keysLoading = true;
    keysSaved = false;
    final db = FirebaseFirestore.instance;
    await db.collection('SystemSettings').doc('keys').set({
      'twilioAccountSid': keysController1?.text.trim() ?? '',
      'twilioAuthToken': keysController2?.text.trim() ?? '',
      'twilioDefaultFrom': keysController3?.text.trim() ?? '',
      'openaiApiKey': keysController4?.text.trim() ?? '',
      'deepgramApiKey': keysController5?.text.trim() ?? '',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    keysLoading = false;
    keysSaved = true;
  }

  /// Save billing settings to SystemSettings/billing.
  Future<void> saveBillingSettings() async {
    billingLoading = true;
    billingSaved = false;
    final db = FirebaseFirestore.instance;
    final dollars = double.tryParse(billingController1?.text ?? '') ?? 10.0;
    final days = int.tryParse(billingController2?.text ?? '') ?? 30;
    await db.collection('SystemSettings').doc('billing').set({
      'signupCreditCents': (dollars * 100).round(),
      'signupCreditDays': days,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    billingLoading = false;
    billingSaved = true;
  }

  @override
  void initState(BuildContext context) {
    tabbarModel = createModel(context, () => TabbarModel());
  }

  @override
  void dispose() {
    tabBarController?.dispose();
    paginatedDataTableController1.dispose();
    tabbarModel.dispose();
    textFieldFocusNode1?.dispose();
    textController1?.dispose();

    textFieldFocusNode2?.dispose();
    textController2?.dispose();

    textFieldFocusNode3?.dispose();
    textController3?.dispose();

    textFieldFocusNode4?.dispose();
    textController4?.dispose();

    textFieldFocusNode5?.dispose();
    textController5?.dispose();

    textFieldFocusNode6?.dispose();
    textController6?.dispose();

    paginatedDataTableController2.dispose();

    keysFocusNode1?.dispose();
    keysController1?.dispose();
    keysFocusNode2?.dispose();
    keysController2?.dispose();
    keysFocusNode3?.dispose();
    keysController3?.dispose();
    keysFocusNode4?.dispose();
    keysController4?.dispose();
    keysFocusNode5?.dispose();
    keysController5?.dispose();

    billingFocusNode1?.dispose();
    billingController1?.dispose();
    billingFocusNode2?.dispose();
    billingController2?.dispose();
  }
}
