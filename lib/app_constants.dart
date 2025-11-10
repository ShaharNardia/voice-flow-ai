abstract class FFAppConstants {
  static const String cloudFunctionsBaseUrl =
      'https://us-central1-voice-flow-a-i-h66sff.cloudfunctions.net';

  static const String assignAssistantEndpoint =
      '$cloudFunctionsBaseUrl/assignAssistant';

  static const String createReservationEndpoint =
      '$cloudFunctionsBaseUrl/createReservation';

  static const String endOfCallLogEndpoint =
      '$cloudFunctionsBaseUrl/endOfCallLog';

  static const String getLeadDetailsEndpoint =
      '$cloudFunctionsBaseUrl/getLeadDetails';

  static const String getPhoneNumberFromJobEndpoint =
      '$cloudFunctionsBaseUrl/getPhoneNumberFromJob';

  static const String outboundLeadTestEndpoint =
      '$cloudFunctionsBaseUrl/outboundLeadTest';

  static const String transferCallEndpoint =
      '$cloudFunctionsBaseUrl/transferCall';
}
