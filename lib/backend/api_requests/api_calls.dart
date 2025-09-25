import 'dart:convert';

import 'package:flutter/foundation.dart';

import '/flutter_flow/flutter_flow_util.dart';
import 'api_manager.dart';

export 'api_manager.dart' show ApiCallResponse;

// Helper function to validate UUID format
bool _isValidUuid(String? uuid) {
  if (uuid == null || uuid.isEmpty) return false;
  final uuidRegex = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', caseSensitive: false);
  return uuidRegex.hasMatch(uuid);
}

const _kPrivateApiFunctionName = 'ffPrivateApiCall';

/// Start Vapi Group Code

class VapiGroup {
  static String getBaseUrl() => 'https://api.vapi.ai';
  static Map<String, String> headers = {
    'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
  };
  static CreateAssitantCall createAssitantCall = CreateAssitantCall();
  static CreatePhoneNumberCall createPhoneNumberCall = CreatePhoneNumberCall();
  static LIstAllPhoneNumbersCall lIstAllPhoneNumbersCall =
      LIstAllPhoneNumbersCall();
  static ListPhoneCallsCall listPhoneCallsCall = ListPhoneCallsCall();
  static GetPhoneCallDetailsCall getPhoneCallDetailsCall =
      GetPhoneCallDetailsCall();
  static DeleteAssistantCall deleteAssistantCall = DeleteAssistantCall();
  static UpdateAssistantCall updateAssistantCall = UpdateAssistantCall();
  static UpdatePhoneNumberCall updatePhoneNumberCall = UpdatePhoneNumberCall();
  static GetPhoneNumberCall getPhoneNumberCall = GetPhoneNumberCall();
  static DeletePhoneCall deletePhoneCall = DeletePhoneCall();
  static GetAllAssistantsCall getAllAssistantsCall = GetAllAssistantsCall();
  static GetAssistantCopyCall getAssistantCopyCall = GetAssistantCopyCall();
  static UpdateToolCall updateToolCall = UpdateToolCall();
  static GetToolCall getToolCall = GetToolCall();
  static UpdateCallDetailsCall updateCallDetailsCall = UpdateCallDetailsCall();
  static CreateToolCall createToolCall = CreateToolCall();
  static PlaceCallCall placeCallCall = PlaceCallCall();
  static GetAssistantCall getAssistantCall = GetAssistantCall();
}

