import '/flutter_flow/flutter_flow_util.dart';
import 'pbx_settings_widget.dart' show PbxSettingsWidget;
import 'package:flutter/material.dart';

class PbxSettingsModel extends FlutterFlowModel<PbxSettingsWidget> {
  // State field for telephony provider selection
  String telephonyProviderValue = 'twilio';

  // State fields for Bridge URL
  FocusNode? bridgeUrlFocusNode;
  TextEditingController? bridgeUrlController;

  // State fields for Bridge Secret
  FocusNode? bridgeSecretFocusNode;
  TextEditingController? bridgeSecretController;

  // State fields for Caller ID
  FocusNode? callerIdFocusNode;
  TextEditingController? callerIdController;

  // State fields for SIP Trunk Name
  FocusNode? sipTrunkFocusNode;
  TextEditingController? sipTrunkController;

  // State fields for DDI
  FocusNode? ddiFocusNode;
  TextEditingController? ddiController;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    bridgeUrlFocusNode?.dispose();
    bridgeUrlController?.dispose();
    bridgeSecretFocusNode?.dispose();
    bridgeSecretController?.dispose();
    callerIdFocusNode?.dispose();
    callerIdController?.dispose();
    sipTrunkFocusNode?.dispose();
    sipTrunkController?.dispose();
    ddiFocusNode?.dispose();
    ddiController?.dispose();
  }
}

