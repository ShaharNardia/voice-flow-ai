// ignore_for_file: unnecessary_getters_setters

import 'package:cloud_firestore/cloud_firestore.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class AssistantStruct extends FFFirebaseStruct {
  AssistantStruct({
    String? name,
    String? id,
    String? firstMessage,
    String? systemPrompt,
    String? language,
    FirestoreUtilData firestoreUtilData = const FirestoreUtilData(),
  })  : _name = name,
        _id = id,
        _firstMessage = firstMessage,
        _systemPrompt = systemPrompt,
        _language = language,
        super(firestoreUtilData);

  // "name" field.
  String? _name;
  String get name => _name ?? '';
  set name(String? val) => _name = val;

  bool hasName() => _name != null;

  // "id" field.
  String? _id;
  String get id => _id ?? '';
  set id(String? val) => _id = val;

  bool hasId() => _id != null;

  // "firstMessage" field.
  String? _firstMessage;
  String get firstMessage => _firstMessage ?? '';
  set firstMessage(String? val) => _firstMessage = val;

  bool hasFirstMessage() => _firstMessage != null;

  // "systemPrompt" field.
  String? _systemPrompt;
  String get systemPrompt => _systemPrompt ?? '';
  set systemPrompt(String? val) => _systemPrompt = val;

  bool hasSystemPrompt() => _systemPrompt != null;

  // "language" field.
  String? _language;
  String get language => _language ?? '';
  set language(String? val) => _language = val;

  bool hasLanguage() => _language != null;

  static AssistantStruct fromMap(Map<String, dynamic> data) => AssistantStruct(
        name: data['name'] as String?,
        id: data['id'] as String?,
        firstMessage: data['firstMessage'] as String?,
        systemPrompt: data['systemPrompt'] as String?,
        language: data['language'] as String?,
      );

  static AssistantStruct? maybeFromMap(dynamic data) => data is Map
      ? AssistantStruct.fromMap(data.cast<String, dynamic>())
      : null;

  Map<String, dynamic> toMap() => {
        'name': _name,
        'id': _id,
        'firstMessage': _firstMessage,
        'systemPrompt': _systemPrompt,
        'language': _language,
      }.withoutNulls;

  @override
  Map<String, dynamic> toSerializableMap() => {
        'name': serializeParam(
          _name,
          ParamType.String,
        ),
        'id': serializeParam(
          _id,
          ParamType.String,
        ),
        'firstMessage': serializeParam(
          _firstMessage,
          ParamType.String,
        ),
        'systemPrompt': serializeParam(
          _systemPrompt,
          ParamType.String,
        ),
        'language': serializeParam(
          _language,
          ParamType.String,
        ),
      }.withoutNulls;

  static AssistantStruct fromSerializableMap(Map<String, dynamic> data) =>
      AssistantStruct(
        name: deserializeParam(
          data['name'],
          ParamType.String,
          false,
        ),
        id: deserializeParam(
          data['id'],
          ParamType.String,
          false,
        ),
        firstMessage: deserializeParam(
          data['firstMessage'],
          ParamType.String,
          false,
        ),
        systemPrompt: deserializeParam(
          data['systemPrompt'],
          ParamType.String,
          false,
        ),
        language: deserializeParam(
          data['language'],
          ParamType.String,
          false,
        ),
      );

  @override
  String toString() => 'AssistantStruct(${toMap()})';

  @override
  bool operator ==(Object other) {
    return other is AssistantStruct &&
        name == other.name &&
        id == other.id &&
        firstMessage == other.firstMessage &&
        systemPrompt == other.systemPrompt &&
        language == other.language;
  }

  @override
  int get hashCode => const ListEquality()
      .hash([name, id, firstMessage, systemPrompt, language]);
}

AssistantStruct createAssistantStruct({
  String? name,
  String? id,
  String? firstMessage,
  String? systemPrompt,
  String? language,
  Map<String, dynamic> fieldValues = const {},
  bool clearUnsetFields = true,
  bool create = false,
  bool delete = false,
}) =>
    AssistantStruct(
      name: name,
      id: id,
      firstMessage: firstMessage,
      systemPrompt: systemPrompt,
      language: language,
      firestoreUtilData: FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
        delete: delete,
        fieldValues: fieldValues,
      ),
    );

AssistantStruct? updateAssistantStruct(
  AssistantStruct? assistant, {
  bool clearUnsetFields = true,
  bool create = false,
}) =>
    assistant
      ?..firestoreUtilData = FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
      );

void addAssistantStructData(
  Map<String, dynamic> firestoreData,
  AssistantStruct? assistant,
  String fieldName, [
  bool forFieldValue = false,
]) {
  firestoreData.remove(fieldName);
  if (assistant == null) {
    return;
  }
  if (assistant.firestoreUtilData.delete) {
    firestoreData[fieldName] = FieldValue.delete();
    return;
  }
  final clearFields =
      !forFieldValue && assistant.firestoreUtilData.clearUnsetFields;
  if (clearFields) {
    firestoreData[fieldName] = <String, dynamic>{};
  }
  final assistantData = getAssistantFirestoreData(assistant, forFieldValue);
  final nestedData = assistantData.map((k, v) => MapEntry('$fieldName.$k', v));

  final mergeFields = assistant.firestoreUtilData.create || clearFields;
  firestoreData
      .addAll(mergeFields ? mergeNestedFields(nestedData) : nestedData);
}

Map<String, dynamic> getAssistantFirestoreData(
  AssistantStruct? assistant, [
  bool forFieldValue = false,
]) {
  if (assistant == null) {
    return {};
  }
  final firestoreData = mapToFirestore(assistant.toMap());

  // Add any Firestore field values
  assistant.firestoreUtilData.fieldValues
      .forEach((k, v) => firestoreData[k] = v);

  return forFieldValue ? mergeNestedFields(firestoreData) : firestoreData;
}

List<Map<String, dynamic>> getAssistantListFirestoreData(
  List<AssistantStruct>? assistants,
) =>
    assistants?.map((e) => getAssistantFirestoreData(e, true)).toList() ?? [];
