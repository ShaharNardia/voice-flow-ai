// ignore_for_file: unnecessary_getters_setters

import 'package:cloud_firestore/cloud_firestore.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class MessagesStruct extends FFFirebaseStruct {
  MessagesStruct({
    String? role,
    String? message,
    double? time,
    FirestoreUtilData firestoreUtilData = const FirestoreUtilData(),
  })  : _role = role,
        _message = message,
        _time = time,
        super(firestoreUtilData);

  // "role" field.
  String? _role;
  String get role => _role ?? '';
  set role(String? val) => _role = val;

  bool hasRole() => _role != null;

  // "message" field.
  String? _message;
  String get message => _message ?? '';
  set message(String? val) => _message = val;

  bool hasMessage() => _message != null;

  // "time" field.
  double? _time;
  double get time => _time ?? 0.0;
  set time(double? val) => _time = val;

  void incrementTime(double amount) => time = time + amount;

  bool hasTime() => _time != null;

  static MessagesStruct fromMap(Map<String, dynamic> data) => MessagesStruct(
        role: data['role'] as String?,
        message: data['message'] as String?,
        time: castToType<double>(data['time']),
      );

  static MessagesStruct? maybeFromMap(dynamic data) =>
      data is Map ? MessagesStruct.fromMap(data.cast<String, dynamic>()) : null;

  Map<String, dynamic> toMap() => {
        'role': _role,
        'message': _message,
        'time': _time,
      }.withoutNulls;

  @override
  Map<String, dynamic> toSerializableMap() => {
        'role': serializeParam(
          _role,
          ParamType.String,
        ),
        'message': serializeParam(
          _message,
          ParamType.String,
        ),
        'time': serializeParam(
          _time,
          ParamType.double,
        ),
      }.withoutNulls;

  static MessagesStruct fromSerializableMap(Map<String, dynamic> data) =>
      MessagesStruct(
        role: deserializeParam(
          data['role'],
          ParamType.String,
          false,
        ),
        message: deserializeParam(
          data['message'],
          ParamType.String,
          false,
        ),
        time: deserializeParam(
          data['time'],
          ParamType.double,
          false,
        ),
      );

  @override
  String toString() => 'MessagesStruct(${toMap()})';

  @override
  bool operator ==(Object other) {
    return other is MessagesStruct &&
        role == other.role &&
        message == other.message &&
        time == other.time;
  }

  @override
  int get hashCode => const ListEquality().hash([role, message, time]);
}

MessagesStruct createMessagesStruct({
  String? role,
  String? message,
  double? time,
  Map<String, dynamic> fieldValues = const {},
  bool clearUnsetFields = true,
  bool create = false,
  bool delete = false,
}) =>
    MessagesStruct(
      role: role,
      message: message,
      time: time,
      firestoreUtilData: FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
        delete: delete,
        fieldValues: fieldValues,
      ),
    );

MessagesStruct? updateMessagesStruct(
  MessagesStruct? messages, {
  bool clearUnsetFields = true,
  bool create = false,
}) =>
    messages
      ?..firestoreUtilData = FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
      );

void addMessagesStructData(
  Map<String, dynamic> firestoreData,
  MessagesStruct? messages,
  String fieldName, [
  bool forFieldValue = false,
]) {
  firestoreData.remove(fieldName);
  if (messages == null) {
    return;
  }
  if (messages.firestoreUtilData.delete) {
    firestoreData[fieldName] = FieldValue.delete();
    return;
  }
  final clearFields =
      !forFieldValue && messages.firestoreUtilData.clearUnsetFields;
  if (clearFields) {
    firestoreData[fieldName] = <String, dynamic>{};
  }
  final messagesData = getMessagesFirestoreData(messages, forFieldValue);
  final nestedData = messagesData.map((k, v) => MapEntry('$fieldName.$k', v));

  final mergeFields = messages.firestoreUtilData.create || clearFields;
  firestoreData
      .addAll(mergeFields ? mergeNestedFields(nestedData) : nestedData);
}

Map<String, dynamic> getMessagesFirestoreData(
  MessagesStruct? messages, [
  bool forFieldValue = false,
]) {
  if (messages == null) {
    return {};
  }
  final firestoreData = mapToFirestore(messages.toMap());

  // Add any Firestore field values
  messages.firestoreUtilData.fieldValues
      .forEach((k, v) => firestoreData[k] = v);

  return forFieldValue ? mergeNestedFields(firestoreData) : firestoreData;
}

List<Map<String, dynamic>> getMessagesListFirestoreData(
  List<MessagesStruct>? messagess,
) =>
    messagess?.map((e) => getMessagesFirestoreData(e, true)).toList() ?? [];
