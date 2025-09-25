// ignore_for_file: unnecessary_getters_setters

import 'package:cloud_firestore/cloud_firestore.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class SmtpStruct extends FFFirebaseStruct {
  SmtpStruct({
    String? user,
    String? password,
    String? host,
    int? port,
    bool? ssl,
    FirestoreUtilData firestoreUtilData = const FirestoreUtilData(),
  })  : _user = user,
        _password = password,
        _host = host,
        _port = port,
        _ssl = ssl,
        super(firestoreUtilData);

  // "user" field.
  String? _user;
  String get user => _user ?? '';
  set user(String? val) => _user = val;

  bool hasUser() => _user != null;

  // "password" field.
  String? _password;
  String get password => _password ?? '';
  set password(String? val) => _password = val;

  bool hasPassword() => _password != null;

  // "host" field.
  String? _host;
  String get host => _host ?? '';
  set host(String? val) => _host = val;

  bool hasHost() => _host != null;

  // "port" field.
  int? _port;
  int get port => _port ?? 0;
  set port(int? val) => _port = val;

  void incrementPort(int amount) => port = port + amount;

  bool hasPort() => _port != null;

  // "ssl" field.
  bool? _ssl;
  bool get ssl => _ssl ?? false;
  set ssl(bool? val) => _ssl = val;

  bool hasSsl() => _ssl != null;

  static SmtpStruct fromMap(Map<String, dynamic> data) => SmtpStruct(
        user: data['user'] as String?,
        password: data['password'] as String?,
        host: data['host'] as String?,
        port: castToType<int>(data['port']),
        ssl: data['ssl'] as bool?,
      );

  static SmtpStruct? maybeFromMap(dynamic data) =>
      data is Map ? SmtpStruct.fromMap(data.cast<String, dynamic>()) : null;

  Map<String, dynamic> toMap() => {
        'user': _user,
        'password': _password,
        'host': _host,
        'port': _port,
        'ssl': _ssl,
      }.withoutNulls;

  @override
  Map<String, dynamic> toSerializableMap() => {
        'user': serializeParam(
          _user,
          ParamType.String,
        ),
        'password': serializeParam(
          _password,
          ParamType.String,
        ),
        'host': serializeParam(
          _host,
          ParamType.String,
        ),
        'port': serializeParam(
          _port,
          ParamType.int,
        ),
        'ssl': serializeParam(
          _ssl,
          ParamType.bool,
        ),
      }.withoutNulls;

  static SmtpStruct fromSerializableMap(Map<String, dynamic> data) =>
      SmtpStruct(
        user: deserializeParam(
          data['user'],
          ParamType.String,
          false,
        ),
        password: deserializeParam(
          data['password'],
          ParamType.String,
          false,
        ),
        host: deserializeParam(
          data['host'],
          ParamType.String,
          false,
        ),
        port: deserializeParam(
          data['port'],
          ParamType.int,
          false,
        ),
        ssl: deserializeParam(
          data['ssl'],
          ParamType.bool,
          false,
        ),
      );

  @override
  String toString() => 'SmtpStruct(${toMap()})';

  @override
  bool operator ==(Object other) {
    return other is SmtpStruct &&
        user == other.user &&
        password == other.password &&
        host == other.host &&
        port == other.port &&
        ssl == other.ssl;
  }

  @override
  int get hashCode =>
      const ListEquality().hash([user, password, host, port, ssl]);
}

SmtpStruct createSmtpStruct({
  String? user,
  String? password,
  String? host,
  int? port,
  bool? ssl,
  Map<String, dynamic> fieldValues = const {},
  bool clearUnsetFields = true,
  bool create = false,
  bool delete = false,
}) =>
    SmtpStruct(
      user: user,
      password: password,
      host: host,
      port: port,
      ssl: ssl,
      firestoreUtilData: FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
        delete: delete,
        fieldValues: fieldValues,
      ),
    );

SmtpStruct? updateSmtpStruct(
  SmtpStruct? smtp, {
  bool clearUnsetFields = true,
  bool create = false,
}) =>
    smtp
      ?..firestoreUtilData = FirestoreUtilData(
        clearUnsetFields: clearUnsetFields,
        create: create,
      );

void addSmtpStructData(
  Map<String, dynamic> firestoreData,
  SmtpStruct? smtp,
  String fieldName, [
  bool forFieldValue = false,
]) {
  firestoreData.remove(fieldName);
  if (smtp == null) {
    return;
  }
  if (smtp.firestoreUtilData.delete) {
    firestoreData[fieldName] = FieldValue.delete();
    return;
  }
  final clearFields = !forFieldValue && smtp.firestoreUtilData.clearUnsetFields;
  if (clearFields) {
    firestoreData[fieldName] = <String, dynamic>{};
  }
  final smtpData = getSmtpFirestoreData(smtp, forFieldValue);
  final nestedData = smtpData.map((k, v) => MapEntry('$fieldName.$k', v));

  final mergeFields = smtp.firestoreUtilData.create || clearFields;
  firestoreData
      .addAll(mergeFields ? mergeNestedFields(nestedData) : nestedData);
}

Map<String, dynamic> getSmtpFirestoreData(
  SmtpStruct? smtp, [
  bool forFieldValue = false,
]) {
  if (smtp == null) {
    return {};
  }
  final firestoreData = mapToFirestore(smtp.toMap());

  // Add any Firestore field values
  smtp.firestoreUtilData.fieldValues.forEach((k, v) => firestoreData[k] = v);

  return forFieldValue ? mergeNestedFields(firestoreData) : firestoreData;
}

List<Map<String, dynamic>> getSmtpListFirestoreData(
  List<SmtpStruct>? smtps,
) =>
    smtps?.map((e) => getSmtpFirestoreData(e, true)).toList() ?? [];
