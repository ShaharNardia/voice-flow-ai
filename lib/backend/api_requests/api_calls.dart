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
        'SmsUrl': "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net/twilioVoiceWebhook",
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

/// Start VoiceService Group Code (Firebase Cloud Functions + Twilio)

class VoiceServiceGroup {
  static String getBaseUrl() =>
      'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';
  static Map<String, String> headers = {
    'Content-Type': 'application/json',
  };
  static VoiceServicePlaceCallCall placeCallCall = VoiceServicePlaceCallCall();
  static VoiceServiceSearchNumbersCall searchNumbersCall =
      VoiceServiceSearchNumbersCall();
  static VoiceServicePurchaseNumberCall purchaseNumberCall =
      VoiceServicePurchaseNumberCall();
  // Alias for phone number creation
  static VoiceServicePurchaseNumberCall createPhoneNumberCall =
      VoiceServicePurchaseNumberCall();
  static VoiceServiceConfigureNumberCall configureNumberCall =
      VoiceServiceConfigureNumberCall();
  static VoiceServiceReleaseNumberCall releaseNumberCall =
      VoiceServiceReleaseNumberCall();
  // Alias for phone number deletion
  static VoiceServiceReleaseNumberCall deletePhoneCall =
      VoiceServiceReleaseNumberCall();
  // Assistant management via Firebase Cloud Functions
  static VoiceServiceGetAllAssistantsCall getAllAssistantsCall =
      VoiceServiceGetAllAssistantsCall();
  static VoiceServiceCreateAssistantCall createAssistantCall =
      VoiceServiceCreateAssistantCall();
  static VoiceServiceUpdateAssistantCall updateAssistantCall =
      VoiceServiceUpdateAssistantCall();
  static VoiceServiceDeleteAssistantCall deleteAssistantCall =
      VoiceServiceDeleteAssistantCall();
  // Tool management (placeholders - tools are now managed via Firestore)
  static VoiceServiceGetToolCall getToolCall = VoiceServiceGetToolCall();
  static VoiceServiceUpdateToolCall updateToolCall = VoiceServiceUpdateToolCall();
}

class VoiceServicePlaceCallCall {
  Future<ApiCallResponse> call({
    String? name = '',
    String? number = '',
    String? companyPhone = '',
    String? companyId = '',
    String? assistantId = '',
    dynamic? assistantJson,
    Map<String, dynamic>? metadata,
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    final assistant = _serializeJson(assistantJson);
    final metadataStr = _serializeJson(metadata);
    final ffApiRequestBody = '''
{
  "name": "${escapeStringForJson(name)}",
  "number": "${escapeStringForJson(number)}",
  "companyPhone": "${escapeStringForJson(companyPhone)}",
  "companyId": "${escapeStringForJson(companyId)}",
  "assistantId": "${escapeStringForJson(assistantId)}",
  "assistantJson": ${assistant},
  "metadata": ${metadataStr}
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Place Call',
      apiUrl: '${baseUrl}/placeCall',
      callType: ApiCallType.POST,
      headers: {
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

  String? callSid(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.callSid''',
      ));
  String? callSessionId(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.callSessionId''',
      ));
  String? status(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.status''',
      ));
}

