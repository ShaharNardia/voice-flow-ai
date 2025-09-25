import '/backend/backend.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/extra_components/edit_lead_comp/edit_lead_comp_widget.dart';
import 'leadedits_widget.dart' show LeadeditsWidget;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class LeadeditsModel extends FlutterFlowModel<LeadeditsWidget> {
  ///  State fields for stateful widgets in this component.

  // Model for editLeadComp component.
  late EditLeadCompModel editLeadCompModel;

  @override
  void initState(BuildContext context) {
    editLeadCompModel = createModel(context, () => EditLeadCompModel());
  }

  @override
  void dispose() {
    editLeadCompModel.dispose();
  }
}
