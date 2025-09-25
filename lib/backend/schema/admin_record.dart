import 'dart:async';

import 'package:collection/collection.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class AdminRecord extends FirestoreRecord {
  AdminRecord._(
    DocumentReference reference,
    Map<String, dynamic> data,
  ) : super(reference, data) {
    _initializeFields();
  }

  // "successurl" field.
  String? _successurl;
  String get successurl => _successurl ?? '';
  bool hasSuccessurl() => _successurl != null;

  // "cancelurl" field.
  String? _cancelurl;
  String get cancelurl => _cancelurl ?? '';
  bool hasCancelurl() => _cancelurl != null;

  // "count" field.
  int? _count;
  int get count => _count ?? 0;
  bool hasCount() => _count != null;

  void _initializeFields() {
    _successurl = snapshotData['successurl'] as String?;
    _cancelurl = snapshotData['cancelurl'] as String?;
    _count = castToType<int>(snapshotData['count']);
  }

  static CollectionReference get collection =>
      FirebaseFirestore.instance.collection('admin');

  static Stream<AdminRecord> getDocument(DocumentReference ref) =>
      ref.snapshots().map((s) => AdminRecord.fromSnapshot(s));

  static Future<AdminRecord> getDocumentOnce(DocumentReference ref) =>
      ref.get().then((s) => AdminRecord.fromSnapshot(s));

  static AdminRecord fromSnapshot(DocumentSnapshot snapshot) => AdminRecord._(
        snapshot.reference,
        mapFromFirestore(snapshot.data() as Map<String, dynamic>),
      );

  static AdminRecord getDocumentFromData(
    Map<String, dynamic> data,
    DocumentReference reference,
  ) =>
      AdminRecord._(reference, mapFromFirestore(data));

  @override
  String toString() =>
      'AdminRecord(reference: ${reference.path}, data: $snapshotData)';

  @override
  int get hashCode => reference.path.hashCode;

  @override
  bool operator ==(other) =>
      other is AdminRecord &&
      reference.path.hashCode == other.reference.path.hashCode;
}

Map<String, dynamic> createAdminRecordData({
  String? successurl,
  String? cancelurl,
  int? count,
}) {
  final firestoreData = mapToFirestore(
    <String, dynamic>{
      'successurl': successurl,
      'cancelurl': cancelurl,
      'count': count,
    }.withoutNulls,
  );

  return firestoreData;
}

class AdminRecordDocumentEquality implements Equality<AdminRecord> {
  const AdminRecordDocumentEquality();

  @override
  bool equals(AdminRecord? e1, AdminRecord? e2) {
    return e1?.successurl == e2?.successurl &&
        e1?.cancelurl == e2?.cancelurl &&
        e1?.count == e2?.count;
  }

  @override
  int hash(AdminRecord? e) =>
      const ListEquality().hash([e?.successurl, e?.cancelurl, e?.count]);

  @override
  bool isValidKey(Object? o) => o is AdminRecord;
}
