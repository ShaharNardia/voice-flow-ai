# קוד החלפה לאינטגרציות - VoiceFlow AI

## ניתוח אינטגרציות נוכחיות

### 1. Vapi AI - אינטגרציה ראשית
**פונקציונליות שהפרויקט משתמש בה**:
- `CreateAssitantCall` - יצירת עוזר AI עם GPT-4o
- `CreatePhoneNumberCall` - יצירת מספר טלפון דרך Twilio
- `PlaceCallCall` - ביצוע שיחה עם עוזר AI
- `GetAllAssistantsCall` - קבלת רשימת עוזרים
- `UpdateAssistantCall` - עדכון עוזר
- `DeleteAssistantCall` - מחיקת עוזר
- `ListPhoneCallsCall` - רשימת שיחות
- `GetPhoneCallDetailsCall` - פרטי שיחה
- `CreateToolCall` - יצירת כלים לשיחה
- `UpdateToolCall` - עדכון כלים

**קוד החלפה**:
```dart
// Custom AI Service - החלפה ל-Vapi AI
class CustomAIService {
  static const String openaiApiKey = 'YOUR_OPENAI_API_KEY';
  static const String openaiBaseUrl = 'https://api.openai.com/v1';
  
  // יצירת עוזר AI
  static Future<String> createAssistant({
    required String name,
    required String systemPrompt,
    required String firstMessage,
    required String language,
    required String userId,
    List<String>? toolsList,
  }) async {
    try {
      // יצירת עוזר ב-OpenAI
      final assistantResponse = await http.post(
        Uri.parse('$openaiBaseUrl/assistants'),
        headers: {
          'Authorization': 'Bearer $openaiApiKey',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'name': name,
          'instructions': systemPrompt,
          'model': 'gpt-4o',
          'tools': toolsList?.map((tool) => {'type': 'function', 'function': tool}).toList() ?? [],
        }),
      );
      
      final assistantData = jsonDecode(assistantResponse.body);
      final assistantId = assistantData['id'];
      
      // שמירה ב-Firestore
      await FirebaseFirestore.instance
          .collection('assistants')
          .doc(assistantId)
          .set({
        'name': name,
        'systemPrompt': systemPrompt,
        'firstMessage': firstMessage,
        'language': language,
        'userId': userId,
        'openaiId': assistantId,
        'createdAt': FieldValue.serverTimestamp(),
        'tools': toolsList ?? [],
      });
      
      return assistantId;
    } catch (e) {
      throw Exception('Failed to create assistant: $e');
    }
  }
  
  // ביצוע שיחה
  static Future<String> placeCall({
    required String assistantId,
    required String customerName,
    required String customerPhone,
    required String companyPhone,
    String? industry,
    String? company,
  }) async {
    try {
      // קבלת פרטי העוזר
      final assistantDoc = await FirebaseFirestore.instance
          .collection('assistants')
          .doc(assistantId)
          .get();
      
      if (!assistantDoc.exists) {
        throw Exception('Assistant not found');
      }
      
      final assistantData = assistantDoc.data()!;
      
      // יצירת thread ב-OpenAI
      final threadResponse = await http.post(
        Uri.parse('$openaiBaseUrl/threads'),
        headers: {
          'Authorization': 'Bearer $openaiApiKey',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'messages': [
            {
              'role': 'user',
              'content': assistantData['firstMessage'],
            }
          ],
        }),
      );
      
      final threadData = jsonDecode(threadResponse.body);
      final threadId = threadData['id'];
      
      // שמירת שיחה ב-Firestore
      final callId = await FirebaseFirestore.instance
          .collection('calls')
          .add({
        'assistantId': assistantId,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'companyPhone': companyPhone,
        'threadId': threadId,
        'status': 'initiated',
        'createdAt': FieldValue.serverTimestamp(),
        'industry': industry,
        'company': company,
      });
      
      // ביצוע שיחה דרך Twilio
      await _initiateTwilioCall(
        callId: callId.id,
        customerPhone: customerPhone,
        companyPhone: companyPhone,
        assistantData: assistantData,
      );
      
      return callId.id;
    } catch (e) {
      throw Exception('Failed to place call: $e');
    }
  }
  
  // ביצוע שיחה דרך Twilio
  static Future<void> _initiateTwilioCall({
    required String callId,
    required String customerPhone,
    required String companyPhone,
    required Map<String, dynamic> assistantData,
  }) async {
    final twiml = '''
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say voice="alice">Hello, this is ${assistantData['name']}. ${assistantData['firstMessage']}</Say>
      <Gather input="speech" action="https://your-domain.com/webhook/speech" method="POST" speechTimeout="auto">
        <Say>Please speak your response.</Say>
      </Gather>
      <Say>Thank you for your time. Goodbye.</Say>
    </Response>
    ''';
    
    await http.post(
      Uri.parse('https://api.twilio.com/2010-04-01/Accounts/ACcf36ee2a4549fb9077606737abb6242a/Calls.json'),
      headers: {
        'Authorization': 'Basic QUNjZjM2ZWUyYTQ1NDlmYjkwNzc2MDY3MzdhYmI2MjQyYTphMWIxMzg4ZDE2OThmZGQ4NjZlMTBkZDIyMTI0ODQ0Yw====',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        'From': companyPhone,
        'To': customerPhone,
        'Twiml': twiml,
      },
    );
  }
  
  // קבלת רשימת עוזרים
  static Future<List<Map<String, dynamic>>> getAllAssistants() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('assistants')
        .get();
    
    return snapshot.docs.map((doc) => {
      'id': doc.id,
      ...doc.data(),
    }).toList();
  }
  
  // עדכון עוזר
  static Future<void> updateAssistant({
    required String assistantId,
    String? name,
    String? systemPrompt,
    String? firstMessage,
    String? language,
  }) async {
    final updateData = <String, dynamic>{};
    
    if (name != null) updateData['name'] = name;
    if (systemPrompt != null) updateData['systemPrompt'] = systemPrompt;
    if (firstMessage != null) updateData['firstMessage'] = firstMessage;
    if (language != null) updateData['language'] = language;
    
    updateData['updatedAt'] = FieldValue.serverTimestamp();
    
    await FirebaseFirestore.instance
        .collection('assistants')
        .doc(assistantId)
        .update(updateData);
  }
  
  // מחיקת עוזר
  static Future<void> deleteAssistant(String assistantId) async {
    await FirebaseFirestore.instance
        .collection('assistants')
        .doc(assistantId)
        .delete();
  }
  
  // קבלת פרטי שיחה
  static Future<Map<String, dynamic>?> getCallDetails(String callId) async {
    final doc = await FirebaseFirestore.instance
        .collection('calls')
        .doc(callId)
        .get();
    
    if (!doc.exists) return null;
    
    return {'id': doc.id, ...doc.data()!};
  }
  
  // רשימת שיחות
  static Future<List<Map<String, dynamic>>> getCallsList() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('calls')
        .orderBy('createdAt', descending: true)
        .get();
    
    return snapshot.docs.map((doc) => {
      'id': doc.id,
      ...doc.data(),
    }).toList();
  }
}
```

