// ignore_for_file: unnecessary_getters_setters

import 'package:cloud_firestore/cloud_firestore.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class ServiceAreaStruct extends FFFirebaseStruct {
  ServiceAreaStruct({
    String? city,
    String? state,
    String? zipCode,
    FirestoreUtilData firestoreUtilData = const FirestoreUtilData(),
  })  : _city = city,
        _state = state,
        _zipCode = zipCode,
        super(firestoreUtilData);

  // "city" field.
  String? _city;
  String get city => _city ?? '';
  set city(String? val) => _city = val;

  bool hasCity() => _city != null;

  // "state" field.
  String? _state;
  String get state => _state ?? '';
  set state(String? val) => _state = val;

  bool hasState() => _state != null;

  // "zipCode" field.
  String? _zipCode;
  String get zipCode => _zipCode ?? '';
  set zipCode(String? val) => _zipCode = val;

  bool hasZipCode() => _zipCode != null;

  static ServiceAreaStruct fromMap(Map<String, dynamic> data) =>
      ServiceAreaStruct(
        city: data['city'] as String?,
        state: data['state'] as String?,
        zipCode: data['zipCode'] as String?,
      );

  static ServiceAreaStruct? maybeFromMap(dynamic data) => data is Map
      ? ServiceAreaStruct.fromMap(data.cast<String, dynamic>())
      : null;

  Map<String, dynamic> toMap() => {
        'city': _city,
        'state': _state,
        'zipCode': _zipCode,
      }.withoutNulls;

  @override
  Map<String, dynamic> toSerializableMap() => {
        'city': serializeParam(
          _city,
          ParamType.String,
        ),
        'state': serializeParam(
          _state,
          ParamType.String,
        ),
        'zipCode': serializeParam(
          _zipCode,
          ParamType.String,
        ),
      }.withoutNulls;

  static ServiceAreaStruct fromSerializableMap(Map<String, dynamic> data) =>
      ServiceAreaStruct(
        city: deserializeParam(
          data['city'],
          ParamType.String,
          false,
        ),
        state: deserializeParam(
          data['state'],
          ParamType.String,
          false,
        ),
        zipCode: deserializeParam(
          data['zipCode'],
          ParamType.String,
          false,
        ),
      );

  @override
  String toString() => 'ServiceAreaStruct(${toMap()})';

  @override
  bool operator ==(Object other) {
    return other is ServiceAreaStruct &&
        city == other.city &&
        state == other.state &&
        zipCode == other.zipCode;
  }

  @override
  int get hashCode => const ListEquality().hash([city, state, zipCode]);
}

ServiceAreaStruct createServiceAreaStruct({
  String? city,
  String? state,
  String? zipCode,
  Map<String, dynamic> fieldValues = const {},
  bool clearUnsetFields = true,
  bool create = false,
  bool delete = false,
}) =>
    ServiceAreaStruct(
      city: city,
      state: state,
      zipCode: zipCode,
      firestoreUtilData: FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
        delete: delete,
        fieldValues: fieldValues,
      ),
    );

ServiceAreaStruct? updateServiceAreaStruct(
  ServiceAreaStruct? serviceArea, {
  bool clearUnsetFields = true,
  bool create = false,
}) =>
    serviceArea
      ?..firestoreUtilData = FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
      );

void addServiceAreaStructData(
  Map<String, dynamic> firestoreData,
  ServiceAreaStruct? serviceArea,
  String fieldName, [
  bool forFieldValue = false,
]) {
  firestoreData.remove(fieldName);
  if (serviceArea == null) {
    return;
  }
  if (serviceArea.firestoreUtilData.delete) {
    firestoreData[fieldName] = FieldValue.delete();
    return;
  }
  final clearFields =
      !forFieldValue && serviceArea.firestoreUtilData.clearUnsetFields;
  if (clearFields) {
    firestoreData[fieldName] = <String, dynamic>{};
  }
  final serviceAreaData =
      getServiceAreaFirestoreData(serviceArea, forFieldValue);
  final nestedData =
      serviceAreaData.map((k, v) => MapEntry('$fieldName.$k', v));

  final mergeFields = serviceArea.firestoreUtilData.create || clearFields;
  firestoreData
      .addAll(mergeFields ? mergeNestedFields(nestedData) : nestedData);
}

Map<String, dynamic> getServiceAreaFirestoreData(
  ServiceAreaStruct? serviceArea, [
  bool forFieldValue = false,
]) {
  if (serviceArea == null) {
    return {};
  }
  final firestoreData = mapToFirestore(serviceArea.toMap());

  // Add any Firestore field values
  serviceArea.firestoreUtilData.fieldValues
      .forEach((k, v) => firestoreData[k] = v);

  return forFieldValue ? mergeNestedFields(firestoreData) : firestoreData;
}

List<Map<String, dynamic>> getServiceAreaListFirestoreData(
  List<ServiceAreaStruct>? serviceAreas,
) =>
    serviceAreas?.map((e) => getServiceAreaFirestoreData(e, true)).toList() ??
    [];