class CreateAssitantCall {
  Future<ApiCallResponse> call({
    String? systemPrompt = '',
    String? firstMessage = '',
    String? assistantName = '',
    String? language = '',
    String? userId = '',
    List<String>? toolsList,
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();
    final tools = _serializeList(toolsList);

    final ffApiRequestBody = '''
{
  "model": {
    "messages": [
      {
        "content": "${escapeStringForJson(systemPrompt)}",
        "role": "system"
      }
    ],
    "provider": "openai",
    "model": "gpt-4o",
    "fallbackModels": [
      "gpt-4-0125-preview",
      "gpt-4-0613"
    ],
    "semanticCachingEnabled": true,
    "numFastTurns": 1,
    "temperature": 0.7,
    "maxTokens": 250,
    "emotionRecognitionEnabled": true,
    "toolIds": ${tools}
  },
  "voice": {
    "inputPreprocessingEnabled": true,
    "inputMinCharacters": 10,
    "inputPunctuationBoundaries": [
      "。",
      "，",
      ".",
      "!",
      "?",
      ";",
      ")",
      "،",
      "۔",
      "।",
      "॥",
      "|",
      "||",
      ",",
      ":"
    ],
    "fillerInjectionEnabled": true,
    "provider": "vapi",
    "voiceId": "Paige",
    "speed": 1
  },
  "firstMessageMode": "assistant-speaks-first",
  "recordingEnabled": true,
  "hipaaEnabled": false,
  "clientMessages": [
    "transcript",
    "hang",
    "tool-calls",
    "speech-update",
    "metadata",
    "conversation-update"
  ],
  "serverMessages": [
    "end-of-call-report"
  ],
  "silenceTimeoutSeconds": 30,
  "responseDelaySeconds": 0.4,
  "llmRequestDelaySeconds": 0.1,
  "numWordsToInterruptAssistant": 1,
  "maxDurationSeconds": 1800,
  "backgroundSound": "off",
  "backchannelingEnabled": true,
  "name": "${escapeStringForJson(assistantName)}",
  "firstMessage": "${escapeStringForJson(firstMessage)}",
  "transcriber": {
    "provider": "deepgram",
    "model": "nova-2",
    "language": "${escapeStringForJson(language)}"
  },
  "metadata": {
    "userId": "${escapeStringForJson(userId)}"
  }
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'createAssitant',
      apiUrl: '${baseUrl}/assistant',
      callType: ApiCallType.POST,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  String? id(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.id''',
      ));
  String? name(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.name''',
      ));
}

class CreatePhoneNumberCall {
  Future<ApiCallResponse> call({
    String? number = '',
    String? name = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "provider": "twilio",
  "number": "${escapeStringForJson(number)}",
  "name": "${escapeStringForJson(name)}",
  "twilioAccountSid": "ACcf36ee2a4549fb9077606737abb6242a",
  "twilioApiKey": "SK5125bb6643e45f4bd87038ca91139cc9",
  "twilioApiSecret": "otFG5qF5vuSjbP7wzikzc1bKcDUQI9NI",
  "twilioAuthToken": "a1b1388d1698fdd866e10dd22124844c",
  "serverUrl":"https://n8n.sovanza.net/webhook/94b54353-1808-469a-8c8f-6cfadf32202c/voiceflow"
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'Create Phone Number',
      apiUrl: '${baseUrl}/phone-number',
      callType: ApiCallType.POST,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
        'Content-Type': 'application/json',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  String? id(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.id''',
      ));
  String? number(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.number''',
      ));
  String? message(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.message''',
      ));
}

class LIstAllPhoneNumbersCall {
  Future<ApiCallResponse> call() async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'LIst All Phone Numbers',
      apiUrl: '${baseUrl}/phone-number',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? phoneNumbers(dynamic response) => getJsonField(
        response,
        r'''$''',
        true,
      ) as List?;
}