### 2. Stripe - ניהול תשלומים
**פונקציונליות שהפרויקט משתמש בה**:
- `CreateCustomerCall` - יצירת לקוח
- `CreateSessionCall` - יצירת session לתשלום
- `ManageSubscriptionCall` - ניהול מנוי
- `GetInvoicesCall` - קבלת חשבוניות
- `GetPaymentMethodsCall` - ניהול אמצעי תשלום
- `GetSubscriptionUsageDetailsCall` - פרטי שימוש במנוי

**קוד החלפה**:
```dart
// Custom Billing Service - החלפה ל-Stripe
class CustomBillingService {
  static const String paypalClientId = 'YOUR_PAYPAL_CLIENT_ID';
  static const String paypalClientSecret = 'YOUR_PAYPAL_CLIENT_SECRET';
  static const String paypalBaseUrl = 'https://api.paypal.com/v1';
  
  // יצירת לקוח
  static Future<String> createCustomer({
    required String email,
    String? name,
  }) async {
    try {
      // יצירת לקוח ב-PayPal
      final response = await http.post(
        Uri.parse('$paypalBaseUrl/customers'),
        headers: {
          'Authorization': 'Bearer ${await _getPayPalToken()}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'email': email,
          'name': name,
        }),
      );
      
      final customerData = jsonDecode(response.body);
      final customerId = customerData['id'];
      
      // שמירה ב-Firestore
      await FirebaseFirestore.instance
          .collection('customers')
          .doc(customerId)
          .set({
        'email': email,
        'name': name,
        'paypalId': customerId,
        'createdAt': FieldValue.serverTimestamp(),
      });
      
      return customerId;
    } catch (e) {
      throw Exception('Failed to create customer: $e');
    }
  }
  
  // יצירת session לתשלום
  static Future<String> createSession({
    required String customerId,
    required String priceId,
    required String successUrl,
    required String cancelUrl,
  }) async {
    try {
      // יצירת subscription ב-PayPal
      final response = await http.post(
        Uri.parse('$paypalBaseUrl/billing/subscriptions'),
        headers: {
          'Authorization': 'Bearer ${await _getPayPalToken()}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'plan_id': priceId,
          'subscriber': {
            'payer_id': customerId,
          },
          'application_context': {
            'return_url': successUrl,
            'cancel_url': cancelUrl,
          },
        }),
      );
      
      final sessionData = jsonDecode(response.body);
      final sessionId = sessionData['id'];
      
      // שמירה ב-Firestore
      await FirebaseFirestore.instance
          .collection('sessions')
          .doc(sessionId)
          .set({
        'customerId': customerId,
        'priceId': priceId,
        'status': 'pending',
        'createdAt': FieldValue.serverTimestamp(),
      });
      
      return sessionData['links'][0]['href']; // Approval URL
    } catch (e) {
      throw Exception('Failed to create session: $e');
    }
  }
  
  // ניהול מנוי
  static Future<String> manageSubscription(String customerId) async {
    // החזרת URL לניהול מנוי
    return 'https://your-domain.com/billing/manage?customer=$customerId';
  }
  
  // קבלת חשבוניות
  static Future<List<Map<String, dynamic>>> getInvoices(String customerId) async {
    final snapshot = await FirebaseFirestore.instance
        .collection('invoices')
        .where('customerId', isEqualTo: customerId)
        .orderBy('createdAt', descending: true)
        .get();
    
    return snapshot.docs.map((doc) => {
      'id': doc.id,
      ...doc.data(),
    }).toList();
  }
  
  // קבלת אמצעי תשלום
  static Future<List<Map<String, dynamic>>> getPaymentMethods(String customerId) async {
    final snapshot = await FirebaseFirestore.instance
        .collection('payment_methods')
        .where('customerId', isEqualTo: customerId)
        .get();
    
    return snapshot.docs.map((doc) => {
      'id': doc.id,
      ...doc.data(),
    }).toList();
  }
  
  // קבלת פרטי שימוש במנוי
  static Future<Map<String, dynamic>?> getSubscriptionUsage(String customerId) async {
    final doc = await FirebaseFirestore.instance
        .collection('subscriptions')
        .where('customerId', isEqualTo: customerId)
        .limit(1)
        .get();
    
    if (doc.docs.isEmpty) return null;
    
    return {'id': doc.docs.first.id, ...doc.docs.first.data()};
  }
  
  // קבלת PayPal token
  static Future<String> _getPayPalToken() async {
    final response = await http.post(
      Uri.parse('$paypalBaseUrl/oauth2/token'),
      headers: {
        'Authorization': 'Basic ${base64Encode(utf8.encode('$paypalClientId:$paypalClientSecret'))}',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    );
    
    final tokenData = jsonDecode(response.body);
    return tokenData['access_token'];
  }
}
```

