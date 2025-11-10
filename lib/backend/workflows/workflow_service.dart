import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '/app_constants.dart';

class WorkflowException implements Exception {
  const WorkflowException(this.code, this.message, [this.details]);

  final String code;
  final String message;
  final Object? details;

  @override
  String toString() => 'WorkflowException($code, $message)';
}

class WorkflowService {
  WorkflowService._();

  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'us-central1');

  /// Calls the `assignAssistant` HTTPS endpoint (HTTP trigger).
  static Future<AssignAssistantResult> assignAssistant({
    required String phoneNumber,
    bool isFromAssistant = false,
    String? callerId,
    String? callerName,
    String? email,
    Map<String, dynamic>? extra,
  }) async {
    try {
      final payload = <String, dynamic>{
        'phone_number': phoneNumber,
        'is_from_assistant': isFromAssistant,
        if (callerId != null) 'caller_id': callerId,
        if (callerName != null) 'caller_name': callerName,
        if (email != null) 'email': email,
        if (extra != null) ...extra,
      };

      final response = await http.post(
        Uri.parse(FFAppConstants.assignAssistantEndpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw WorkflowException(
          'assignAssistant',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }

      final data = _decodeJson(response.body);
      return AssignAssistantResult.fromJson(data);
    } catch (error, stack) {
      debugPrint('assignAssistant failed: $error\n$stack');
      if (error is WorkflowException) rethrow;
      throw WorkflowException('assignAssistant', error.toString());
    }
  }

  /// Calls the callable `createReservation` function.
  static Future<ReservationResult> createReservation({
    required String clientId,
    required String serviceDateIso,
    required String serviceType,
    String? leadId,
    Map<String, dynamic>? contactInfo,
    Map<String, dynamic>? extras,
  }) async {
    try {
      final callable = _functions.httpsCallable('createReservation');
      final result = await callable.call<Map<String, dynamic>>({
        'client_id': clientId,
        'service_date': serviceDateIso,
        'service_type': serviceType,
        if (leadId != null) 'lead_id': leadId,
        if (contactInfo != null) 'contact_info': contactInfo,
        if (extras != null) ...extras,
      });
      return ReservationResult.fromJson(result.data);
    } on FirebaseFunctionsException catch (error) {
      throw WorkflowException(error.code, error.message ?? 'Reservation failed', error.details);
    } catch (error) {
      throw WorkflowException('createReservation', error.toString());
    }
  }

  /// Posts call completion details to the dedicated function.
  static Future<GenericWorkflowResult> logEndOfCall(Map<String, dynamic> payload) async {
    try {
      final response = await http.post(
        Uri.parse(FFAppConstants.endOfCallLogEndpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw WorkflowException(
          'endOfCallLog',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return GenericWorkflowResult.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('endOfCallLog', error.toString());
    }
  }

  static Future<LeadDetailsResult> getLeadDetails({
    String? leadId,
    String? companyId,
    String callType = 'outbound',
    int? limit,
  }) async {
    try {
      final callable = _functions.httpsCallable('getLeadDetails');
      final result = await callable.call<Map<String, dynamic>>({
        if (leadId != null) 'lead_id': leadId,
        if (companyId != null) 'company_id': companyId,
        'call_type': callType,
        if (limit != null) 'limit': limit,
      });
      return LeadDetailsResult.fromJson(result.data);
    } on FirebaseFunctionsException catch (error) {
      throw WorkflowException(error.code, error.message ?? 'Lead lookup failed', error.details);
    } catch (error) {
      throw WorkflowException('getLeadDetails', error.toString());
    }
  }

  static Future<PhoneLookupResult> getPhoneNumberFromJob({
    required String jobId,
  }) async {
    try {
      final callable = _functions.httpsCallable('getPhoneNumberFromJob');
      final result = await callable.call<Map<String, dynamic>>({
        'job_id': jobId,
      });
      return PhoneLookupResult.fromJson(result.data);
    } on FirebaseFunctionsException catch (error) {
      throw WorkflowException(error.code, error.message ?? 'Phone lookup failed', error.details);
    } catch (error) {
      throw WorkflowException('getPhoneNumberFromJob', error.toString());
    }
  }

  static Future<OutboundLeadResult> createOutboundLeadTest({
    required String companyId,
    required String leadName,
    required String leadPhone,
    String? leadEmail,
    String? messageContent,
    String? source,
  }) async {
    try {
      final callable = _functions.httpsCallable('outboundLeadTest');
      final result = await callable.call<Map<String, dynamic>>({
        'company_id': companyId,
        'lead_name': leadName,
        'lead_phone': leadPhone,
        if (leadEmail != null) 'lead_email': leadEmail,
        if (messageContent != null) 'message_content': messageContent,
        if (source != null) 'source': source,
      });
      return OutboundLeadResult.fromJson(result.data);
    } on FirebaseFunctionsException catch (error) {
      throw WorkflowException(error.code, error.message ?? 'Outbound lead failed', error.details);
    } catch (error) {
      throw WorkflowException('outboundLeadTest', error.toString());
    }
  }

  static Future<GenericWorkflowResult> transferCall(Map<String, dynamic> payload) async {
    try {
      final response = await http.post(
        Uri.parse(FFAppConstants.transferCallEndpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw WorkflowException(
          'transferCall',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return GenericWorkflowResult.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('transferCall', error.toString());
    }
  }

  static Future<AssistantSummary> createAssistant({
    required String name,
    required String systemPrompt,
    required String firstMessage,
    required String language,
    String? ownerId,
    List<String>? toolIds,
  }) async {
    try {
      final response = await http.post(
        _buildUri('assistantsCreate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': name,
          'firstMessage': firstMessage,
          'language': language,
          'metadata': {
            if (ownerId != null) 'userId': ownerId,
          },
          'assistant': {
            'name': name,
            'firstMessage': firstMessage,
            'transcriber': {
              'language': language,
            },
            'model': {
              'messages': [
                {
                  'content': systemPrompt,
                  'role': 'system',
                }
              ],
              'toolIds': toolIds ?? <String>[],
            },
          },
        }),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'createAssistant',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return AssistantSummary.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('createAssistant', error.toString());
    }
  }

  static Future<AssistantSummary> updateAssistant({
    required String assistantId,
    required String name,
    required String firstMessage,
    required String language,
    String? systemPrompt,
    List<String>? toolIds,
    Map<String, dynamic>? definition,
  }) async {
    try {
      final response = await http.post(
        _buildUri('assistantsUpdate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'id': assistantId,
          'name': name,
          'firstMessage': firstMessage,
          'language': language,
          if (definition != null) 'assistant': definition,
          if (systemPrompt != null || toolIds != null)
            'model': {
              if (systemPrompt != null)
                'messages': [
                  {'content': systemPrompt, 'role': 'system'}
                ],
              if (toolIds != null) 'toolIds': toolIds,
            },
        }),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'updateAssistant',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return AssistantSummary.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('updateAssistant', error.toString());
    }
  }

  static Future<void> deleteAssistant(String assistantId) async {
    try {
      final response = await http.post(
        _buildUri('assistantsDelete'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'assistantId': assistantId}),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'deleteAssistant',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('deleteAssistant', error.toString());
    }
  }

  static Future<List<AssistantSummary>> listAssistants() async {
    try {
      final response = await http.get(
        _buildUri('assistantsList'),
        headers: {'Content-Type': 'application/json'},
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'listAssistants',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      final dynamic data =
          response.body.isEmpty ? const [] : jsonDecode(response.body);
      if (data is List) {
        return data
            .map((entry) => entry is Map<String, dynamic>
                ? AssistantSummary.fromJson(entry)
                : null)
            .whereType<AssistantSummary>()
            .toList(growable: false);
      }
      return const [];
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('listAssistants', error.toString());
    }
  }

  static Future<AssistantSummary?> getAssistant(String assistantId) async {
    try {
      final response = await http.get(
        _buildUri('assistantsGet', {'assistantId': assistantId}),
        headers: {'Content-Type': 'application/json'},
      );
      if (response.statusCode == 404) {
        return null;
      }
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'getAssistant',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return AssistantSummary.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('getAssistant', error.toString());
    }
  }

  static Future<List<AvailablePhoneNumber>> searchPhoneNumbers({
    String? areaCode,
    String country = 'US',
    int limit = 10,
    String? contains,
  }) async {
    try {
      final response = await http.post(
        _buildUri('searchPhoneNumbers'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'areaCode': areaCode,
          'country': country,
          'limit': limit,
          if (contains != null && contains.isNotEmpty) 'contains': contains,
        }),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'searchPhoneNumbers',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      if (response.body.isEmpty) {
        return const <AvailablePhoneNumber>[];
      }
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is List) {
        return decoded
            .whereType<Map<String, dynamic>>()
            .map(AvailablePhoneNumber.fromJson)
            .toList(growable: false);
      }
      return const <AvailablePhoneNumber>[];
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('searchPhoneNumbers', error.toString());
    }
  }

  static Future<PurchasePhoneNumberResult> purchasePhoneNumber({
    required String phoneNumber,
    String? friendlyName,
    String? companyId,
  }) async {
    try {
      final response = await http.post(
        _buildUri('purchasePhoneNumber'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phoneNumber': phoneNumber,
          if (friendlyName != null) 'friendlyName': friendlyName,
          if (companyId != null) 'companyId': companyId,
        }),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'purchasePhoneNumber',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return PurchasePhoneNumberResult.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('purchasePhoneNumber', error.toString());
    }
  }

  static Future<GenericWorkflowResult> releasePhoneNumber({
    required String sid,
    required String phoneNumber,
    String? companyId,
    String? friendlyName,
  }) async {
    try {
      final response = await http.post(
        _buildUri('releasePhoneNumber'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'sid': sid,
          'phoneNumber': phoneNumber,
          if (companyId != null) 'companyId': companyId,
          if (friendlyName != null) 'friendlyName': friendlyName,
        }),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'releasePhoneNumber',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return GenericWorkflowResult.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('releasePhoneNumber', error.toString());
    }
  }

  static Future<GenericWorkflowResult> configurePhoneNumber({
    required String number,
    String? friendlyName,
  }) async {
    try {
      final response = await http.post(
        _buildUri('configurePhoneNumber'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'number': number,
          if (friendlyName != null) 'friendlyName': friendlyName,
        }),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'configurePhoneNumber',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return GenericWorkflowResult.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('configurePhoneNumber', error.toString());
    }
  }

  static Future<CallInitiationResult> placeCall({
    required String leadName,
    required String leadPhone,
    required String companyPhone,
    required Map<String, dynamic> assistantJson,
    String? companyName,
    String? industry,
    String? assistantName,
  }) async {
    try {
      final response = await http.post(
        _buildUri('placeCall'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': leadName,
          'number': leadPhone,
          'companyPhone': companyPhone,
          'companyName': companyName,
          'industry': industry,
          'assistantName': assistantName,
          'requestedAt': DateTime.now().toIso8601String(),
          'assistantJson': assistantJson,
        }),
      );
      if (response.statusCode >= 400) {
        throw WorkflowException(
          'placeCall',
          'Failed with status ${response.statusCode}',
          response.body,
        );
      }
      return CallInitiationResult.fromJson(_decodeJson(response.body));
    } catch (error) {
      if (error is WorkflowException) rethrow;
      throw WorkflowException('placeCall', error.toString());
    }
  }

  static Uri _buildUri(String path, [Map<String, String>? query]) {
    final base = Uri.parse('${FFAppConstants.cloudFunctionsBaseUrl}/$path');
    if (query == null) {
      return base;
    }
    return base.replace(queryParameters: query);
  }

  static Map<String, dynamic> _decodeJson(String body) {
    if (body.isEmpty) return const {};
    final dynamic decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    return const {};
  }
}

@immutable
class AssignAssistantResult {
  const AssignAssistantResult({
    required this.status,
    this.companyId,
    this.assistant,
    this.leadId,
    this.jobId,
    this.callSessionId,
    this.metadata,
  });

  factory AssignAssistantResult.fromJson(Map<String, dynamic> json) {
    return AssignAssistantResult(
      status: json['status'] as String? ?? 'success',
      companyId: json['companyId'] as String?,
      assistant: json['assistant'] as Map<String, dynamic>?,
      leadId: json['leadId'] as String?,
      jobId: json['jobId'] as String?,
      callSessionId: json['callSessionId'] as String?,
      metadata: json,
    );
  }

  final String status;
  final String? companyId;
  final Map<String, dynamic>? assistant;
  final String? leadId;
  final String? jobId;
  final String? callSessionId;
  final Map<String, dynamic>? metadata;
}

@immutable
class ReservationResult {
  const ReservationResult({
    required this.status,
    this.jobId,
    this.leadId,
    this.clientId,
    this.raw,
  });

  factory ReservationResult.fromJson(Map<String, dynamic> json) {
    return ReservationResult(
      status: json['status'] as String? ?? 'error',
      jobId: json['jobId'] as String?,
      leadId: json['leadId'] as String?,
      clientId: json['clientId'] as String?,
      raw: json,
    );
  }

  final String status;
  final String? jobId;
  final String? leadId;
  final String? clientId;
  final Map<String, dynamic>? raw;
}

@immutable
class GenericWorkflowResult {
  const GenericWorkflowResult({
    required this.status,
    this.data,
  });

  factory GenericWorkflowResult.fromJson(Map<String, dynamic> json) {
    return GenericWorkflowResult(
      status: json['status'] as String? ?? 'error',
      data: json,
    );
  }

  final String status;
  final Map<String, dynamic>? data;
}

@immutable
class AvailablePhoneNumber {
  const AvailablePhoneNumber({
    required this.phoneNumber,
    this.friendlyName,
    this.locality,
    this.region,
    this.postalCode,
    this.isoCountry,
  });

  factory AvailablePhoneNumber.fromJson(Map<String, dynamic> json) {
    return AvailablePhoneNumber(
      phoneNumber: json['phoneNumber'] as String? ?? '',
      friendlyName: json['friendlyName'] as String?,
      locality: json['locality'] as String?,
      region: json['region'] as String?,
      postalCode: json['postalCode'] as String?,
      isoCountry: json['isoCountry'] as String?,
    );
  }

  final String phoneNumber;
  final String? friendlyName;
  final String? locality;
  final String? region;
  final String? postalCode;
  final String? isoCountry;
}

@immutable
class PurchasePhoneNumberResult {
  const PurchasePhoneNumberResult({
    required this.status,
    required this.sid,
    required this.phoneNumber,
    this.friendlyName,
  });

  factory PurchasePhoneNumberResult.fromJson(Map<String, dynamic> json) {
    return PurchasePhoneNumberResult(
      status: json['status'] as String? ?? 'error',
      sid: json['sid'] as String? ?? '',
      phoneNumber: json['phoneNumber'] as String? ?? '',
      friendlyName: json['friendlyName'] as String?,
    );
  }

  final String status;
  final String sid;
  final String phoneNumber;
  final String? friendlyName;
}

@immutable
class LeadDetailsResult {
  const LeadDetailsResult({
    required this.status,
    required this.results,
    this.callType,
  });

  factory LeadDetailsResult.fromJson(Map<String, dynamic> json) {
    final results = json['results'];
    return LeadDetailsResult(
      status: json['status'] as String? ?? 'success',
      callType: json['callType'] as String?,
      results: results is List
          ? results
              .map((entry) =>
                  entry is Map<String, dynamic> ? entry : <String, dynamic>{})
              .toList(growable: false)
          : const [],
    );
  }

  final String status;
  final String? callType;
  final List<Map<String, dynamic>> results;
}

@immutable
class PhoneLookupResult {
  const PhoneLookupResult({
    required this.status,
    this.phoneNumber,
    this.leadId,
    this.jobId,
  });

  factory PhoneLookupResult.fromJson(Map<String, dynamic> json) {
    return PhoneLookupResult(
      status: json['status'] as String? ?? 'not_found',
      phoneNumber: json['phoneNumber'] as String?,
      leadId: json['leadId'] as String?,
      jobId: json['jobId'] as String?,
    );
  }

  final String status;
  final String? phoneNumber;
  final String? leadId;
  final String? jobId;
}

@immutable
class OutboundLeadResult {
  const OutboundLeadResult({
    required this.status,
    this.leadId,
    this.callSessionId,
    this.companyId,
    this.raw,
  });

  factory OutboundLeadResult.fromJson(Map<String, dynamic> json) {
    return OutboundLeadResult(
      status: json['status'] as String? ?? 'success',
      leadId: json['leadId'] as String?,
      callSessionId: json['callSessionId'] as String?,
      companyId: json['companyId'] as String?,
      raw: json,
    );
  }

  final String status;
  final String? leadId;
  final String? callSessionId;
  final String? companyId;
  final Map<String, dynamic>? raw;
}

@immutable
class AssistantSummary {
  const AssistantSummary({
    required this.id,
    required this.name,
    required this.firstMessage,
    required this.language,
    this.definition,
    this.ownerId,
    this.companyId,
  });

  factory AssistantSummary.fromJson(Map<String, dynamic> json) {
    return AssistantSummary(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      firstMessage: json['firstMessage'] as String? ?? '',
      language: json['language'] as String? ?? '',
      definition: json['assistant'] is Map<String, dynamic>
          ? Map<String, dynamic>.from(json['assistant'])
          : null,
      ownerId: json['metadata'] is Map<String, dynamic>
          ? json['metadata']['ownerId'] as String?
          : json['ownerId'] as String?,
      companyId: json['metadata'] is Map<String, dynamic>
          ? json['metadata']['companyId'] as String?
          : json['companyId'] as String?,
    );
  }

  final String id;
  final String name;
  final String firstMessage;
  final String language;
  final Map<String, dynamic>? definition;
  final String? ownerId;
  final String? companyId;
}

@immutable
class CallInitiationResult {
  const CallInitiationResult({
    required this.status,
    this.callSid,
    this.callSessionId,
    this.raw,
  });

  factory CallInitiationResult.fromJson(Map<String, dynamic> json) {
    return CallInitiationResult(
      status: json['status'] as String? ?? 'initiated',
      callSid: json['callSid'] as String?,
      callSessionId: json['callSessionId'] as String?,
      raw: json,
    );
  }

  final String status;
  final String? callSid;
  final String? callSessionId;
  final Map<String, dynamic>? raw;
}

