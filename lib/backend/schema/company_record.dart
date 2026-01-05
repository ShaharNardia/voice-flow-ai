import 'dart:async';

import 'package:collection/collection.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class CompanyRecord extends FirestoreRecord {
  CompanyRecord._(
    DocumentReference reference,
    Map<String, dynamic> data,
  ) : super(reference, data) {
    _initializeFields();
  }

  // "name" field.
  String? _name;
  String get name => _name ?? '';
  bool hasName() => _name != null;

  // "industry" field.
  String? _industry;
  String get industry => _industry ?? '';
  bool hasIndustry() => _industry != null;

  // "companyLink" field.
  String? _companyLink;
  String get companyLink => _companyLink ?? '';
  bool hasCompanyLink() => _companyLink != null;

  // "schedule" field.
  List<ScheduleStruct>? _schedule;
  List<ScheduleStruct> get schedule => _schedule ?? const [];
  bool hasSchedule() => _schedule != null;

  // "timeZone" field.
  String? _timeZone;
  String get timeZone => _timeZone ?? '';
  bool hasTimeZone() => _timeZone != null;

  // "service" field.
  List<ServiceStruct>? _service;
  List<ServiceStruct> get service => _service ?? const [];
  bool hasService() => _service != null;

  // "promptType" field.
  String? _promptType;
  String get promptType => _promptType ?? '';
  bool hasPromptType() => _promptType != null;

  // "aiHandleInbound" field.
  bool? _aiHandleInbound;
  bool get aiHandleInbound => _aiHandleInbound ?? false;
  bool hasAiHandleInbound() => _aiHandleInbound != null;

  // "emailOutbound" field.
  bool? _emailOutbound;
  bool get emailOutbound => _emailOutbound ?? false;
  bool hasEmailOutbound() => _emailOutbound != null;

  // "smsNotification" field.
  bool? _smsNotification;
  bool get smsNotification => _smsNotification ?? false;
  bool hasSmsNotification() => _smsNotification != null;

  // "outboundCallHandling" field.
  bool? _outboundCallHandling;
  bool get outboundCallHandling => _outboundCallHandling ?? false;
  bool hasOutboundCallHandling() => _outboundCallHandling != null;

  // "offerFreeEstimation" field.
  bool? _offerFreeEstimation;
  bool get offerFreeEstimation => _offerFreeEstimation ?? false;
  bool hasOfferFreeEstimation() => _offerFreeEstimation != null;

  // "fallBackNumber" field.
  String? _fallBackNumber;
  String get fallBackNumber => _fallBackNumber ?? '';
  bool hasFallBackNumber() => _fallBackNumber != null;

  // "leaveMessagePermission" field.
  bool? _leaveMessagePermission;
  bool get leaveMessagePermission => _leaveMessagePermission ?? false;
  bool hasLeaveMessagePermission() => _leaveMessagePermission != null;

  // "createJobPermission" field.
  bool? _createJobPermission;
  bool get createJobPermission => _createJobPermission ?? false;
  bool hasCreateJobPermission() => _createJobPermission != null;

  // "reshedulePermission" field.
  bool? _reshedulePermission;
  bool get reshedulePermission => _reshedulePermission ?? false;
  bool hasReshedulePermission() => _reshedulePermission != null;

  // "cancelPermission" field.
  bool? _cancelPermission;
  bool get cancelPermission => _cancelPermission ?? false;
  bool hasCancelPermission() => _cancelPermission != null;

  // "addNotePermission" field.
  bool? _addNotePermission;
  bool get addNotePermission => _addNotePermission ?? false;
  bool hasAddNotePermission() => _addNotePermission != null;

  // "priceRestriction" field.
  bool? _priceRestriction;
  bool get priceRestriction => _priceRestriction ?? false;
  bool hasPriceRestriction() => _priceRestriction != null;

  // "legalRestriction" field.
  bool? _legalRestriction;
  bool get legalRestriction => _legalRestriction ?? false;
  bool hasLegalRestriction() => _legalRestriction != null;

  // "MedicalRestriction" field.
  bool? _medicalRestriction;
  bool get medicalRestriction => _medicalRestriction ?? false;
  bool hasMedicalRestriction() => _medicalRestriction != null;

  // "personalQuestion" field.
  bool? _personalQuestion;
  bool get personalQuestion => _personalQuestion ?? false;
  bool hasPersonalQuestion() => _personalQuestion != null;

  // "additionalRestrictionTopics" field.
  String? _additionalRestrictionTopics;
  String get additionalRestrictionTopics => _additionalRestrictionTopics ?? '';
  bool hasAdditionalRestrictionTopics() => _additionalRestrictionTopics != null;

  // "assistantname" field.
  String? _assistantname;
  String get assistantname => _assistantname ?? '';
  bool hasAssistantname() => _assistantname != null;

  // "userId" field.
  DocumentReference? _userId;
  DocumentReference? get userId => _userId;
  bool hasUserId() => _userId != null;

  // "companyPhoneNumbers" field.
  List<String>? _companyPhoneNumbers;
  List<String> get companyPhoneNumbers => _companyPhoneNumbers ?? const [];
  bool hasCompanyPhoneNumbers() => _companyPhoneNumbers != null;

  // "smtp" field.
  SmtpStruct? _smtp;
  SmtpStruct get smtp => _smtp ?? SmtpStruct();
  bool hasSmtp() => _smtp != null;

  // "phoneNumberMap" field.
  List<PhoneNumberStruct>? _phoneNumberMap;
  List<PhoneNumberStruct> get phoneNumberMap => _phoneNumberMap ?? const [];
  bool hasPhoneNumberMap() => _phoneNumberMap != null;

  // "credits" field.
  double? _credits;
  double get credits => _credits ?? 0.0;
  bool hasCredits() => _credits != null;

  // "minutes" field.
  double? _minutes;
  double get minutes => _minutes ?? 0.0;
  bool hasMinutes() => _minutes != null;

  // "companyMinutesRate" field.
  double? _companyMinutesRate;
  double get companyMinutesRate => _companyMinutesRate ?? 0.0;
  bool hasCompanyMinutesRate() => _companyMinutesRate != null;

  // "serviceAreas" field.
  List<ServiceAreaStruct>? _serviceAreas;
  List<ServiceAreaStruct> get serviceAreas => _serviceAreas ?? const [];
  bool hasServiceAreas() => _serviceAreas != null;

  // "isTwentyFourBySeven" field.
  bool? _isTwentyFourBySeven;
  bool get isTwentyFourBySeven => _isTwentyFourBySeven ?? false;
  bool hasIsTwentyFourBySeven() => _isTwentyFourBySeven != null;

  // "additionalInsturctions" field.
  String? _additionalInsturctions;
  String get additionalInsturctions => _additionalInsturctions ?? '';
  bool hasAdditionalInsturctions() => _additionalInsturctions != null;

  // "agent" field.
  String? _agent;
  String get agent => _agent ?? '';
  bool hasAgent() => _agent != null;

  // "provider" field.
  String? _provider;
  String get provider => _provider ?? '';
  bool hasProvider() => _provider != null;

  // "language" field.
  String? _language;
  String get language => _language ?? '';
  bool hasLanguage() => _language != null;

  // "modelname" field.
  String? _modelname;
  String get modelname => _modelname ?? '';
  bool hasModelname() => _modelname != null;

  // "inboundmessage" field.
  String? _inboundmessage;
  String get inboundmessage => _inboundmessage ?? '';
  bool hasInboundmessage() => _inboundmessage != null;

  // "outboundmessage" field.
  String? _outboundmessage;
  String get outboundmessage => _outboundmessage ?? '';
  bool hasOutboundmessage() => _outboundmessage != null;

  // "voice" field.
  String? _voice;
  String get voice => _voice ?? '';
  bool hasVoice() => _voice != null;

  // "modelvoice" field.
  String? _modelvoice;
  String get modelvoice => _modelvoice ?? '';
  bool hasModelvoice() => _modelvoice != null;

  // "telephonyProvider" field - 'twilio' or 'asterisk'
  String? _telephonyProvider;
  String get telephonyProvider => _telephonyProvider ?? 'twilio';
  bool hasTelephonyProvider() => _telephonyProvider != null;

  // "asteriskBridgeUrl" field - URL of Asterisk Bridge service
  String? _asteriskBridgeUrl;
  String get asteriskBridgeUrl => _asteriskBridgeUrl ?? '';
  bool hasAsteriskBridgeUrl() => _asteriskBridgeUrl != null;

  // "asteriskBridgeSecret" field - API secret for Asterisk Bridge
  String? _asteriskBridgeSecret;
  String get asteriskBridgeSecret => _asteriskBridgeSecret ?? '';
  bool hasAsteriskBridgeSecret() => _asteriskBridgeSecret != null;

  // "asteriskCallerId" field - Default caller ID for Asterisk calls
  String? _asteriskCallerId;
  String get asteriskCallerId => _asteriskCallerId ?? '';
  bool hasAsteriskCallerId() => _asteriskCallerId != null;

  // "sipTrunkName" field - SIP trunk name in Asterisk
  String? _sipTrunkName;
  String get sipTrunkName => _sipTrunkName ?? '';
  bool hasSipTrunkName() => _sipTrunkName != null;

  // "defaultDdi" field - Default DDI number
  String? _defaultDdi;
  String get defaultDdi => _defaultDdi ?? '';
  bool hasDefaultDdi() => _defaultDdi != null;

  void _initializeFields() {
    _name = snapshotData['name'] as String?;
    _industry = snapshotData['industry'] as String?;
    _companyLink = snapshotData['companyLink'] as String?;
    _schedule = getStructList(
      snapshotData['schedule'],
      ScheduleStruct.fromMap,
    );
    _timeZone = snapshotData['timeZone'] as String?;
    _service = getStructList(
      snapshotData['service'],
      ServiceStruct.fromMap,
    );
    _promptType = snapshotData['promptType'] as String?;
    _aiHandleInbound = snapshotData['aiHandleInbound'] as bool?;
    _emailOutbound = snapshotData['emailOutbound'] as bool?;
    _smsNotification = snapshotData['smsNotification'] as bool?;
    _outboundCallHandling = snapshotData['outboundCallHandling'] as bool?;
    _offerFreeEstimation = snapshotData['offerFreeEstimation'] as bool?;
    _fallBackNumber = snapshotData['fallBackNumber'] as String?;
    _leaveMessagePermission = snapshotData['leaveMessagePermission'] as bool?;
    _createJobPermission = snapshotData['createJobPermission'] as bool?;
    _reshedulePermission = snapshotData['reshedulePermission'] as bool?;
    _cancelPermission = snapshotData['cancelPermission'] as bool?;
    _addNotePermission = snapshotData['addNotePermission'] as bool?;
    _priceRestriction = snapshotData['priceRestriction'] as bool?;
    _legalRestriction = snapshotData['legalRestriction'] as bool?;
    _medicalRestriction = snapshotData['MedicalRestriction'] as bool?;
    _personalQuestion = snapshotData['personalQuestion'] as bool?;
    _additionalRestrictionTopics =
        snapshotData['additionalRestrictionTopics'] as String?;
    _assistantname = snapshotData['assistantname'] as String?;
    _userId = snapshotData['userId'] as DocumentReference?;
    _companyPhoneNumbers = getDataList(snapshotData['companyPhoneNumbers']);
    _smtp = snapshotData['smtp'] is SmtpStruct
        ? snapshotData['smtp']
        : SmtpStruct.maybeFromMap(snapshotData['smtp']);
    _phoneNumberMap = getStructList(
      snapshotData['phoneNumberMap'],
      PhoneNumberStruct.fromMap,
    );
    _credits = castToType<double>(snapshotData['credits']);
    _minutes = castToType<double>(snapshotData['minutes']);
    _companyMinutesRate =
        castToType<double>(snapshotData['companyMinutesRate']);
    _serviceAreas = getStructList(
      snapshotData['serviceAreas'],
      ServiceAreaStruct.fromMap,
    );
    _isTwentyFourBySeven = snapshotData['isTwentyFourBySeven'] as bool?;
    _additionalInsturctions = snapshotData['additionalInsturctions'] as String?;
    _agent = snapshotData['agent'] as String?;
    _provider = snapshotData['provider'] as String?;
    _language = snapshotData['language'] as String?;
    _modelname = snapshotData['modelname'] as String?;
    _inboundmessage = snapshotData['inboundmessage'] as String?;
    _outboundmessage = snapshotData['outboundmessage'] as String?;
    _voice = snapshotData['voice'] as String?;
    _modelvoice = snapshotData['modelvoice'] as String?;
    _telephonyProvider = snapshotData['telephonyProvider'] as String?;
    _asteriskBridgeUrl = snapshotData['asteriskBridgeUrl'] as String?;
    _asteriskBridgeSecret = snapshotData['asteriskBridgeSecret'] as String?;
    _asteriskCallerId = snapshotData['asteriskCallerId'] as String?;
    _sipTrunkName = snapshotData['sipTrunkName'] as String?;
    _defaultDdi = snapshotData['defaultDdi'] as String?;
  }

  static CollectionReference get collection =>
      FirebaseFirestore.instance.collection('Company');

  static Stream<CompanyRecord> getDocument(DocumentReference ref) =>
      ref.snapshots().map((s) => CompanyRecord.fromSnapshot(s));

  static Future<CompanyRecord> getDocumentOnce(DocumentReference ref) =>
      ref.get().then((s) => CompanyRecord.fromSnapshot(s));

  static CompanyRecord fromSnapshot(DocumentSnapshot snapshot) =>
      CompanyRecord._(
        snapshot.reference,
        mapFromFirestore(snapshot.data() as Map<String, dynamic>),
      );

  static CompanyRecord getDocumentFromData(
    Map<String, dynamic> data,
    DocumentReference reference,
  ) =>
      CompanyRecord._(reference, mapFromFirestore(data));

  @override
  String toString() =>
      'CompanyRecord(reference: ${reference.path}, data: $snapshotData)';

  @override
  int get hashCode => reference.path.hashCode;

  @override
  bool operator ==(other) =>
      other is CompanyRecord &&
      reference.path.hashCode == other.reference.path.hashCode;
}

