import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/custom_code/widgets/index.dart' as custom_widgets;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'custom_timer_model.dart';
export 'custom_timer_model.dart';

class CustomTimerWidget extends StatefulWidget {
  const CustomTimerWidget({
    super.key,
    this.endTime,
    this.startTime,
  });

  final DateTime? endTime;
  final DateTime? startTime;

  @override
  State<CustomTimerWidget> createState() => _CustomTimerWidgetState();
}

class _CustomTimerWidgetState extends State<CustomTimerWidget> {
  late CustomTimerModel _model;

  @override
  void setState(VoidCallback callback) {
    super.setState(callback);
    _model.onUpdate();
  }

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => CustomTimerModel());

    WidgetsBinding.instance.addPostFrameCallback((_) => safeSetState(() {}));
  }

  @override
  void dispose() {
    _model.maybeDispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<FFAppState>();

    return Container(
      width: MediaQuery.sizeOf(context).width * 0.3,
      height: 300.0,
      child: custom_widgets.CustomTimerPicker(
        width: MediaQuery.sizeOf(context).width * 0.3,
        height: 300.0,
        endTime: FFAppState().endTimeValue,
        startTime: widget!.startTime,
        onTimeSelected: (date) async {
          FFAppState().endTimeValue = date;
          safeSetState(() {});
          Navigator.pop(context);
        },
      ),
    );
  }
}
