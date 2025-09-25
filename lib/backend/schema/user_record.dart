import 'dart:async';

import 'package:collection/collection.dart';

import '/backend/schema/util/firestore_util.dart';
import '/backend/schema/util/schema_util.dart';
import '/backend/schema/enums/enums.dart';

import 'index.dart';
import '/flutter_flow/flutter_flow_util.dart';

class UserRecord extends FirestoreRecord {
  UserRecord._(
    DocumentReference reference,
    Map<String, dynamic> data,
  ) : super(reference, data) {
    _initializeFields();
  }

  // "email" field.
  String? _email;
  String get email => _email ?? '';
  bool hasEmail() => _email != null;

  // "display_name" field.
  String? _displayName;
  String get displayName => _displayName ?? '';
  bool hasDisplayName() => _displayName != null;

  // "photo_url" field.
  String? _photoUrl;
  String get photoUrl => _photoUrl ?? '';
  bool hasPhotoUrl() => _photoUrl != null;

  // "uid" field.
  String? _uid;
  String get uid => _uid ?? '';
  bool hasUid() => _uid != null;

  // "created_time" field.
  DateTime? _createdTime;
  DateTime? get createdTime => _createdTime;
  bool hasCreatedTime() => _createdTime != null;

  // "phone_number" field.
  String? _phoneNumber;
  String get phoneNumber => _phoneNumber ?? '';
  bool hasPhoneNumber() => _phoneNumber != null;

  // "address" field.
  String? _address;
  String get address => _address ?? '';
  bool hasAddress() => _address != null;

  // "strip_payment_id" field.
  String? _stripPaymentId;
  String get stripPaymentId => _stripPaymentId ?? '';
  bool hasStripPaymentId() => _stripPaymentId != null;

  // "subscriptionExpireDate" field.
  DateTime? _subscriptionExpireDate;
  DateTime? get subscriptionExpireDate => _subscriptionExpireDate;
  bool hasSubscriptionExpireDate() => _subscriptionExpireDate != null;

  // "assistants" field.
  List<AssistantStruct>? _assistants;
  List<AssistantStruct> get assistants => _assistants ?? const [];
  bool hasAssistants() => _assistants != null;

  // "role" field.
  Role? _role;
  Role? get role => _role;
  bool hasRole() => _role != null;

  // "status" field.
  UserStatus? _status;
  UserStatus? get status => _status;
  bool hasStatus() => _status != null;

  // "permission" field.
  List<String>? _permission;
  List<String> get permission => _permission ?? const [];
  bool hasPermission() => _permission != null;

  // "company" field.
  DocumentReference? _company;
  DocumentReference? get company => _company;
  bool hasCompany() => _company != null;

  // "subscribed" field.
  bool? _subscribed;
  bool get subscribed => _subscribed ?? false;
  bool hasSubscribed() => _subscribed != null;

  // "stripe_subscription_status" field.
  String? _stripeSubscriptionStatus;
  String get stripeSubscriptionStatus => _stripeSubscriptionStatus ?? '';
  bool hasStripeSubscriptionStatus() => _stripeSubscriptionStatus != null;

  // "stripe_subscription_id" field.
  String? _stripeSubscriptionId;
  String get stripeSubscriptionId => _stripeSubscriptionId ?? '';
  bool hasStripeSubscriptionId() => _stripeSubscriptionId != null;

  // "profile_completed" field.
  bool? _profileCompleted;
  bool get profileCompleted => _profileCompleted ?? false;
  bool hasProfileCompleted() => _profileCompleted != null;

  // "credits" field.
  double? _credits;
  double get credits => _credits ?? 0.0;
  bool hasCredits() => _credits != null;

  // "stripe_customer_id" field.
  String? _stripeCustomerId;
  String get stripeCustomerId => _stripeCustomerId ?? '';
  bool hasStripeCustomerId() => _stripeCustomerId != null;

  void _initializeFields() {
    _email = snapshotData['email'] as String?;
    _displayName = snapshotData['display_name'] as String?;
    _photoUrl = snapshotData['photo_url'] as String?;
    _uid = snapshotData['uid'] as String?;
    _createdTime = snapshotData['created_time'] as DateTime?;
    _phoneNumber = snapshotData['phone_number'] as String?;
    _address = snapshotData['address'] as String?;
    _stripPaymentId = snapshotData['strip_payment_id'] as String?;
    _subscriptionExpireDate =
        snapshotData['subscriptionExpireDate'] as DateTime?;
    _assistants = getStructList(
      snapshotData['assistants'],
      AssistantStruct.fromMap,
    );
    _role = snapshotData['role'] is Role
        ? snapshotData['role']
        : deserializeEnum<Role>(snapshotData['role']);
    _status = snapshotData['status'] is UserStatus
        ? snapshotData['status']
        : deserializeEnum<UserStatus>(snapshotData['status']);
    _permission = getDataList(snapshotData['permission']);
    _company = snapshotData['company'] as DocumentReference?;
    _subscribed = snapshotData['subscribed'] as bool?;
    _stripeSubscriptionStatus =
        snapshotData['stripe_subscription_status'] as String?;
    _stripeSubscriptionId = snapshotData['stripe_subscription_id'] as String?;
    _profileCompleted = snapshotData['profile_completed'] as bool?;
    _credits = castToType<double>(snapshotData['credits']);
    _stripeCustomerId = snapshotData['stripe_customer_id'] as String?;
  }

