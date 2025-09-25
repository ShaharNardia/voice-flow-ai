import 'dart:async';

import 'package:collection/collection.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class TechnicianRecord extends FirestoreRecord {
  TechnicianRecord._(
    DocumentReference reference,
    Map<String, dynamic> data,
  ) : super(reference, data) {
    _initializeFields();
  }

  // "email" field.
  String? _email;
  String get email => _email ?? '';
  bool hasEmail() => _email != null;

  // "name" field.
  String? _name;
  String get name => _name ?? '';
  bool hasName() => _name != null;

  // "speclization" field.
  List<String>? _speclization;
  List<String> get speclization => _speclization ?? const [];
  bool hasSpeclization() => _speclization != null;

  // "status" field.
  UserStatus? _status;
  UserStatus? get status => _status;
  bool hasStatus() => _status != null;

  // "createDate" field.
  DateTime? _createDate;
  DateTime? get createDate => _createDate;
  bool hasCreateDate() => _createDate != null;

  // "imageUrl" field.
  String? _imageUrl;
  String get imageUrl => _imageUrl ?? '';
  bool hasImageUrl() => _imageUrl != null;

  // "color" field.
  Color? _color;
  Color? get color => _color;
  bool hasColor() => _color != null;

  // "phoneNumber" field.
  String? _phoneNumber;
  String get phoneNumber => _phoneNumber ?? '';
  bool hasPhoneNumber() => _phoneNumber != null;

  // "company" field.
  DocumentReference? _company;
  DocumentReference? get company => _company;
  bool hasCompany() => _company != null;

  void _initializeFields() {
    _email = snapshotData['email'] as String?;
    _name = snapshotData['name'] as String?;
    _speclization = getDataList(snapshotData['speclization']);
    _status = snapshotData['status'] is UserStatus
        ? snapshotData['status']
        : deserializeEnum<UserStatus>(snapshotData['status']);
    _createDate = snapshotData['createDate'] as DateTime?;
    _imageUrl = snapshotData['imageUrl'] as String?;
    _color = getSchemaColor(snapshotData['color']);
    _phoneNumber = snapshotData['phoneNumber'] as String?;
    _company = snapshotData['company'] as DocumentReference?;
  }

  static CollectionReference get collection =>
      FirebaseFirestore.instance.collection('Technician');

  static Stream<TechnicianRecord> getDocument(DocumentReference ref) =>
      ref.snapshots().map((s) => TechnicianRecord.fromSnapshot(s));

  static Future<TechnicianRecord> getDocumentOnce(DocumentReference ref) =>
      ref.get().then((s) => TechnicianRecord.fromSnapshot(s));

  static TechnicianRecord fromSnapshot(DocumentSnapshot snapshot) =>
      TechnicianRecord._(
        snapshot.reference,
        mapFromFirestore(snapshot.data() as Map<String, dynamic>),
      );

  static TechnicianRecord getDocumentFromData(
    Map<String, dynamic> data,
    DocumentReference reference,
  ) =>
      TechnicianRecord._(reference, mapFromFirestore(data));

  @override
  String toString() =>
      'TechnicianRecord(reference: ${reference.path}, data: $snapshotData)';

  @override
  int get hashCode => reference.path.hashCode;

  @override
  bool operator ==(other) =>
      other is TechnicianRecord &&
      reference.path.hashCode == other.reference.path.hashCode;
}

Map<String, dynamic> createTechnicianRecordData({
  String? email,
  String? name,
  UserStatus? status,
  DateTime? createDate,
  String? imageUrl,
  Color? color,
  String? phoneNumber,
  DocumentReference? company,
}) {
  final firestoreData = mapToFirestore(
    <String, dynamic>{
      'email': email,
      'name': name,
      'status': status,
      'createDate': createDate,
      'imageUrl': imageUrl,
      'color': color,
      'phoneNumber': phoneNumber,
      'company': company,
    }.withoutNulls,
  );

  return firestoreData;
}

class TechnicianRecordDocumentEquality implements Equality<TechnicianRecord> {
  const TechnicianRecordDocumentEquality();

  @override
  bool equals(TechnicianRecord? e1, TechnicianRecord? e2) {
    const listEquality = ListEquality();
    return e1?.email == e2?.email &&
        e1?.name == e2?.name &&
        listEquality.equals(e1?.speclization, e2?.speclization) &&
        e1?.status == e2?.status &&
        e1?.createDate == e2?.createDate &&
        e1?.imageUrl == e2?.imageUrl &&
        e1?.color == e2?.color &&
        e1?.phoneNumber == e2?.phoneNumber &&
        e1?.company == e2?.company;
  }

  @override
  int hash(TechnicianRecord? e) => const ListEquality().hash([
        e?.email,
        e?.name,
        e?.speclization,
        e?.status,
        e?.createDate,
        e?.imageUrl,
        e?.color,
        e?.phoneNumber,
        e?.company
      ]);

  @override
  bool isValidKey(Object? o) => o is TechnicianRecord;
}
