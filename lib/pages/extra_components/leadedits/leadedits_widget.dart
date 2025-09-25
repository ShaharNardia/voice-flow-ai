import '/backend/backend.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/extra_components/edit_lead_comp/edit_lead_comp_widget.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'leadedits_model.dart';
export 'leadedits_model.dart';

class LeadeditsWidget extends StatefulWidget {
  const LeadeditsWidget({
    super.key,
    required this.leadDoc,
  });

  final LeadRecord? leadDoc;

  @override
  State<LeadeditsWidget> createState() => _LeadeditsWidgetState();
}

class _LeadeditsWidgetState extends State<LeadeditsWidget> {
  late LeadeditsModel _model;

  @override
  void setState(VoidCallback callback) {
    super.setState(callback);
    _model.onUpdate();
  }

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => LeadeditsModel());

    WidgetsBinding.instance.addPostFrameCallback((_) => safeSetState(() {}));
  }

  @override
  void dispose() {
    _model.maybeDispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: MediaQuery.sizeOf(context).width * 0.5,
      height: MediaQuery.sizeOf(context).height * 0.8,
      decoration: BoxDecoration(),
      child: wrapWithModel(
        model: _model.editLeadCompModel,
        updateCallback: () => safeSetState(() {}),
        child: EditLeadCompWidget(
          leadDoc: widget!.leadDoc!,
        ),
      ),
    );
  }
}