### 3. Twilio - שירותי טלפוניה
**פונקציונליות שהפרויקט משתמש בה**:
- `SearchNumberCall` - חיפוש מספרי טלפון
- `BuyPhoneNumberCall` - רכישת מספר טלפון
- `UpdatePhoneNumberTwilioCall` - עדכון הגדרות מספר
- `SendSmsCall` - שליחת SMS

**קוד החלפה**:
```dart
// Custom Phone Service - החלפה ל-Twilio
class CustomPhoneService {
  static const String twilioAccountSid = 'ACcf36ee2a4549fb9077606737abb6242a';
  static const String twilioAuthToken = 'a1b1388d1698fdd866e10dd22124844c';
  static const String twilioBaseUrl = 'https://api.twilio.com/2010-04-01/Accounts/$twilioAccountSid';
  
  // חיפוש מספרי טלפון
  static Future<List<Map<String, dynamic>>> searchNumbers({
    required String areaCode,
    int limit = 5,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$twilioBaseUrl/AvailablePhoneNumbers/US/Local.json').replace(
          queryParameters: {
            'AreaCode': areaCode,
            'Limit': limit.toString(),
          },
        ),
        headers: {
          'Authorization': 'Basic ${base64Encode(utf8.encode('$twilioAccountSid:$twilioAuthToken'))}',
        },
      );
      
      final data = jsonDecode(response.body);
      return List<Map<String, dynamic>>.from(data['available_phone_numbers']);
    } catch (e) {
      throw Exception('Failed to search numbers: $e');
    }
  }
  
  // רכישת מספר טלפון
  static Future<String> buyPhoneNumber({
    required String phoneNumber,
    String? friendlyName,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$twilioBaseUrl/IncomingPhoneNumbers.json'),
        headers: {
          'Authorization': 'Basic ${base64Encode(utf8.encode('$twilioAccountSid:$twilioAuthToken'))}',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: {
          'PhoneNumber': phoneNumber,
          'FriendlyName': friendlyName ?? phoneNumber,
          'SmsUrl': 'https://your-domain.com/webhook/sms',
          'SmsMethod': 'POST',
          'VoiceUrl': 'https://your-domain.com/webhook/voice',
          'VoiceMethod': 'POST',
        },
      );
      
      final data = jsonDecode(response.body);
      final phoneSid = data['sid'];
      
      // שמירה ב-Firestore
      await FirebaseFirestore.instance
          .collection('phone_numbers')
          .doc(phoneSid)
          .set({
        'phoneNumber': phoneNumber,
        'friendlyName': friendlyName ?? phoneNumber,
        'sid': phoneSid,
        'createdAt': FieldValue.serverTimestamp(),
        'status': 'active',
      });
      
      return phoneSid;
    } catch (e) {
      throw Exception('Failed to buy phone number: $e');
    }
  }
  
  // עדכון הגדרות מספר
  static Future<void> updatePhoneNumber({
    required String phoneSid,
    String? smsUrl,
    String? voiceUrl,
  }) async {
    try {
      final updateData = <String, String>{};
      if (smsUrl != null) updateData['SmsUrl'] = smsUrl;
      if (voiceUrl != null) updateData['VoiceUrl'] = voiceUrl;
      
      await http.post(
        Uri.parse('$twilioBaseUrl/IncomingPhoneNumbers/$phoneSid.json'),
        headers: {
          'Authorization': 'Basic ${base64Encode(utf8.encode('$twilioAccountSid:$twilioAuthToken'))}',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: updateData,
      );
      
      // עדכון ב-Firestore
      await FirebaseFirestore.instance
          .collection('phone_numbers')
          .doc(phoneSid)
          .update({
        'smsUrl': smsUrl,
        'voiceUrl': voiceUrl,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw Exception('Failed to update phone number: $e');
    }
  }
  
  // שליחת SMS
  static Future<String> sendSms({
    required String from,
    required String to,
    required String body,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$twilioBaseUrl/Messages.json'),
        headers: {
          'Authorization': 'Basic ${base64Encode(utf8.encode('$twilioAccountSid:$twilioAuthToken'))}',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: {
          'From': from,
          'To': to,
          'Body': body,
        },
      );
      
      final data = jsonDecode(response.body);
      final messageSid = data['sid'];
      
      // שמירת SMS ב-Firestore
      await FirebaseFirestore.instance
          .collection('sms_messages')
          .doc(messageSid)
          .set({
        'from': from,
        'to': to,
        'body': body,
        'sid': messageSid,
        'status': data['status'],
        'createdAt': FieldValue.serverTimestamp(),
      });
      
      return messageSid;
    } catch (e) {
      throw Exception('Failed to send SMS: $e');
    }
  }
  
  // קבלת רשימת מספרים
  static Future<List<Map<String, dynamic>>> getPhoneNumbers() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('phone_numbers')
        .get();
    
    return snapshot.docs.map((doc) => {
      'id': doc.id,
      ...doc.data(),
    }).toList();
  }
}
```

