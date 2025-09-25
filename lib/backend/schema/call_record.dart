import 'dart:async';

import 'package:collection/collection.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class CallRecord extends FirestoreRecord {
  CallRecord._(
    DocumentReference reference,
    Map<String, dynamic> data,
  ) : super(reference, data) {
    _initializeFields();
  }

  // "id" field.
  String? _id;
  String get id => _id ?? '';
  bool hasId() => _id != null;

  // "duration" field.
  String? _duration;
  String get duration => _duration ?? '';
  bool hasDuration() => _duration != null;

  // "dateTime" field.
  DateTime? _dateTime;
  DateTime? get dateTime => _dateTime;
  bool hasDateTime() => _dateTime != null;

  // "recording" field.
  String? _recording;
  String get recording => _recording ?? '';
  bool hasRecording() => _recording != null;

  // "summary" field.
  String? _summary;
  String get summary => _summary ?? '';
  bool hasSummary() => _summary != null;

  // "fromName" field.
  String? _fromName;
  String get fromName => _fromName ?? '';
  bool hasFromName() => _fromName != null;

  // "fromNumber" field.
  int? _fromNumber;
  int get fromNumber => _fromNumber ?? 0;
  bool hasFromNumber() => _fromNumber != null;

  // "toName" field.
  String? _toName;
  String get toName => _toName ?? '';
  bool hasToName() => _toName != null;

  // "toNumber" field.
  int? _toNumber;
  int get toNumber => _toNumber ?? 0;
  bool hasToNumber() => _toNumber != null;

  // "requestType" field.
  String? _requestType;
  String get requestType => _requestType ?? '';
  bool hasRequestType() => _requestType != null;

  // "success" field.
  bool? _success;
  bool get success => _success ?? false;
  bool hasSuccess() => _success != null;

  // "callType" field.
  String? _callType;
  String get callType => _callType ?? '';
  bool hasCallType() => _callType != null;

  // "endCallReason" field.
  String? _endCallReason;
  String get endCallReason => _endCallReason ?? '';
  bool hasEndCallReason() => _endCallReason != null;

  // "messages" field.
  List<MessagesStruct>? _messages;
  List<MessagesStruct> get messages => _messages ?? const [];
  bool hasMessages() => _messages != null;

  // "company" field.
  String? _company;
  String get company => _company ?? '';
  bool hasCompany() => _company != null;

  void _initializeFields() {
    _id = snapshotData['id'] as String?;
    _duration = snapshotData['duration'] as String?;
    _dateTime = snapshotData['dateTime'] as DateTime?;
    _recording = snapshotData['recording'] as String?;
    _summary = snapshotData['summary'] as String?;
    _fromName = snapshotData['fromName'] as String?;
    _fromNumber = castToType<int>(snapshotData['fromNumber']);
    _toName = snapshotData['toName'] as String?;
    _toNumber = castToType<int>(snapshotData['toNumber']);
    _requestType = snapshotData['requestType'] as String?;
    _success = snapshotData['success'] as bool?;
    _callType = snapshotData['callType'] as String?;
    _endCallReason = snapshotData['endCallReason'] as String?;
    _messages = getStructList(
      snapshotData['messages'],
      MessagesStruct.fromMap,
    );
    _company = snapshotData['company'] as String?;
  }

  static CollectionReference get collection =>
      FirebaseFirestore.instance.collection('Call');

  static Stream<CallRecord> getDocument(DocumentReference ref) =>
      ref.snapshots().map((s) => CallRecord.fromSnapshot(s));

  static Future<CallRecord> getDocumentOnce(DocumentReference ref) =>
      ref.get().then((s) => CallRecord.fromSnapshot(s));

  static CallRecord fromSnapshot(DocumentSnapshot snapshot) => CallRecord._(
        snapshot.reference,
        mapFromFirestore(snapshot.data() as Map<String, dynamic>),
      );

  static CallRecord getDocumentFromData(
    Map<String, dynamic> data,
    DocumentReference reference,
  ) =>
      CallRecord._(reference, mapFromFirestore(data));

  @override
  String toString() =>
      'CallRecord(reference: ${reference.path}, data: $snapshotData)';

  @override
  int get hashCode => reference.path.hashCode;

  @override
  bool operator ==(other) =>
      other is CallRecord &&
      reference.path.hashCode == other.reference.path.hashCode;
}

Map<String, dynamic> createCallRecordData({
  String? id,
  String? duration,
  DateTime? dateTime,
  String? recording,
  String? summary,
  String? fromName,
  int? fromNumber,
  String? toName,
  int? toNumber,
  String? requestType,
  bool? success,
  String? callType,
  String? endCallReason,
  String? company,
}) {
  final firestoreData = mapToFirestore(
    <String, dynamic>{
      'id': id,
      'duration': duration,
      'dateTime': dateTime,
      'recording': recording,
      'summary': summary,
      'fromName': fromName,
      'fromNumber': fromNumber,
      'toName': toName,
      'toNumber': toNumber,
      'requestType': requestType,
      'success': success,
      'callType': callType,
      'endCallReason': endCallReason,
      'company': company,
    }.withoutNulls,
  );

  return firestoreData;
}

class CallRecordDocumentEquality implements Equality<CallRecord> {
  const CallRecordDocumentEquality();

  @override
  bool equals(CallRecord? e1, CallRecord? e2) {
    const listEquality = ListEquality();
    return e1?.id == e2?.id &&
        e1?.duration == e2?.duration &&
        e1?.dateTime == e2?.dateTime &&
        e1?.recording == e2?.recording &&
        e1?.summary == e2?.summary &&
        e1?.fromName == e2?.fromName &&
        e1?.fromNumber == e2?.fromNumber &&
        e1?.toName == e2?.toName &&
        e1?.toNumber == e2?.toNumber &&
        e1?.requestType == e2?.requestType &&
        e1?.success == e2?.success &&
        e1?.callType == e2?.callType &&
        e1?.endCallReason == e2?.endCallReason &&
        listEquality.equals(e1?.messages, e2?.messages) &&
        e1?.company == e2?.company;
  }

  @override
  int hash(CallRecord? e) => const ListEquality().hash([
        e?.id,
        e?.duration,
        e?.dateTime,
        e?.recording,
        e?.summary,
        e?.fromName,
        e?.fromNumber,
        e?.toName,
        e?.toNumber,
        e?.requestType,
        e?.success,
        e?.callType,
        e?.endCallReason,
        e?.messages,
        e?.company
      ]);

  @override
  bool isValidKey(Object? o) => o is CallRecord;
}
