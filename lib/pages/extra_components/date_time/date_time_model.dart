import '/backend/backend.dart';
import '/backend/schema/structs/index.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import 'dart:ui';
import 'date_time_widget.dart' show DateTimeWidget;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

class DateTimeModel extends FlutterFlowModel<DateTimeWidget> {
  ///  Local state fields for this component.

  ScheduleStruct? dayScheduleState;
  void updateDayScheduleStateStruct(Function(ScheduleStruct) updateFn) {
    updateFn(dayScheduleState ??= ScheduleStruct());
  }

  ///  State fields for stateful widgets in this component.

  DateTime? datePicked1;
  DateTime? datePicked2;
  // State field(s) for Checkbox widget.
  bool? checkboxValue;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {}
}