Map<String, dynamic> createCompanyRecordData({
  String? name,
  String? industry,
  String? companyLink,
  String? timeZone,
  String? promptType,
  bool? aiHandleInbound,
  bool? emailOutbound,
  bool? smsNotification,
  bool? outboundCallHandling,
  bool? offerFreeEstimation,
  String? fallBackNumber,
  bool? leaveMessagePermission,
  bool? createJobPermission,
  bool? reshedulePermission,
  bool? cancelPermission,
  bool? addNotePermission,
  bool? priceRestriction,
  bool? legalRestriction,
  bool? medicalRestriction,
  bool? personalQuestion,
  String? additionalRestrictionTopics,
  String? assistantname,
  DocumentReference? userId,
  SmtpStruct? smtp,
  double? credits,
  double? minutes,
  double? companyMinutesRate,
  bool? isTwentyFourBySeven,
  String? additionalInsturctions,
  String? agent,
  String? provider,
  String? language,
  String? modelname,
  String? inboundmessage,
  String? outboundmessage,
  String? voice,
  String? modelvoice,
  String? telephonyProvider,
  String? asteriskBridgeUrl,
  String? asteriskBridgeSecret,
  String? asteriskCallerId,
  String? sipTrunkName,
  String? defaultDdi,
}) {
  final firestoreData = mapToFirestore(
    <String, dynamic>{
      'name': name,
      'industry': industry,
      'companyLink': companyLink,
      'timeZone': timeZone,
      'promptType': promptType,
      'aiHandleInbound': aiHandleInbound,
      'emailOutbound': emailOutbound,
      'smsNotification': smsNotification,
      'outboundCallHandling': outboundCallHandling,
      'offerFreeEstimation': offerFreeEstimation,
      'fallBackNumber': fallBackNumber,
      'leaveMessagePermission': leaveMessagePermission,
      'createJobPermission': createJobPermission,
      'reshedulePermission': reshedulePermission,
      'cancelPermission': cancelPermission,
      'addNotePermission': addNotePermission,
      'priceRestriction': priceRestriction,
      'legalRestriction': legalRestriction,
      'MedicalRestriction': medicalRestriction,
      'personalQuestion': personalQuestion,
      'additionalRestrictionTopics': additionalRestrictionTopics,
      'assistantname': assistantname,
      'userId': userId,
      'smtp': SmtpStruct().toMap(),
      'credits': credits,
      'minutes': minutes,
      'companyMinutesRate': companyMinutesRate,
      'isTwentyFourBySeven': isTwentyFourBySeven,
      'additionalInsturctions': additionalInsturctions,
      'agent': agent,
      'provider': provider,
      'language': language,
      'modelname': modelname,
      'inboundmessage': inboundmessage,
      'outboundmessage': outboundmessage,
      'voice': voice,
      'modelvoice': modelvoice,
      'telephonyProvider': telephonyProvider,
      'asteriskBridgeUrl': asteriskBridgeUrl,
      'asteriskBridgeSecret': asteriskBridgeSecret,
      'asteriskCallerId': asteriskCallerId,
      'sipTrunkName': sipTrunkName,
      'defaultDdi': defaultDdi,
    }.withoutNulls,
  );

  // Handle nested data for "smtp" field.
  addSmtpStructData(firestoreData, smtp, 'smtp');

  return firestoreData;
}