class VoiceServiceSearchNumbersCall {
  Future<ApiCallResponse> call({
    String? country = 'US',
    String? areaCode = '',
    String? contains = '',
    int? limit = 10,
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "country": "${escapeStringForJson(country)}",
  "areaCode": "${escapeStringForJson(areaCode)}",
  "contains": "${escapeStringForJson(contains)}",
  "limit": ${limit ?? 10}
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Search Numbers',
      apiUrl: '${baseUrl}/searchPhoneNumbers',
      callType: ApiCallType.POST,
      headers: {
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

  List? phoneNumbers(dynamic response) => getJsonField(
        response,
        r'''$''',
        true,
      ) as List?;
}

class VoiceServicePurchaseNumberCall {
  Future<ApiCallResponse> call({
    String? phoneNumber = '',
    String? friendlyName = '',
    String? companyId = '',
    String? number = '',
    String? name = '',
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "phoneNumber": "${escapeStringForJson(phoneNumber ?? number)}",
  "friendlyName": "${escapeStringForJson(friendlyName ?? name)}",
  "companyId": "${escapeStringForJson(companyId)}"
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Purchase Number',
      apiUrl: '${baseUrl}/purchasePhoneNumber',
      callType: ApiCallType.POST,
      headers: {
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

  String? sid(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.sid''',
      ));
  String? id(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.sid''',
      ));
  String? phoneNumber(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.phoneNumber''',
      ));
  String? number(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.phoneNumber''',
      ));
  String? message(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.message''',
      ));
}

class VoiceServiceConfigureNumberCall {
  Future<ApiCallResponse> call({
    String? phoneNumber = '',
    String? friendlyName = '',
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "number": "${escapeStringForJson(phoneNumber)}",
  "friendlyName": "${escapeStringForJson(friendlyName)}"
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Configure Number',
      apiUrl: '${baseUrl}/configurePhoneNumber',
      callType: ApiCallType.POST,
      headers: {
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
}

class VoiceServiceReleaseNumberCall {
  Future<ApiCallResponse> call({
    String? sid = '',
    String? id = '',
    String? phoneNumber = '',
    String? companyId = '',
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "sid": "${escapeStringForJson(sid ?? id)}",
  "phoneNumber": "${escapeStringForJson(phoneNumber)}",
  "companyId": "${escapeStringForJson(companyId)}"
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Release Number',
      apiUrl: '${baseUrl}/releasePhoneNumber',
      callType: ApiCallType.POST,
      headers: {
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
}

class VoiceServiceGetAllAssistantsCall {
  Future<ApiCallResponse> call() async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Get All Assistants',
      apiUrl: '${baseUrl}/assistantsList',
      callType: ApiCallType.GET,
      headers: {
        'Content-Type': 'application/json',
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

class VoiceServiceCreateAssistantCall {
  Future<ApiCallResponse> call({
    String? systemPrompt = '',
    String? firstMessage = '',
    String? assistantName = '',
    String? language = '',
    String? userId = '',
    List<String>? toolsList,
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();
    final tools = _serializeList(toolsList);

    final ffApiRequestBody = '''
{
  "systemPrompt": "${escapeStringForJson(systemPrompt)}",
  "firstMessage": "${escapeStringForJson(firstMessage)}",
  "name": "${escapeStringForJson(assistantName)}",
  "language": "${escapeStringForJson(language)}",
  "userId": "${escapeStringForJson(userId)}",
  "toolIds": ${tools}
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Create Assistant',
      apiUrl: '${baseUrl}/assistantsCreate',
      callType: ApiCallType.POST,
      headers: {
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
  String? name(dynamic response) => castToType<String>(getJsonField(
        response,
        r'''$.name''',
      ));
}

class VoiceServiceUpdateAssistantCall {
  Future<ApiCallResponse> call({
    String? id = '',
    String? firstMessage = '',
    String? assistantName = '',
    String? language = '',
    String? userId = '',
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "id": "${escapeStringForJson(id)}",
  "name": "${escapeStringForJson(assistantName)}",
  "firstMessage": "${escapeStringForJson(firstMessage)}",
  "language": "${escapeStringForJson(language)}"
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Update Assistant',
      apiUrl: '${baseUrl}/assistantsUpdate',
      callType: ApiCallType.POST,
      headers: {
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
}

class VoiceServiceDeleteAssistantCall {
  Future<ApiCallResponse> call({
    String? id = '',
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    final ffApiRequestBody = '''
{
  "id": "${escapeStringForJson(id)}"
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Delete Assistant',
      apiUrl: '${baseUrl}/assistantsDelete',
      callType: ApiCallType.POST,
      headers: {
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
}

class VoiceServiceGetToolCall {
  Future<ApiCallResponse> call({
    String? id = '',
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();

    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Get Tool',
      apiUrl: '${baseUrl}/toolsGet',
      callType: ApiCallType.POST,
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        'id': id,
      },
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

class VoiceServiceUpdateToolCall {
  Future<ApiCallResponse> call({
    dynamic? bodyJson,
    String? id = '',
  }) async {
    final baseUrl = VoiceServiceGroup.getBaseUrl();
    final body = _serializeJson(bodyJson);

    final ffApiRequestBody = '''
{
  "id": "${escapeStringForJson(id)}",
  "data": ${body}
}''';
    return ApiManager.instance.makeApiCall(
      callName: 'VoiceService Update Tool',
      apiUrl: '${baseUrl}/toolsUpdate',
      callType: ApiCallType.POST,
      headers: {
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
}

/// End VoiceService Group Code

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
