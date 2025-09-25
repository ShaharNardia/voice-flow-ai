import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/extra_components/google1/google1_widget.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'startup_google_model.dart';
export 'startup_google_model.dart';

class StartupGoogleWidget extends StatefulWidget {
  const StartupGoogleWidget({super.key});

  static String routeName = 'StartupGoogle';
  static String routePath = 'startupGoogle';

  @override
  State<StartupGoogleWidget> createState() => _StartupGoogleWidgetState();
}

class _StartupGoogleWidgetState extends State<StartupGoogleWidget> {
  late StartupGoogleModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => StartupGoogleModel());

    WidgetsBinding.instance.addPostFrameCallback((_) => safeSetState(() {}));
  }

  @override
  void dispose() {
    _model.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        FocusScope.of(context).unfocus();
        FocusManager.instance.primaryFocus?.unfocus();
      },
      child: Scaffold(
        key: scaffoldKey,
        backgroundColor: FlutterFlowTheme.of(context).primaryBackground,
        body: SafeArea(
          top: true,
          child: Align(
            alignment: AlignmentDirectional(0.0, 0.0),
            child: wrapWithModel(
              model: _model.google1Model,
              updateCallback: () => safeSetState(() {}),
              child: Google1Widget(),
            ),
          ),
        ),
      ),
    );
  }
}
