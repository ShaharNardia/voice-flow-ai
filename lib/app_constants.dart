abstract class FFAppConstants {
  static const String cloudFunctionsBaseUrl =
      'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';

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

  // Voice Service Endpoints (Twilio-based)
  static const String placeCallEndpoint =
      '$cloudFunctionsBaseUrl/placeCall';

  static const String searchPhoneNumbersEndpoint =
      '$cloudFunctionsBaseUrl/searchPhoneNumbers';

  static const String purchasePhoneNumberEndpoint =
      '$cloudFunctionsBaseUrl/purchasePhoneNumber';

  static const String configurePhoneNumberEndpoint =
      '$cloudFunctionsBaseUrl/configurePhoneNumber';

  static const String releasePhoneNumberEndpoint =
      '$cloudFunctionsBaseUrl/releasePhoneNumber';

  // Assistant Endpoints (Firebase-based)
  static const String assistantsCreateEndpoint =
      '$cloudFunctionsBaseUrl/assistantsCreate';

  static const String assistantsUpdateEndpoint =
      '$cloudFunctionsBaseUrl/assistantsUpdate';

  static const String assistantsDeleteEndpoint =
      '$cloudFunctionsBaseUrl/assistantsDelete';

  static const String assistantsListEndpoint =
      '$cloudFunctionsBaseUrl/assistantsList';

  static const String assistantsGetEndpoint =
      '$cloudFunctionsBaseUrl/assistantsGet';

  // Webhook Endpoints
  static const String twilioVoiceWebhookEndpoint =
      '$cloudFunctionsBaseUrl/twilioVoiceWebhook';

  static const String twilioStatusCallbackEndpoint =
      '$cloudFunctionsBaseUrl/twilioStatusCallback';

  // Additional Service Endpoints
  static const String createJobEndpoint =
      '$cloudFunctionsBaseUrl/createJob';

  static const String createAgentEndpoint =
      '$cloudFunctionsBaseUrl/createAgent';

  static const String sendMailEndpoint =
      '$cloudFunctionsBaseUrl/sendMailToCustomer';

  // TTS Service Endpoints
  static const String listTtsVoicesEndpoint =
      '$cloudFunctionsBaseUrl/listTtsVoices';

  static const String synthesizeTtsEndpoint =
      '$cloudFunctionsBaseUrl/synthesizeTts';
}