class CompanyRecordDocumentEquality implements Equality<CompanyRecord> {
  const CompanyRecordDocumentEquality();

  @override
  bool equals(CompanyRecord? e1, CompanyRecord? e2) {
    const listEquality = ListEquality();
    return e1?.name == e2?.name &&
        e1?.industry == e2?.industry &&
        e1?.companyLink == e2?.companyLink &&
        listEquality.equals(e1?.schedule, e2?.schedule) &&
        e1?.timeZone == e2?.timeZone &&
        listEquality.equals(e1?.service, e2?.service) &&
        e1?.promptType == e2?.promptType &&
        e1?.aiHandleInbound == e2?.aiHandleInbound &&
        e1?.emailOutbound == e2?.emailOutbound &&
        e1?.smsNotification == e2?.smsNotification &&
        e1?.outboundCallHandling == e2?.outboundCallHandling &&
        e1?.offerFreeEstimation == e2?.offerFreeEstimation &&
        e1?.fallBackNumber == e2?.fallBackNumber &&
        e1?.leaveMessagePermission == e2?.leaveMessagePermission &&
        e1?.createJobPermission == e2?.createJobPermission &&
        e1?.reshedulePermission == e2?.reshedulePermission &&
        e1?.cancelPermission == e2?.cancelPermission &&
        e1?.addNotePermission == e2?.addNotePermission &&
        e1?.priceRestriction == e2?.priceRestriction &&
        e1?.legalRestriction == e2?.legalRestriction &&
        e1?.medicalRestriction == e2?.medicalRestriction &&
        e1?.personalQuestion == e2?.personalQuestion &&
        e1?.additionalRestrictionTopics == e2?.additionalRestrictionTopics &&
        e1?.assistantname == e2?.assistantname &&
        e1?.userId == e2?.userId &&
        listEquality.equals(e1?.companyPhoneNumbers, e2?.companyPhoneNumbers) &&
        e1?.smtp == e2?.smtp &&
        listEquality.equals(e1?.phoneNumberMap, e2?.phoneNumberMap) &&
        e1?.credits == e2?.credits &&
        e1?.minutes == e2?.minutes &&
        e1?.companyMinutesRate == e2?.companyMinutesRate &&
        listEquality.equals(e1?.serviceAreas, e2?.serviceAreas) &&
        e1?.isTwentyFourBySeven == e2?.isTwentyFourBySeven &&
        e1?.additionalInsturctions == e2?.additionalInsturctions &&
        e1?.agent == e2?.agent &&
        e1?.provider == e2?.provider &&
        e1?.language == e2?.language &&
        e1?.modelname == e2?.modelname &&
        e1?.inboundmessage == e2?.inboundmessage &&
        e1?.outboundmessage == e2?.outboundmessage &&
        e1?.voice == e2?.voice &&
        e1?.modelvoice == e2?.modelvoice &&
        e1?.telephonyProvider == e2?.telephonyProvider &&
        e1?.asteriskBridgeUrl == e2?.asteriskBridgeUrl &&
        e1?.asteriskBridgeSecret == e2?.asteriskBridgeSecret &&
        e1?.asteriskCallerId == e2?.asteriskCallerId &&
        e1?.sipTrunkName == e2?.sipTrunkName &&
        e1?.defaultDdi == e2?.defaultDdi;
  }

