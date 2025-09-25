// ignore_for_file: unnecessary_getters_setters

import 'package:cloud_firestore/cloud_firestore.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class CallMessageStruct extends FFFirebaseStruct {
  CallMessageStruct({
    String? role,
    FirestoreUtilData firestoreUtilData = const FirestoreUtilData(),
  })  : _role = role,
        super(firestoreUtilData);

  // "role" field.
  String? _role;
  String get role => _role ?? '';
  set role(String? val) => _role = val;

  bool hasRole() => _role != null;

  static CallMessageStruct fromMap(Map<String, dynamic> data) =>
      CallMessageStruct(
        role: data['role'] as String?,
      );

  static CallMessageStruct? maybeFromMap(dynamic data) => data is Map
      ? CallMessageStruct.fromMap(data.cast<String, dynamic>())
      : null;

  Map<String, dynamic> toMap() => {
        'role': _role,
      }.withoutNulls;

  @override
  Map<String, dynamic> toSerializableMap() => {
        'role': serializeParam(
          _role,
          ParamType.String,
        ),
      }.withoutNulls;

  static CallMessageStruct fromSerializableMap(Map<String, dynamic> data) =>
      CallMessageStruct(
        role: deserializeParam(
          data['role'],
          ParamType.String,
          false,
        ),
      );

  @override
  String toString() => 'CallMessageStruct(${toMap()})';

  @override
  bool operator ==(Object other) {
    return other is CallMessageStruct && role == other.role;
  }

  @override
  int get hashCode => const ListEquality().hash([role]);
}

CallMessageStruct createCallMessageStruct({
  String? role,
  Map<String, dynamic> fieldValues = const {},
  bool clearUnsetFields = true,
  bool create = false,
  bool delete = false,
}) =>
    CallMessageStruct(
      role: role,
      firestoreUtilData: FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
        delete: delete,
        fieldValues: fieldValues,
      ),
    );

CallMessageStruct? updateCallMessageStruct(
  CallMessageStruct? callMessage, {
  bool clearUnsetFields = true,
  bool create = false,
}) =>
    callMessage
      ?..firestoreUtilData = FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
      );

void addCallMessageStructData(
  Map<String, dynamic> firestoreData,
  CallMessageStruct? callMessage,
  String fieldName, [
  bool forFieldValue = false,
]) {
  firestoreData.remove(fieldName);
  if (callMessage == null) {
    return;
  }
  if (callMessage.firestoreUtilData.delete) {
    firestoreData[fieldName] = FieldValue.delete();
    return;
  }
  final clearFields =
      !forFieldValue && callMessage.firestoreUtilData.clearUnsetFields;
  if (clearFields) {
    firestoreData[fieldName] = <String, dynamic>{};
  }
  final callMessageData =
      getCallMessageFirestoreData(callMessage, forFieldValue);
  final nestedData =
      callMessageData.map((k, v) => MapEntry('$fieldName.$k', v));

  final mergeFields = callMessage.firestoreUtilData.create || clearFields;
  firestoreData
      .addAll(mergeFields ? mergeNestedFields(nestedData) : nestedData);
}

Map<String, dynamic> getCallMessageFirestoreData(
  CallMessageStruct? callMessage, [
  bool forFieldValue = false,
]) {
  if (callMessage == null) {
    return {};
  }
  final firestoreData = mapToFirestore(callMessage.toMap());

  // Add any Firestore field values
  callMessage.firestoreUtilData.fieldValues
      .forEach((k, v) => firestoreData[k] = v);

  return forFieldValue ? mergeNestedFields(firestoreData) : firestoreData;
}

List<Map<String, dynamic>> getCallMessageListFirestoreData(
  List<CallMessageStruct>? callMessages,
) =>
    callMessages?.map((e) => getCallMessageFirestoreData(e, true)).toList() ??
    [];
