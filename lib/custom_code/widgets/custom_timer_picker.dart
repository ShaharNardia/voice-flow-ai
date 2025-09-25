// Automatic FlutterFlow imports
import '/backend/backend.dart';
import '/backend/schema/structs/index.dart';
import '/backend/schema/enums/enums.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'index.dart'; // Imports other custom widgets
import '/custom_code/actions/index.dart'; // Imports custom actions
import '/flutter_flow/custom_functions.dart'; // Imports custom functions
import 'package:flutter/material.dart';
// Begin custom widget code
// DO NOT REMOVE OR MODIFY THE CODE ABOVE!

import 'package:flutter/cupertino.dart';

class CustomTimerPicker extends StatefulWidget {
  const CustomTimerPicker({
    super.key,
    this.width,
    this.height,
    required this.onTimeSelected,
    this.startTime,
    this.endTime,
  });

  final double? width;
  final double? height;
  final Future Function(DateTime? date) onTimeSelected;
  final DateTime? startTime;
  final DateTime? endTime;

  @override
  State<CustomTimerPicker> createState() => _CustomTimerPickerState();
}

class _CustomTimerPickerState extends State<CustomTimerPicker> {
  int minutes = 0;
  int seconds = 0;
  int hours = 0;

  @override
  void initState() {
    super.initState();

    // Check if a DateTime is provided and initialize the timer accordingly
    if (widget.startTime != null && widget.endTime != null) {
      final difference = widget.endTime!.difference(widget.startTime!);
      hours = difference.inHours;
      minutes = difference.inMinutes % 60;
      seconds = difference.inSeconds % 60;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Ensure initial duration is not negative or invalid
    final initialDuration = Duration(
      hours: hours,
      minutes: minutes,
      seconds: seconds,
    );

    return Container(
      height: 256,
      width: widget.width,
      padding: const EdgeInsets.only(top: 6.0),
      margin: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      color: CupertinoColors.systemBackground.resolveFrom(context),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            // Header with Cancel and Ok buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                CupertinoButton(
                  child: Text(
                    'Cancel',
                    style: TextStyle(
                      color: FlutterFlowTheme.of(context).primary,
                    ),
                  ),
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                ),
                CupertinoButton(
                  child: Text(
                    'Ok',
                    style: TextStyle(
                      color: FlutterFlowTheme.of(context).primary,
                    ),
                  ),
                  onPressed: () {
                    final selectedTime = widget.startTime!.add(Duration(
                      hours: hours,
                      minutes: minutes,
                      seconds: seconds,
                    ));
                    widget.onTimeSelected(
                        selectedTime); // Pass the selected time to the callback
                  },
                ),
              ],
            ),
            Expanded(
              child: CupertinoTimerPicker(
                initialTimerDuration: initialDuration.isNegative
                    ? Duration.zero // Ensure it's not negative
                    : initialDuration,
                mode: CupertinoTimerPickerMode.hms,
                minuteInterval: 1,
                secondInterval: 1,
                onTimerDurationChanged: (Duration newDuration) {
                  setState(() {
                    hours = newDuration.inHours;
                    minutes = newDuration.inMinutes % 60;
                    seconds = newDuration.inSeconds % 60;
                  });
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