### 4. Vonage - שירותי טלפוניה חלופיים
**פונקציונליות שהפרויקט משתמש בה**:
- `BuyNumberVonageCall` - רכישת מספר דרך Vonage
- `SearchNumverCall` - חיפוש מספרים דרך Vonage

**קוד החלפה**:
```dart
// הסרה מלאה של Vonage - שימוש רק ב-Twilio
class UnifiedPhoneService {
  // איחוד כל שירותי הטלפוניה תחת Twilio
  static Future<List<Map<String, dynamic>>> searchAllNumbers({
    required String areaCode,
    int limit = 5,
  }) async {
    // שימוש רק ב-Twilio
    return await CustomPhoneService.searchNumbers(
      areaCode: areaCode,
      limit: limit,
    );
  }
  
  static Future<String> buyAnyNumber({
    required String phoneNumber,
    String? friendlyName,
  }) async {
    // שימוש רק ב-Twilio
    return await CustomPhoneService.buyPhoneNumber(
      phoneNumber: phoneNumber,
      friendlyName: friendlyName,
    );
  }
}
```

### 5. N8N - אוטומציה
**פונקציונליות שהפרויקט משתמש בה**:
- Webhook processing
- Workflow automation
- Data processing

**קוד החלפה**:
```dart
// Custom Workflow Engine - החלפה ל-N8N
class CustomWorkflowEngine {
  // עיבוד webhook
  static Future<void> processWebhook({
    required String webhookType,
    required Map<String, dynamic> data,
  }) async {
    switch (webhookType) {
      case 'call_completed':
        await _processCallCompleted(data);
        break;
      case 'sms_received':
        await _processSmsReceived(data);
        break;
      case 'payment_success':
        await _processPaymentSuccess(data);
        break;
      default:
        await _processGenericWebhook(data);
    }
  }
  
  // עיבוד סיום שיחה
  static Future<void> _processCallCompleted(Map<String, dynamic> data) async {
    try {
      // עדכון סטטוס שיחה
      await FirebaseFirestore.instance
          .collection('calls')
          .doc(data['callId'])
          .update({
        'status': 'completed',
        'completedAt': FieldValue.serverTimestamp(),
        'duration': data['duration'],
        'transcript': data['transcript'],
      });
      
      // שליחת התראה למשתמש
      await _sendNotification(
        userId: data['userId'],
        title: 'Call Completed',
        body: 'Your call with ${data['customerName']} has been completed.',
      );
      
      // עדכון סטטיסטיקות
      await _updateCallStatistics(data);
    } catch (e) {
      print('Error processing call completed: $e');
    }
  }
  
  // עיבוד SMS נכנס
  static Future<void> _processSmsReceived(Map<String, dynamic> data) async {
    try {
      // שמירת SMS
      await FirebaseFirestore.instance
          .collection('incoming_sms')
          .add({
        'from': data['from'],
        'to': data['to'],
        'body': data['body'],
        'receivedAt': FieldValue.serverTimestamp(),
        'processed': false,
      });
      
      // עיבוד אוטומטי של SMS
      await _processIncomingSms(data);
    } catch (e) {
      print('Error processing SMS received: $e');
    }
  }
  
  // עיבוד תשלום מוצלח
  static Future<void> _processPaymentSuccess(Map<String, dynamic> data) async {
    try {
      // עדכון סטטוס מנוי
      await FirebaseFirestore.instance
          .collection('users')
          .doc(data['userId'])
          .update({
        'subscriptionStatus': 'active',
        'subscriptionId': data['subscriptionId'],
        'lastPaymentAt': FieldValue.serverTimestamp(),
      });
      
      // שליחת אישור תשלום
      await _sendPaymentConfirmation(data);
    } catch (e) {
      print('Error processing payment success: $e');
    }
  }
  
  // עיבוד webhook כללי
  static Future<void> _processGenericWebhook(Map<String, dynamic> data) async {
    // לוגיקה כללית לעיבוד webhooks
    await FirebaseFirestore.instance
        .collection('webhook_logs')
        .add({
      'data': data,
      'processedAt': FieldValue.serverTimestamp(),
    });
  }
  
  // שליחת התראה
  static Future<void> _sendNotification({
    required String userId,
    required String title,
    required String body,
  }) async {
    // Firebase Cloud Messaging
    await FirebaseMessaging.instance.sendToTopic(
      'user_$userId',
      data: {
        'title': title,
        'body': body,
      },
    );
  }
  
  // עדכון סטטיסטיקות שיחות
  static Future<void> _updateCallStatistics(Map<String, dynamic> data) async {
    await FirebaseFirestore.instance
        .collection('statistics')
        .doc('calls')
        .update({
      'totalCalls': FieldValue.increment(1),
      'totalDuration': FieldValue.increment(data['duration'] ?? 0),
      'lastCallAt': FieldValue.serverTimestamp(),
    });
  }
  
  // עיבוד SMS נכנס
  static Future<void> _processIncomingSms(Map<String, dynamic> data) async {
    // לוגיקה לעיבוד SMS נכנס
    // לדוגמה: מענה אוטומטי, העברה לטכנאי, וכו'
  }
  
  // שליחת אישור תשלום
  static Future<void> _sendPaymentConfirmation(Map<String, dynamic> data) async {
    // שליחת אימייל אישור תשלום
    await FirebaseFunctions.instance
        .httpsCallable('sendMailToCustomer')
        .call({
      'email': data['email'],
      'subject': 'Payment Confirmation',
      'body': 'Your payment has been processed successfully.',
    });
  }
}
```