class ListPhoneCallsCall {
  Future<ApiCallResponse> call({
    String? assistantId = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'List Phone Calls',
      apiUrl: '${baseUrl}/call',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? calls(dynamic response) => getJsonField(
        response,
        r'''$''',
        true,
      ) as List?;
}

class GetPhoneCallDetailsCall {
  Future<ApiCallResponse> call({
    String? callId = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'get phone call details',
      apiUrl: '${baseUrl}/call/${callId}',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class DeleteAssistantCall {
  Future<ApiCallResponse> call({
    String? id = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'deleteAssistant',
      apiUrl: '${baseUrl}/assistant/${id}',
      callType: ApiCallType.DELETE,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class UpdateAssistantCall {
  Future<ApiCallResponse> call({
    String? id = '',
    String? firstMessage = '',
    String? assistantName = '',
    String? language = '',
    String? userId = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
 "name": "${escapeStringForJson(assistantName)}",
  "firstMessage": "${escapeStringForJson(firstMessage)}",
  "transcriber": {
    "provider": "deepgram",
    "model": "nova-2",
    "language": "${escapeStringForJson(language)}"
  }
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'updateAssistant',
      apiUrl: '${baseUrl}/assistant/${id}',
      callType: ApiCallType.PATCH,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class UpdatePhoneNumberCall {
  Future<ApiCallResponse> call({
    String? id = '',
    String? assistantId = '',
    String? userId = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
"serverUrl":"https://heliowicttor.app.n8n.cloud/webhook-test/vapi-server-url"
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'updatePhoneNumber',
      apiUrl: '${baseUrl}/phone-number/${id}',
      callType: ApiCallType.PATCH,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class GetPhoneNumberCall {
  Future<ApiCallResponse> call({
    String? id = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'getPhoneNumber ',
      apiUrl: '${baseUrl}/phone-number/${id}',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class DeletePhoneCall {
  Future<ApiCallResponse> call({
    String? id = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'deletePhone',
      apiUrl: '${baseUrl}/phone-number/${id}',
      callType: ApiCallType.DELETE,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class GetAllAssistantsCall {
  Future<ApiCallResponse> call() async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'getAllAssistants',
      apiUrl: '${baseUrl}/assistant',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? assistants(dynamic response) => getJsonField(
        response,
        r'''$''',
        true,
      ) as List?;
}

class GetAssistantCopyCall {
  Future<ApiCallResponse> call({
    String? assistantId = 'a4ed12b7-5551-44b6-b2f4-cf48f1c3680b',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'getAssistant Copy',
      apiUrl: '${baseUrl}/assistant/${assistantId}',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class UpdateToolCall {
  Future<ApiCallResponse> call({
    dynamic? bodyJson,
    String? id = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    final body = _serializeJson(bodyJson);
    final ffApiRequestBody = '''
${body}''';
    return ApiManager.instance.makeApiCall(
      callName: 'Update tool',
      apiUrl: '${baseUrl}/tool/${id}',
      callType: ApiCallType.PATCH,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class GetToolCall {
  Future<ApiCallResponse> call({
    String? id = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'getTool',
      apiUrl: '${baseUrl}/tool/${id}',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class UpdateCallDetailsCall {
  Future<ApiCallResponse> call() async {
    final baseUrl = VapiGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
"artifactPlan":{
  "assistant": {
    "metadata": {
      "jobStatus": "success"
    }
  }
}
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'Update Call Details',
      apiUrl: '${baseUrl}/call/722a79b9-15dd-4a17-a8e6-fb01d1ff9234',
      callType: ApiCallType.PATCH,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class CreateToolCall {
  Future<ApiCallResponse> call({
    String? toolName = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "type": "transferCall",
  "function": {
    "name": "${escapeStringForJson(toolName)}",
    "strict": false,
    "description": "This tool will transfer technician's call to customer ensuring call masking.",
    "parameters": {
      "type": "object",
      "properties": {
        "phoneNumber": {
          "description": "This is customer's phone number where the call will be forwarded",
          "type": "string"
        }
      },
      "required": [
        "phoneNumber"
      ]
    }
  },
  "messages": [
    {
      "type": "request-start",
      "content": "Please hold on I am transferring the call to customer.",
      "blocking": false,
      "conditions": []
    }
  ],
  "async": false,
  "destinations": []
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'createTool',
      apiUrl: '${baseUrl}/tool',
      callType: ApiCallType.POST,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class PlaceCallCall {
  Future<ApiCallResponse> call({
    String? name = '',
    String? number = '',
    String? phoneNumberId = '',
    String? companyPhoneNumber = '',
    dynamic? assistantJson,
    String? industry = '',
    String? company = '',
    String? now = '',
    String? assistantName = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    final assistant = _serializeJson(assistantJson);
    final ffApiRequestBody = '''
{
  "customer": {
    "name": "${escapeStringForJson(name)}",
    "number": "${escapeStringForJson(number)}"
  },
  "assistantOverrides": {
    "variableValues": {
      "customertName": "${escapeStringForJson(name)}",
      "industry": "${escapeStringForJson(industry)}",
      "companyName": "${escapeStringForJson(company)}",
      "now": "${escapeStringForJson(now)}",
      "assistantName": "${escapeStringForJson(assistantName)}"
    }
  },
  ${_isValidUuid(phoneNumberId) ? '"phoneNumberId": "${escapeStringForJson(phoneNumberId)}"' : '"phoneNumber": {"twilioPhoneNumber": "${escapeStringForJson(companyPhoneNumber)}", "twilioAccountSid": "ACcf36ee2a4549fb9077606737abb6242a"}'},
  "assistant": ${assistant}
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'Place Call',
      apiUrl: '${baseUrl}/call',
      callType: ApiCallType.POST,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class GetAssistantCall {
  Future<ApiCallResponse> call({
    String? id = '',
  }) async {
    final baseUrl = VapiGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'getAssistant',
      apiUrl: '${baseUrl}/assistant/${id}',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': '350fcb5e-8d29-4eff-bb3d-8566e28cf09a',
      },
      params: {},
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

/// End Vapi Group Code

/// Start Stripe Group Code

class StripeGroup {
  static String getBaseUrl() => 'https://api.stripe.com/v1';
  static Map<String, String> headers = {
    'Authorization':
        'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  static CreateCustomerCall createCustomerCall = CreateCustomerCall();
  static CreateSessionCall createSessionCall = CreateSessionCall();
  static ManageSubscriptionCall manageSubscriptionCall =
      ManageSubscriptionCall();
  static GetInvoicesCall getInvoicesCall = GetInvoicesCall();
  static GetPaymentMethodsCall getPaymentMethodsCall = GetPaymentMethodsCall();
  static GetSubscriptionUsageDetailsCall getSubscriptionUsageDetailsCall =
      GetSubscriptionUsageDetailsCall();
  static SubscriptionCall subscriptionCall = SubscriptionCall();
}

class CreateCustomerCall {
  Future<ApiCallResponse> call({
    String? email = '',
  }) async {
    final baseUrl = StripeGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'createCustomer',
      apiUrl: '${baseUrl}/customers',
      callType: ApiCallType.POST,
      headers: {
        'Authorization':
            'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'email': email,
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class CreateSessionCall {
  Future<ApiCallResponse> call({
    String? customer = '',
    String? priceId = '',
    String? successUrl = '',
    String? cancelUrl = '',
  }) async {
    final baseUrl = StripeGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'createSession',
      apiUrl: '${baseUrl}/checkout/sessions',
      callType: ApiCallType.POST,
      headers: {
        'Authorization':
            'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'line_items[0][price]': priceId,
        'customer': customer,
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'mode': "subscription",
        'line_items[0][quantity]': 1,
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class ManageSubscriptionCall {
  Future<ApiCallResponse> call({
    String? customer = '',
  }) async {
    final baseUrl = StripeGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'ManageSubscription',
      apiUrl: '${baseUrl}/billing_portal/sessions',
      callType: ApiCallType.GET,
      headers: {
        'Authorization':
            'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'customer': customer,
      },
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class GetInvoicesCall {
  Future<ApiCallResponse> call({
    String? customer = '',
  }) async {
    final baseUrl = StripeGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'getInvoices',
      apiUrl: '${baseUrl}/invoices',
      callType: ApiCallType.GET,
      headers: {
        'Authorization':
            'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'customer': customer,
      },
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? billinghistory(dynamic response) => getJsonField(
        response,
        r'''$.data''',
        true,
      ) as List?;
}

class GetPaymentMethodsCall {
  Future<ApiCallResponse> call({
    String? customer = '',
  }) async {
    final baseUrl = StripeGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'GetPaymentMethods',
      apiUrl: '${baseUrl}/payment_methods',
      callType: ApiCallType.GET,
      headers: {
        'Authorization':
            'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'customer': customer,
      },
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? paymentmethod(dynamic response) => getJsonField(
        response,
        r'''$.data''',
        true,
      ) as List?;
}

class GetSubscriptionUsageDetailsCall {
  Future<ApiCallResponse> call({
    String? coustmer = '',
  }) async {
    final baseUrl = StripeGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'Get Subscription Usage Details',
      apiUrl: '${baseUrl}/subscriptions',
      callType: ApiCallType.GET,
      headers: {
        'Authorization':
            'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'customer': coustmer,
      },
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? subscriptionusage(dynamic response) => getJsonField(
        response,
        r'''$.data''',
        true,
      ) as List?;
}

class SubscriptionCall {
  Future<ApiCallResponse> call({
    String? customer = '',
  }) async {
    final baseUrl = StripeGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'subscription',
      apiUrl: '${baseUrl}/billing_portal/sessions',
      callType: ApiCallType.POST,
      headers: {
        'Authorization':
            'Bearer sk_test_51RoW9MBEKJak3ro0jA0jH8974xcak1a1EpdzTR5pOGL5qgGMI4V3UgEjTfyJgG95wHzknUwTuntcI4Zbco99kn5S00Wux331Ro',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'customer': customer,
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  String? url(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.url''',
      ));
}

/// End Stripe Group Code

/// Start Vonage Group Code

class VonageGroup {
  static String getBaseUrl() => 'https://rest.nexmo.com/';
  static Map<String, String> headers = {
    'Authorization': 'Basic YOUR_VOUNAGE_API_KEY',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  static BuyNumberVonageCall buyNumberVonageCall = BuyNumberVonageCall();
  static SearchNumverCall searchNumverCall = SearchNumverCall();
}

class BuyNumberVonageCall {
  Future<ApiCallResponse> call({
    String? msisdn = '',
  }) async {
    final baseUrl = VonageGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'BuyNumberVonage',
      apiUrl: '${baseUrl}/number/buy',
      callType: ApiCallType.POST,
      headers: {
        'Authorization': 'Basic YOUR_VOUNAGE_API_KEY',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'country': "US",
        'msisdn': msisdn,
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class SearchNumverCall {
  Future<ApiCallResponse> call({
    String? pattern = '',
  }) async {
    final baseUrl = VonageGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'SearchNumver',
      apiUrl: '${baseUrl}/number/search',
      callType: ApiCallType.GET,
      headers: {
        'Authorization': 'Basic YOUR_VOUNAGE_API_KEY',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        'country': "US",
        'type': "mobile-lvn",
        'pattern': pattern,
        'search_pattern': "1",
        'features': "SMS,VOICE",
      },
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? phorneNumbersList(dynamic response) => getJsonField(
        response,
        r'''$.numbers''',
        true,
      ) as List?;
  int? numbers(dynamic response) => castToType<int>(getJsonField(
        response,
        r'''$.count''',
      ));
}

/// End Vonage Group Code

/// Start Twillio Group Code

class TwillioGroup {
  static String getBaseUrl() =>
      'https://api.twilio.com/2010-04-01/Accounts/ACcf36ee2a4549fb9077606737abb6242a';
  static Map<String, String> headers = {
    'Authorization':
        'Basic QUNjZjM2ZWUyYTQ1NDlmYjkwNzc2MDY3MzdhYmI2MjQyYTphMWIxMzg4ZDE2OThmZGQ4NjZlMTBkZDIyMTI0ODQ0Yw====',
  };
  static SearchNumberCall searchNumberCall = SearchNumberCall();
  static BuyPhoneNumberCall buyPhoneNumberCall = BuyPhoneNumberCall();
  static UpdatePhoneNumberTwilioCall updatePhoneNumberTwilioCall =
      UpdatePhoneNumberTwilioCall();
  static SendSmsCall sendSmsCall = SendSmsCall();
}

class SearchNumberCall {
  Future<ApiCallResponse> call({
    String? areaCode = '',
  }) async {
    final baseUrl = TwillioGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'Search Number',
      apiUrl: '${baseUrl}/AvailablePhoneNumbers/US/Local.json',
      callType: ApiCallType.GET,
      headers: {
        'Authorization':
            'Basic QUNjZjM2ZWUyYTQ1NDlmYjkwNzc2MDY3MzdhYmI2MjQyYTphMWIxMzg4ZDE2OThmZGQ4NjZlMTBkZDIyMTI0ODQ0Yw====',
      },
      params: {
        'AreaCode': areaCode,
        'Limit': "5",
      },
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  List? phoneNumbers(dynamic response) => getJsonField(
        response,
        r'''$.available_phone_numbers''',
        true,
      ) as List?;
}

class BuyPhoneNumberCall {
  Future<ApiCallResponse> call({
    String? phonenNumber = '',
    String? friendlyName = '',
  }) async {
    final baseUrl = TwillioGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'Buy Phone Number',
      apiUrl: '${baseUrl}/IncomingPhoneNumbers.json',
      callType: ApiCallType.POST,
      headers: {
        'Authorization':
            'Basic QUNjZjM2ZWUyYTQ1NDlmYjkwNzc2MDY3MzdhYmI2MjQyYTphMWIxMzg4ZDE2OThmZGQ4NjZlMTBkZDIyMTI0ODQ0Yw====',
      },
      params: {
        'PhoneNumber': phonenNumber,
        'friendly_name': friendlyName,
        'SmsUrl': "https://heliowicttor.app.n8n.cloud/webhook/receive-message ",
        'SmsMethod': "POST",
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class UpdatePhoneNumberTwilioCall {
  Future<ApiCallResponse> call({
    String? smsUrl = '',
    String? psid = '',
  }) async {
    final baseUrl = TwillioGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'Update Phone Number Twilio',
      apiUrl: '${baseUrl}/IncomingPhoneNumbers/${psid}',
      callType: ApiCallType.POST,
      headers: {
        'Authorization':
            'Basic QUNjZjM2ZWUyYTQ1NDlmYjkwNzc2MDY3MzdhYmI2MjQyYTphMWIxMzg4ZDE2OThmZGQ4NjZlMTBkZDIyMTI0ODQ0Yw====',
      },
      params: {
        'SmsUrl': smsUrl,
        'SmsMethod': "GET",
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class SendSmsCall {
  Future<ApiCallResponse> call({
    String? from = '',
    String? body = '',
    String? to = '',
  }) async {
    final baseUrl = TwillioGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'Send Sms',
      apiUrl: '${baseUrl}/Messages.json',
      callType: ApiCallType.POST,
      headers: {
        'Authorization':
            'Basic QUNjZjM2ZWUyYTQ1NDlmYjkwNzc2MDY3MzdhYmI2MjQyYTphMWIxMzg4ZDE2OThmZGQ4NjZlMTBkZDIyMTI0ODQ0Yw====',
      },
      params: {
        'From': from,
        'Body': body,
        'To': to,
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

/// End Twillio Group Code

class SendASMSCall {
  static Future<ApiCallResponse> call({
    String? smsMessage = 'A text message sent using the Vonage SMS API',
    String? phoneNumber = '447360518292',
    String? from = '',
  }) async {
    return ApiManager.instance.makeApiCall(
      callName: 'Send a SMS',
      apiUrl:
          'https://api.twilio.com/2010-04-01/Accounts/AC20eb5f8037bf44d207847c1e52ba504f/Messages.json',
      callType: ApiCallType.POST,
      headers: {
        'Authorization':
            'Basic QUMyMGViNWY4MDM3YmY0NGQyMDc4NDdjMWU1MmJhNTA0ZjpiMzlhNDYyMmQ2MTE5MWE4Njg5MWFlM2EyOTdjZTA1MA==',
      },
      params: {
        'From': from,
        'Body': smsMessage,
        'To': phoneNumber,
      },
      bodyType: BodyType.X_WWW_FORM_URL_ENCODED,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }

  static List? messages(dynamic response) => getJsonField(
        response,
        r'''$.messages''',
        true,
      ) as List?;
}

class ApiPagingParams {
  int nextPageNumber = 0;
  int numItems = 0;
  dynamic lastResponse;

  ApiPagingParams({
    required this.nextPageNumber,
    required this.numItems,
    required this.lastResponse,
  });

  @override
  String toString() =>
      'PagingParams(nextPageNumber: $nextPageNumber, numItems: $numItems, lastResponse: $lastResponse,)';
}

String _toEncodable(dynamic item) {
  if (item is DocumentReference) {
    return item.path;
  }
  return item;
}

String _serializeList(List? list) {
  list ??= <String>[];
  try {
    return json.encode(list, toEncodable: _toEncodable);
  } catch (_) {
    if (kDebugMode) {
      print("List serialization failed. Returning empty list.");
    }
    return '[]';
  }
}

String _serializeJson(dynamic jsonVar, [bool isList = false]) {
  jsonVar ??= (isList ? [] : {});
  try {
    return json.encode(jsonVar, toEncodable: _toEncodable);
  } catch (_) {
    if (kDebugMode) {
      print("Json serialization failed. Returning empty json.");
    }
    return isList ? '[]' : '{}';
  }
}

String? escapeStringForJson(String? input) {
  if (input == null) {
    return null;
  }
  return input
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('\n', '\\n')
      .replaceAll('\t', '\\t');
}
