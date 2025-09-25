import 'package:collection/collection.dart';

enum JobStatus {
  Unassigned,
  Pending,
  Inprogress,
  Completed,
  Cancelled,
}

enum Role {
  admin,
  agent,
}

enum UserStatus {
  active,
  inactive,
}

enum Priorty {
  Low,
  High,
  Medium,
  Urgent,
}

enum CalendarViewType {
  timeline,
  weekly,
  monthly,
}

enum Labels {
  inbound_outbound,
  transfer,
}

extension FFEnumExtensions<T extends Enum> on T {
  String serialize() => name;
}

extension FFEnumListExtensions<T extends Enum> on Iterable<T> {
  T? deserialize(String? value) =>
      firstWhereOrNull((e) => e.serialize() == value);
}

T? deserializeEnum<T>(String? value) {
  switch (T) {
    case (JobStatus):
      return JobStatus.values.deserialize(value) as T?;
    case (Role):
      return Role.values.deserialize(value) as T?;
    case (UserStatus):
      return UserStatus.values.deserialize(value) as T?;
    case (Priorty):
      return Priorty.values.deserialize(value) as T?;
    case (CalendarViewType):
      return CalendarViewType.values.deserialize(value) as T?;
    case (Labels):
      return Labels.values.deserialize(value) as T?;
    default:
      return null;
  }
}