  @override
  int hash(CompanyRecord? e) => const ListEquality().hash([
        e?.name,
        e?.industry,
        e?.companyLink,
        e?.schedule,
        e?.timeZone,
        e?.service,
        e?.promptType,
        e?.aiHandleInbound,
        e?.emailOutbound,
        e?.smsNotification,
        e?.outboundCallHandling,
        e?.offerFreeEstimation,
        e?.fallBackNumber,
        e?.leaveMessagePermission,
        e?.createJobPermission,
        e?.reshedulePermission,
        e?.cancelPermission,
        e?.addNotePermission,
        e?.priceRestriction,
        e?.legalRestriction,
        e?.medicalRestriction,
        e?.personalQuestion,
        e?.additionalRestrictionTopics,
        e?.assistantname,
        e?.userId,
        e?.companyPhoneNumbers,
        e?.smtp,
        e?.phoneNumberMap,
        e?.credits,
        e?.minutes,
        e?.companyMinutesRate,
        e?.serviceAreas,
        e?.isTwentyFourBySeven,
        e?.additionalInsturctions,
        e?.agent,
        e?.provider,
        e?.language,
        e?.modelname,
        e?.inboundmessage,
        e?.outboundmessage,
        e?.voice,
        e?.modelvoice,
        e?.telephonyProvider,
        e?.asteriskBridgeUrl,
        e?.asteriskBridgeSecret,
        e?.asteriskCallerId,
        e?.sipTrunkName,
        e?.defaultDdi
      ]);

  @override
  bool isValidKey(Object? o) => o is CompanyRecord;
}
