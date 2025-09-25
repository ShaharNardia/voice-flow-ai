// ignore_for_file: unnecessary_getters_setters

import 'package:cloud_firestore/cloud_firestore.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class ScheduleStruct extends FFFirebaseStruct {
  ScheduleStruct({
    String? day,
    DateTime? startTime,
    DateTime? endTime,
    bool? closed,
    FirestoreUtilData firestoreUtilData = const FirestoreUtilData(),
  })  : _day = day,
        _startTime = startTime,
        _endTime = endTime,
        _closed = closed,
        super(firestoreUtilData);

  // "day" field.
  String? _day;
  String get day => _day ?? '';
  set day(String? val) => _day = val;

  bool hasDay() => _day != null;

  // "startTime" field.
  DateTime? _startTime;
  DateTime? get startTime => _startTime;
  set startTime(DateTime? val) => _startTime = val;

  bool hasStartTime() => _startTime != null;

  // "endTime" field.
  DateTime? _endTime;
  DateTime? get endTime => _endTime;
  set endTime(DateTime? val) => _endTime = val;

  bool hasEndTime() => _endTime != null;

  // "closed" field.
  bool? _closed;
  bool get closed => _closed ?? false;
  set closed(bool? val) => _closed = val;

  bool hasClosed() => _closed != null;

  static ScheduleStruct fromMap(Map<String, dynamic> data) => ScheduleStruct(
        day: data['day'] as String?,
        startTime: data['startTime'] as DateTime?,
        endTime: data['endTime'] as DateTime?,
        closed: data['closed'] as bool?,
      );

  static ScheduleStruct? maybeFromMap(dynamic data) =>
      data is Map ? ScheduleStruct.fromMap(data.cast<String, dynamic>()) : null;

  Map<String, dynamic> toMap() => {
        'day': _day,
        'startTime': _startTime,
        'endTime': _endTime,
        'closed': _closed,
      }.withoutNulls;

  @override
  Map<String, dynamic> toSerializableMap() => {
        'day': serializeParam(
          _day,
          ParamType.String,
        ),
        'startTime': serializeParam(
          _startTime,
          ParamType.DateTime,
        ),
        'endTime': serializeParam(
          _endTime,
          ParamType.DateTime,
        ),
        'closed': serializeParam(
          _closed,
          ParamType.bool,
        ),
      }.withoutNulls;

  static ScheduleStruct fromSerializableMap(Map<String, dynamic> data) =>
      ScheduleStruct(
        day: deserializeParam(
          data['day'],
          ParamType.String,
          false,
        ),
        startTime: deserializeParam(
          data['startTime'],
          ParamType.DateTime,
          false,
        ),
        endTime: deserializeParam(
          data['endTime'],
          ParamType.DateTime,
          false,
        ),
        closed: deserializeParam(
          data['closed'],
          ParamType.bool,
          false,
        ),
      );

  @override
  String toString() => 'ScheduleStruct(${toMap()})';

  @override
  bool operator ==(Object other) {
    return other is ScheduleStruct &&
        day == other.day &&
        startTime == other.startTime &&
        endTime == other.endTime &&
        closed == other.closed;
  }

  @override
  int get hashCode =>
      const ListEquality().hash([day, startTime, endTime, closed]);
}

ScheduleStruct createScheduleStruct({
  String? day,
  DateTime? startTime,
  DateTime? endTime,
  bool? closed,
  Map<String, dynamic> fieldValues = const {},
  bool clearUnsetFields = true,
  bool create = false,
  bool delete = false,
}) =>
    ScheduleStruct(
      day: day,
      startTime: startTime,
      endTime: endTime,
      closed: closed,
      firestoreUtilData: FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
        delete: delete,
        fieldValues: fieldValues,
      ),
    );

ScheduleStruct? updateScheduleStruct(
  ScheduleStruct? schedule, {
  bool clearUnsetFields = true,
  bool create = false,
}) =>
    schedule
      ?..firestoreUtilData = FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
      );

void addScheduleStructData(
  Map<String, dynamic> firestoreData,
  ScheduleStruct? schedule,
  String fieldName, [
  bool forFieldValue = false,
]) {
  firestoreData.remove(fieldName);
  if (schedule == null) {
    return;
  }
  if (schedule.firestoreUtilData.delete) {
    firestoreData[fieldName] = FieldValue.delete();
    return;
  }
  final clearFields =
      !forFieldValue && schedule.firestoreUtilData.clearUnsetFields;
  if (clearFields) {
    firestoreData[fieldName] = <String, dynamic>{};
  }
  final scheduleData = getScheduleFirestoreData(schedule, forFieldValue);
  final nestedData = scheduleData.map((k, v) => MapEntry('$fieldName.$k', v));

  final mergeFields = schedule.firestoreUtilData.create || clearFields;
  firestoreData
      .addAll(mergeFields ? mergeNestedFields(nestedData) : nestedData);
}

Map<String, dynamic> getScheduleFirestoreData(
  ScheduleStruct? schedule, [
  bool forFieldValue = false,
]) {
  if (schedule == null) {
    return {};
  }
  final firestoreData = mapToFirestore(schedule.toMap());

  // Add any Firestore field values
  schedule.firestoreUtilData.fieldValues
      .forEach((k, v) => firestoreData[k] = v);

  return forFieldValue ? mergeNestedFields(firestoreData) : firestoreData;
}

List<Map<String, dynamic>> getScheduleListFirestoreData(
  List<ScheduleStruct>? schedules,
) =>
    schedules?.map((e) => getScheduleFirestoreData(e, true)).toList() ?? [];
