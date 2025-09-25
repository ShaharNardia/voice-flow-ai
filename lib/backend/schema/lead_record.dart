import 'dart:async';

import 'package:collection/collection.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class LeadRecord extends FirestoreRecord {
  LeadRecord._(
    DocumentReference reference,
    Map<String, dynamic> data,
  ) : super(reference, data) {
    _initializeFields();
  }

  // "date" field.
  DateTime? _date;
  DateTime? get date => _date;
  bool hasDate() => _date != null;

  // "email" field.
  String? _email;
  String get email => _email ?? '';
  bool hasEmail() => _email != null;

  // "name" field.
  String? _name;
  String get name => _name ?? '';
  bool hasName() => _name != null;

  // "service" field.
  String? _service;
  String get service => _service ?? '';
  bool hasService() => _service != null;

  // "callStatus" field.
  String? _callStatus;
  String get callStatus => _callStatus ?? '';
  bool hasCallStatus() => _callStatus != null;

  // "technician_name" field.
  String? _technicianName;
  String get technicianName => _technicianName ?? '';
  bool hasTechnicianName() => _technicianName != null;

  // "technician" field.
  DocumentReference? _technician;
  DocumentReference? get technician => _technician;
  bool hasTechnician() => _technician != null;

  // "status" field.
  String? _status;
  String get status => _status ?? '';
  bool hasStatus() => _status != null;

  // "source" field.
  String? _source;
  String get source => _source ?? '';
  bool hasSource() => _source != null;

  // "company" field.
  String? _company;
  String get company => _company ?? '';
  bool hasCompany() => _company != null;

  // "isClient" field.
  bool? _isClient;
  bool get isClient => _isClient ?? false;
  bool hasIsClient() => _isClient != null;

  // "address" field.
  String? _address;
  String get address => _address ?? '';
  bool hasAddress() => _address != null;

  // "phoneNumber" field.
  String? _phoneNumber;
  String get phoneNumber => _phoneNumber ?? '';
  bool hasPhoneNumber() => _phoneNumber != null;

  // "notes" field.
  String? _notes;
  String get notes => _notes ?? '';
  bool hasNotes() => _notes != null;

  // "intPhoneNumber" field.
  int? _intPhoneNumber;
  int get intPhoneNumber => _intPhoneNumber ?? 0;
  bool hasIntPhoneNumber() => _intPhoneNumber != null;

  void _initializeFields() {
    _date = snapshotData['date'] as DateTime?;
    _email = snapshotData['email'] as String?;
    _name = snapshotData['name'] as String?;
    _service = snapshotData['service'] as String?;
    _callStatus = snapshotData['callStatus'] as String?;
    _technicianName = snapshotData['technician_name'] as String?;
    _technician = snapshotData['technician'] as DocumentReference?;
    _status = snapshotData['status'] as String?;
    _source = snapshotData['source'] as String?;
    _company = snapshotData['company'] as String?;
    _isClient = snapshotData['isClient'] as bool?;
    _address = snapshotData['address'] as String?;
    _phoneNumber = snapshotData['phoneNumber'] as String?;
    _notes = snapshotData['notes'] as String?;
    _intPhoneNumber = castToType<int>(snapshotData['intPhoneNumber']);
  }

  static CollectionReference get collection =>
      FirebaseFirestore.instance.collection('Lead');

  static Stream<LeadRecord> getDocument(DocumentReference ref) =>
      ref.snapshots().map((s) => LeadRecord.fromSnapshot(s));

  static Future<LeadRecord> getDocumentOnce(DocumentReference ref) =>
      ref.get().then((s) => LeadRecord.fromSnapshot(s));

  static LeadRecord fromSnapshot(DocumentSnapshot snapshot) => LeadRecord._(
        snapshot.reference,
        mapFromFirestore(snapshot.data() as Map<String, dynamic>),
      );

  static LeadRecord getDocumentFromData(
    Map<String, dynamic> data,
    DocumentReference reference,
  ) =>
      LeadRecord._(reference, mapFromFirestore(data));

  @override
  String toString() =>
      'LeadRecord(reference: ${reference.path}, data: $snapshotData)';

  @override
  int get hashCode => reference.path.hashCode;

  @override
  bool operator ==(other) =>
      other is LeadRecord &&
      reference.path.hashCode == other.reference.path.hashCode;
}

Map<String, dynamic> createLeadRecordData({
  DateTime? date,
  String? email,
  String? name,
  String? service,
  String? callStatus,
  String? technicianName,
  DocumentReference? technician,
  String? status,
  String? source,
  String? company,
  bool? isClient,
  String? address,
  String? phoneNumber,
  String? notes,
  int? intPhoneNumber,
}) {
  final firestoreData = mapToFirestore(
    <String, dynamic>{
      'date': date,
      'email': email,
      'name': name,
      'service': service,
      'callStatus': callStatus,
      'technician_name': technicianName,
      'technician': technician,
      'status': status,
      'source': source,
      'company': company,
      'isClient': isClient,
      'address': address,
      'phoneNumber': phoneNumber,
      'notes': notes,
      'intPhoneNumber': intPhoneNumber,
    }.withoutNulls,
  );

  return firestoreData;
}

class LeadRecordDocumentEquality implements Equality<LeadRecord> {
  const LeadRecordDocumentEquality();

  @override
  bool equals(LeadRecord? e1, LeadRecord? e2) {
    return e1?.date == e2?.date &&
        e1?.email == e2?.email &&
        e1?.name == e2?.name &&
        e1?.service == e2?.service &&
        e1?.callStatus == e2?.callStatus &&
        e1?.technicianName == e2?.technicianName &&
        e1?.technician == e2?.technician &&
        e1?.status == e2?.status &&
        e1?.source == e2?.source &&
        e1?.company == e2?.company &&
        e1?.isClient == e2?.isClient &&
        e1?.address == e2?.address &&
        e1?.phoneNumber == e2?.phoneNumber &&
        e1?.notes == e2?.notes &&
        e1?.intPhoneNumber == e2?.intPhoneNumber;
  }

  @override
  int hash(LeadRecord? e) => const ListEquality().hash([
        e?.date,
        e?.email,
        e?.name,
        e?.service,
        e?.callStatus,
        e?.technicianName,
        e?.technician,
        e?.status,
        e?.source,
        e?.company,
        e?.isClient,
        e?.address,
        e?.phoneNumber,
        e?.notes,
        e?.intPhoneNumber
      ]);

  @override
  bool isValidKey(Object? o) => o is LeadRecord;
}