  static CollectionReference get collection =>
      FirebaseFirestore.instance.collection('user');

  static Stream<UserRecord> getDocument(DocumentReference ref) =>
      ref.snapshots().map((s) => UserRecord.fromSnapshot(s));

  static Future<UserRecord> getDocumentOnce(DocumentReference ref) =>
      ref.get().then((s) => UserRecord.fromSnapshot(s));

  static UserRecord fromSnapshot(DocumentSnapshot snapshot) => UserRecord._(
        snapshot.reference,
        mapFromFirestore(snapshot.data() as Map<String, dynamic>),
      );

  static UserRecord getDocumentFromData(
    Map<String, dynamic> data,
    DocumentReference reference,
  ) =>
      UserRecord._(reference, mapFromFirestore(data));

  @override
  String toString() =>
      'UserRecord(reference: ${reference.path}, data: $snapshotData)';

  @override
  int get hashCode => reference.path.hashCode;

  @override
  bool operator ==(other) =>
      other is UserRecord &&
      reference.path.hashCode == other.reference.path.hashCode;
}

Map<String, dynamic> createUserRecordData({
  String? email,
  String? displayName,
  String? photoUrl,
  String? uid,
  DateTime? createdTime,
  String? phoneNumber,
  String? address,
  String? stripPaymentId,
  DateTime? subscriptionExpireDate,
  Role? role,
  UserStatus? status,
  DocumentReference? company,
  bool? subscribed,
  String? stripeSubscriptionStatus,
  String? stripeSubscriptionId,
  bool? profileCompleted,
  double? credits,
  String? stripeCustomerId,
}) {
  final firestoreData = mapToFirestore(
    <String, dynamic>{
      'email': email,
      'display_name': displayName,
      'photo_url': photoUrl,
      'uid': uid,
      'created_time': createdTime,
      'phone_number': phoneNumber,
      'address': address,
      'strip_payment_id': stripPaymentId,
      'subscriptionExpireDate': subscriptionExpireDate,
      'role': role,
      'status': status,
      'company': company,
      'subscribed': subscribed,
      'stripe_subscription_status': stripeSubscriptionStatus,
      'stripe_subscription_id': stripeSubscriptionId,
      'profile_completed': profileCompleted,
      'credits': credits,
      'stripe_customer_id': stripeCustomerId,
    }.withoutNulls,
  );

  return firestoreData;
}

class UserRecordDocumentEquality implements Equality<UserRecord> {
  const UserRecordDocumentEquality();

  @override
  bool equals(UserRecord? e1, UserRecord? e2) {
    const listEquality = ListEquality();
    return e1?.email == e2?.email &&
        e1?.displayName == e2?.displayName &&
        e1?.photoUrl == e2?.photoUrl &&
        e1?.uid == e2?.uid &&
        e1?.createdTime == e2?.createdTime &&
        e1?.phoneNumber == e2?.phoneNumber &&
        e1?.address == e2?.address &&
        e1?.stripPaymentId == e2?.stripPaymentId &&
        e1?.subscriptionExpireDate == e2?.subscriptionExpireDate &&
        listEquality.equals(e1?.assistants, e2?.assistants) &&
        e1?.role == e2?.role &&
        e1?.status == e2?.status &&
        listEquality.equals(e1?.permission, e2?.permission) &&
        e1?.company == e2?.company &&
        e1?.subscribed == e2?.subscribed &&
        e1?.stripeSubscriptionStatus == e2?.stripeSubscriptionStatus &&
        e1?.stripeSubscriptionId == e2?.stripeSubscriptionId &&
        e1?.profileCompleted == e2?.profileCompleted &&
        e1?.credits == e2?.credits &&
        e1?.stripeCustomerId == e2?.stripeCustomerId;
  }

  @override
  int hash(UserRecord? e) => const ListEquality().hash([
        e?.email,
        e?.displayName,
        e?.photoUrl,
        e?.uid,
        e?.createdTime,
        e?.phoneNumber,
        e?.address,
        e?.stripPaymentId,
        e?.subscriptionExpireDate,
        e?.assistants,
        e?.role,
        e?.status,
        e?.permission,
        e?.company,
        e?.subscribed,
        e?.stripeSubscriptionStatus,
        e?.stripeSubscriptionId,
        e?.profileCompleted,
        e?.credits,
        e?.stripeCustomerId
      ]);

  @override
  bool isValidKey(Object? o) => o is UserRecord;
}