## Firebase Cloud Functions - החלפה ל-N8N

```javascript
// functions/customWorkflow.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// עיבוד webhook שיחות
exports.processCallWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const data = req.body;
    
    // עיבוד נתוני השיחה
    await admin.firestore().collection('calls').add({
      ...data,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // עדכון סטטוס משתמש
    if (data.userId) {
      await admin.firestore().collection('users')
        .doc(data.userId)
        .update({
          lastCallTime: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing call webhook:', error);
    res.status(500).send('Error');
  }
});

// עיבוד webhook SMS
exports.processSmsWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const data = req.body;
    
    // שמירת SMS
    await admin.firestore().collection('incoming_sms').add({
      from: data.From,
      to: data.To,
      body: data.Body,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing SMS webhook:', error);
    res.status(500).send('Error');
  }
});

// עיבוד webhook תשלומים
exports.processPaymentWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const data = req.body;
    
    // עדכון סטטוס מנוי
    await admin.firestore().collection('users')
      .doc(data.userId)
      .update({
        subscriptionStatus: 'active',
        lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing payment webhook:', error);
    res.status(500).send('Error');
  }
});
```

## סיכום החיסכון

### עלויות חודשיות נחסכות:
- **Vapi AI**: $200-500
- **Stripe**: $50-150  
- **Vonage**: $50-100 (הסרה מלאה)
- **N8N**: $20-50

**סה"כ חיסכון חודשי**: $320-800

### עלויות פיתוח:
- **Custom AI Service**: $8,000-12,000
- **Custom Billing Service**: $5,000-8,000
- **Custom Phone Service**: $2,000-3,000
- **Custom Workflow Engine**: $2,000-3,000

**סה"כ עלות פיתוח**: $17,000-26,000

### זמן החזר: 20-30 חודשים
