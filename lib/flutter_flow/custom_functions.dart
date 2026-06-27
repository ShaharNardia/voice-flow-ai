import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'lat_lng.dart';
import 'place.dart';
import 'uploaded_file.dart';
import '/backend/backend.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '/backend/schema/structs/index.dart';
import '/backend/schema/enums/enums.dart';
import '/auth/firebase_auth/auth_util.dart';

List<AssistantStruct> updateAssitant(
  List<AssistantStruct> oldAssistant,
  int index,
  AssistantStruct newAssistant,
) {
  oldAssistant[index] = newAssistant;
  return oldAssistant;
}

bool? filterAssistant(
  dynamic searchItem,
  String? userId,
  String? searchKeyword,
) {
  // Check both ownerId and userId for backwards compatibility
  final metadata = searchItem?['metadata'];
  final ownerId = metadata?['ownerId'];
  final legacyUserId = metadata?['userId'];
  // Show if owned by user, OR if it's a shared/system assistant (no owner)
  final isOwned = ownerId == userId || legacyUserId == userId;
  final isShared = (ownerId == null || ownerId == '' || ownerId == 'null');
  final isUserMatch = isOwned || isShared;
  final name = searchItem?['name']?.toString() ?? '';
  final keyword = searchKeyword?.toLowerCase() ?? '';
  return isUserMatch && name.toLowerCase().contains(keyword);
}

String returnTwoText(
  String text1,
  String text2,
) {
  return "$text1 : $text2";
}

List<PhoneNumberStruct> updatePhoneNumber(
  List<PhoneNumberStruct> oldPhoneNumbers,
  int index,
  PhoneNumberStruct newPhoneNumber,
) {
  oldPhoneNumbers[index] = newPhoneNumber;
  return oldPhoneNumbers;
}

dynamic convertJsontoString(String role) {
  return role;
}

bool? filterSearch(
  String? searchKeyword,
  String? searchItem,
) {
  return searchItem!.toLowerCase().contains(searchKeyword!.toLowerCase());
}

String? formatTime(String isoDateString) {
  // Parse the ISO 8601 string to a DateTime object
  DateTime dateTime = DateTime.parse(isoDateString);

  // Format the DateTime object to the desired format
  final DateFormat formatter = DateFormat('MMM dd, yyyy h:mm a');
  return formatter.format(dateTime);
}

String calculateDuration(
  String startTimeStr,
  String endTimeStr,
) {
// Parse the ISO 8601 strings into DateTime objects
  DateTime startTime = DateTime.parse(startTimeStr);
  DateTime endTime = DateTime.parse(endTimeStr);

  // Calculate the difference between the two times
  Duration duration = endTime.difference(startTime);

  // Get hours, minutes, and seconds from the duration
  int hours = duration.inHours;
  int minutes = (duration.inMinutes % 60);
  int seconds = (duration.inSeconds % 60);

  // Return the formatted duration as a string
  return '$hours:$minutes:$seconds';
}

bool checkRole(String role) {
  return role == 'user' ? true : false;
}

bool? getUserAssistants(
  dynamic searchItem,
  String? userId,
) {
  // Check both ownerId and userId for backwards compatibility
  final metadata = searchItem?['metadata'];
  final ownerId = metadata?['ownerId'];
  final legacyUserId = metadata?['userId'];
  // Show assistant if owned by this user, OR if it has no owner (system/shared assistant)
  final isOwned = ownerId == userId || legacyUserId == userId;
  final isShared = (ownerId == null || ownerId == '' || ownerId == 'null');
  return isOwned || isShared;
}

List<String> returnEmptyList(List<String>? selected) {
  return selected ?? [];
}

DocumentReference? convertTechId(String? id) {
  return FirebaseFirestore.instance.collection('Technician').doc(id!);
}

bool? jobFilter(
  String? textfield,
  String? userName,
  String? phone,
) {
  return (userName!.toLowerCase().contains(textfield!.toLowerCase())) ||
      phone!.toLowerCase().contains(textfield!.toLowerCase());
}

List<JobStatus>? returnUselessJobStatuses() {
  return [JobStatus.Unassigned, JobStatus.Completed];
}

List<String> returnFiestSpetialization() {
  return ["HVAC"];
}

String createReminderMessage(
  String jobDescription,
  String scheduledTime,
  String? address,
  String? helpLine,
  int? jobId,
  String? userName,
) {
  // Build the message
  return '''
You have a scheduled job:
- Job Id: $jobId!
- Customer Name: $userName!
- Job: $jobDescription
- Date Time: $scheduledTime
- Address: $address
- Contact: $helpLine

Please confirm the Job replying to this msg (yes/no)
''';
}

DateTime getAdjacentDate(
  DateTime date,
  bool getNext,
) {
  return getNext
      ? date.add(Duration(days: 1))
      : date.subtract(Duration(days: 1));
}

String returnImageToString(String? imagePath) {
  return imagePath ?? "";
}

String returnSmsMessageNewTech(
  String jobId,
  String jobTimer,
  String jobDesc,
) {
  return '''
🔔 Job Assigned [Job ID: $jobId]
Hello, you've been assigned a new task:
$jobDesc
🕒 Scheduled Time: $jobTimer
 Thank you!
''';
}

String? convertStringtoPhotoUrl(String? photo) {
  return photo;
}

String? promptForAssistant(
  String? name,
  String? industry,
  String? agentName,
) {
  if (name == null || industry == null || agentName == null) return null;

  return '''
[Identity]  
You are $agentName, an AI-powered customer service representative for $name based on the knowledge base provided, operating within the $industry sector. Your primary role is to assist with inquiries, schedule appointments, and provide accurate information to ensure a smooth and pleasant customer experience.

[Style]  
- Maintain a professional yet approachable tone suitable for the industry.  
- Adapt your personality to fit the company's brand, whether friendly for home services or formal for legal services.  
- Use clear and concise language with natural contractions.  
- Display confidence when discussing industry-specific topics, and be patient and attentive with a hint of wit to create a friendly atmosphere.

[Response Guidelines]  
- Use “first,” “second,” “third,” etc., when presenting multiple options.  
- Let the caller respond fully before moving on, and prompt if there's a pause longer than 5 seconds, asking, “Are you still there?”  
- Immediately disconnect spam or advertisement calls.  
- Verify email addresses by spelling them out and confirming correct spelling.

[Task & Goals]  
1. Answer incoming calls with: “Thank you for calling $name based on the knowledge base provided. This is $agentName, your AI dispatcher. How may I help you today?”  
2. Understand the issue or service request: “Could you please tell me what service you need or the issue you're facing?”  
   < wait for user response >    
3. Respond confidently based on the specific service: “That’s something we can absolutely help with. Thanks for explaining! It sounds like a $industry-specific service. We’ll ensure the right professional is scheduled for you.”  
4. Ask for the preferred service time: “When would you like the service to be done? You can specify a date or say ‘tomorrow,’ ‘this weekend,’ or ‘as soon as possible.’”  
   - Convert relative times to exact datetime using the current time as reference, formatted in RFC 3339.  
5. Collect user details: Ask for full name, email address, and job address, confirming the email by spelling it back.  
6. Confirm the appointment details: “Thank you! Just to confirm, we have you scheduled for a [jobTitle] on [datetime] at [address]. A confirmation will be sent to [email] shortly.”

[Error Handling / Fallback]  
- If the input is unclear, request clarification politely.  
- Should you encounter any issues, inform the customer and ask to repeat.  
- For off-topic inquiries, gently redirect to industry-related topics.  
- Use humor to maintain a light atmosphere if necessary: “Well, I’m a super-smart AI focusing on $industry! For anything else, I might have to take a robot nap!”

[Call Closing]  
- If the customer says goodbye, reciprocate and hang up.  
- Offer additional assistance: “Is there anything else I can help you with today?”  
- Thank the customer: “Thank you for choosing $name. Have a fantastic day!”
''';
}

String? successEvaluation() {
  return "You are an expert call evaluator. You've been provided with a call transcript, and your task is to assign a numeric value [0, 1, or 2] based on the presence of the following information provided by the user during the conversation:\n\nuserName\nuserEmail\njobDescription\ntimeRequested\naddress\n\nAssign values according to these rules:\n\nReturn 1 if all the above fields (userName, userEmail, jobDescription, timeRequested, address) are provided.\nReturn 2 if userEmail is provided, but one or more other fields are missing.\nReturn 0 if none of above fields (userName, userEmail, jobDescription, timeRequested, address) are provided.\n\nRespond clearly and concisely with only the numeric value.";
}

List<ScheduleStruct>? returnDefaultSchedule() {
  List<ScheduleStruct> schedule = [];
  List<String> days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  for (String day in days) {
    schedule.add(ScheduleStruct(
        day: day,
        startTime: DateTime(2023, 1, 1, 9, 0), // 9 AM
        endTime: DateTime(2023, 1, 1, 17, 0), // 5 PM
        closed: false));
  }

  return schedule;
}

String? returnStructuredDataAsJsonString() {
  return "You are an expert data extractor. Your task is to extract relevant information from the provided conversation transcript between our handyman sales agent and a user requesting a service.\n\nExtract the information and format it exactly into the following JSON structure. If a particular field isn't mentioned or is not available in the conversation, use an empty string (\"\") instead of a null value. For the timeRequested field, if the user does not specify a time, use the current datetime as default.\n\n{\n  \"userName\": \"<Name of the user>\",\n  \"userEmail\": \"<Email of the user>\",\n  \"jobTitle\": \"<Assign a short title to job based on it's descrption>\",\n  \"jobDescription\": \"<Description of the job the user needs done>\",\n  \"timeRequested\": \"<The datetime when the user requested the job to be performed. If a relative time is mentioned (e.g., 'tomorrow', 'next Friday'), calculate the exact datetime using the current time as a reference. Return the datetime in Google timestamp format (RFC 3339). Important note If no time is provided, default to the current datetime.>\",\n  \"address\": \"<Address provided by the user where the job should be performed>\"\n}\nProvide only this JSON as your response, accurately populated with data from the conversation.";
}

List<String>? returnLanguageCode() {
  return [
    "en",
    "zh",
    "de",
    "es",
    "ru",
    "ko",
    "fr",
    "ja",
    "pt",
    "tr",
    "pl",
    "ca",
    "nl",
    "ar",
    "sv",
    "it",
    "id",
    "hi",
    "fi",
    "vi",
    "he",
    "uk",
    "el",
    "ms",
    "cs",
    "ro",
    "da",
    "hu",
    "ta",
    "no",
    "th",
    "ur",
    "hr",
    "bg",
    "lt",
    "la",
    "mi",
    "ml",
    "cy",
    "sk",
    "te",
    "fa",
    "lv",
    "bn",
    "sr",
    "az",
    "sl",
    "kn",
    "et",
    "mk",
    "br",
    "eu",
    "is",
    "hy",
    "ne",
    "mn",
    "bs",
    "kk",
    "sq",
    "sw",
    "gl",
    "mr",
    "pa",
    "si",
    "km",
    "sn",
    "yo",
    "so",
    "af",
    "oc",
    "ka",
    "be",
    "tg",
    "sd",
    "gu",
    "am",
    "yi",
    "lo",
    "uz",
    "fo",
    "ht",
    "ps",
    "tk",
    "nn",
    "mt",
    "sa",
    "lb",
    "my",
    "bo",
    "tl",
    "mg",
    "as",
    "tt",
    "haw",
    "ln",
    "ha",
    "ba",
    "jw",
    "su",
    "yue",
    "multi"
  ];
}

List<String> returnLanguageName() {
  return [
    "English",
    "Chinese",
    "German",
    "Spanish",
    "Russian",
    "Korean",
    "French",
    "Japanese",
    "Portuguese",
    "Turkish",
    "Polish",
    "Catalan",
    "Dutch",
    "Arabic",
    "Swedish",
    "Italian",
    "Indonesian",
    "Hindi",
    "Finnish",
    "Vietnamese",
    "Hebrew",
    "Ukrainian",
    "Greek",
    "Malay",
    "Czech",
    "Romanian",
    "Danish",
    "Hungarian",
    "Tamil",
    "Norwegian",
    "Thai",
    "Urdu",
    "Croatian",
    "Bulgarian",
    "Lithuanian",
    "Latin",
    "Maori",
    "Malayalam",
    "Welsh",
    "Slovak",
    "Telugu",
    "Persian",
    "Latvian",
    "Bengali",
    "Serbian",
    "Azerbaijani",
    "Slovenian",
    "Kannada",
    "Estonian",
    "Macedonian",
    "Breton",
    "Basque",
    "Icelandic",
    "Armenian",
    "Nepali",
    "Mongolian",
    "Bosnian",
    "Kazakh",
    "Albanian",
    "Swahili",
    "Galician",
    "Marathi",
    "Punjabi",
    "Sinhala",
    "Khmer",
    "Shona",
    "Yoruba",
    "Somali",
    "Afrikaans",
    "Occitan",
    "Georgian",
    "Belarusian",
    "Tajik",
    "Sindhi",
    "Gujarati",
    "Amharic",
    "Yiddish",
    "Lao",
    "Uzbek",
    "Faroese",
    "Haitian Creole",
    "Pashto",
    "Turkmen",
    "Norwegian Nynorsk",
    "Maltese",
    "Sanskrit",
    "Luxembourgish",
    "Burmese",
    "Tibetan",
    "Tagalog",
    "Malagasy",
    "Assamese",
    "Tatar",
    "Hawaiian",
    "Lingala",
    "Hausa",
    "Bashkir",
    "Javanese",
    "Sundanese",
    "Cantonese",
    "Multi-Langual"
  ];
}

List<String>? returnAreaCodes() {
  return [
    "205", "251", "256", "334", "659", "938", // Alabama
    "907", // Alaska
    "480", "520", "602", "623", "928", // Arizona
    "327", "479", "501", "870", // Arkansas
    "209", "213", "279", "310", "323", "341", "350", "357", "369", "408", "415",
    "424", "442", "510", "530", "559", "562", "619", "626", "628", "650", "657",
    "661", "669", "707", "714", "738", "747", "760", "805", "818", "820", "831",
    "837", "840", "858", "909", "916", "925", "949", "951", // California
    "303", "719", "720", "748", "970", "983", // Colorado
    "203", "475", "860", "959", // Connecticut
    "302", // Delaware
    "202", "771", // DC
    "239", "305", "321", "324", "352", "386", "407", "448", "561", "645", "656",
    "689", "727", "728", "754", "772", "786", "813", "850", "863", "904", "941",
    "954", // Florida
    "229", "404", "470", "478", "678", "706", "762", "770", "912",
    "943", // Georgia
    "808", // Hawaii
    "208", "986", // Idaho
    "217", "224", "309", "312", "331", "447", "464", "618", "630", "708", "730",
    "773", "779", "815", "847", "861", "872", // Illinois
    "219", "260", "317", "463", "574", "765", "812", "930", // Indiana
    "319", "515", "563", "641", "712", // Iowa
    "316", "620", "785", "913", // Kansas
    "270", "364", "502", "606", "859", // Kentucky
    "225", "318", "337", "457", "504", "985", // Louisiana
    "207", // Maine
    "227", "240", "301", "410", "443", "667", // Maryland
    "339", "351", "413", "508", "617", "774", "781", "857",
    "978", // Massachusetts
    "231", "248", "269", "313", "517", "586", "616", "679", "734", "810", "906",
    "947", "989", // Michigan
    "218", "320", "507", "612", "651", "763", "924", "952", // Minnesota
    "228", "471", "601", "662", "769", // Mississippi
    "235", "314", "417", "557", "573", "636", "660", "816", "975", // Missouri
    "406", // Montana
    "308", "402", "531", // Nebraska
    "702", "725", "775", // Nevada
    "603", // New Hampshire
    "201", "551", "609", "640", "732", "848", "856", "862", "908",
    "973", // New Jersey
    "505", "575", // New Mexico
    "212", "315", "329", "332", "347", "363", "516", "518", "585", "607", "624",
    "631", "646", "680", "716", "718", "838", "845", "914", "917", "929",
    "934", // New York
    "252", "336", "472", "704", "743", "828", "910", "919", "980",
    "984", // North Carolina
    "701", // North Dakota
    "216", "220", "234", "283", "326", "330", "380", "419", "436", "440", "513",
    "567", "614", "740", "937", // Ohio
    "405", "539", "572", "580", "918", // Oklahoma
    "458", "503", "541", "971", // Oregon
    "215", "223", "267", "272", "412", "445", "484", "570", "582", "610", "717",
    "724", "814", "835", "878", // Pennsylvania
    "401", // Rhode Island
    "803", "821", "839", "843", "854", "864", // South Carolina
    "605", // South Dakota
    "423", "615", "629", "731", "865", "901", "931", // Tennessee
    "210", "214", "254", "281", "325", "346", "361", "409", "430", "432", "469",
    "512", "682", "713", "726", "737", "806", "817", "830", "832", "903", "915",
    "940", "945", "956", "972", "979", // Texas
    "385", "435", "801", // Utah
    "802", // Vermont
    "276", "434", "540", "571", "703", "757", "804", // Virginia
    "206", "253", "360", "425", "509", "564", // Washington
    "304", "681", // West Virginia
    "262", "274", "414", "534", "608", "715", "920", // Wisconsin
    "307" // Wyoming
  ];
}

int? createUniqueJobId() {
  int timestamp = DateTime.now().millisecondsSinceEpoch;

  // Generate a random number (for added uniqueness)
  int randomNumber =
      math.Random().nextInt(1000); // Random number between 0 and 999

  // Combine the timestamp and random number to create a unique ID
  return timestamp + randomNumber;
}

bool? checkIntigerNull(int? jobId) {
  return jobId == null || jobId == 0 ? true : false;
}

bool? getUserPhoneNumbers(
  dynamic item,
  String? userId,
) {
  return item?['serverUrl']
          ?.replaceAll('https://', '')
          .replaceAll('.com', '') ==
      userId;
}

String? appointementSetterSystemPrompt(
  CompanyRecord companyData,
  String agentNamee,
) {
  // Extract relevant fields from companyData
  String companyName = companyData.name;
  String agentName =
      agentNamee; // You can pass agent name as a parameter as well
  String phoneNumber = companyData.companyPhoneNumbers.first;
  String website = companyData.companyLink;
  String industry = companyData.industry;
  String service = companyData.service.map((s) {
        // Formatting service as a readable string with name, description, price, and duration
        String serviceName = s.name ?? 'Unknown Service';
        String description = s.description ?? 'No description available';
        String price = s.price != null ? '\$${s.price}' : 'Not available';
        String duration = s.duration ?? 'Duration not specified';

        return '$serviceName: $description | Price: $price | Duration: $duration';
      }).join('\n') ??
      'No services listed'; // Formatting each service entry
  // Assuming service is a list
  String timeZone = companyData.timeZone;
  String fallbackNumber = companyData.fallBackNumber;
  bool offerFreeEstimation = companyData.offerFreeEstimation;
  bool leaveMessagePermission = companyData.leaveMessagePermission;
  bool createJobPermission = companyData.createJobPermission;
  bool reschedulePermission = companyData.reshedulePermission;
  bool cancelPermission = companyData.cancelPermission;
  bool addNotePermission = companyData.addNotePermission;
  bool priceRestriction = companyData.priceRestriction;
  bool legalRestriction = companyData.legalRestriction;
  bool medicalRestriction = companyData.medicalRestriction;
  bool personalQuestion = companyData.personalQuestion;
  String additionalRestrictionTopics = companyData.additionalRestrictionTopics;

  // Create the assistant prompt dynamically
  String promptTemplate = '''
[Identity]  
You are $agentName, an AI-powered customer service representative for $companyName, operating within the $industry industry. Your primary role is to assist with inquiries, collect relevant details for appointments, and store them in the system to ensure a smooth and pleasant customer experience.

[Company Information]  
- Phone Number: $phoneNumber  
- Website: $website  
- Time Zone: $timeZone  

[Service Details]  
We provide the following services: 
$service

[Permissions & Restrictions]  
- Offer Free Estimation: ${offerFreeEstimation ? 'Yes' : 'No'}  
- Leave Message Permission: ${leaveMessagePermission ? 'Yes' : 'No'}  
- Create Job Permission: ${createJobPermission ? 'Yes' : 'No'}  
- Reschedule Permission: ${reschedulePermission ? 'Yes' : 'No'}  
- Cancel Permission: ${cancelPermission ? 'Yes' : 'No'}  
- Add Note Permission: ${addNotePermission ? 'Yes' : 'No'}  
- Price Negotiation Restriction: ${priceRestriction ? 'Yes' : 'No'}  
- Legal Advice Restriction: ${legalRestriction ? 'Yes' : 'No'}  
- Medical Advice Restriction: ${medicalRestriction ? 'Yes' : 'No'}  
- Personal Staff Question: ${personalQuestion ? 'Yes' : 'No'}  
- Additional Restriction Topics: $additionalRestrictionTopics  

[Style]  
Maintain a professional yet approachable tone suitable for the industry. Adapt your personality to fit the company's brand, being friendly for home services or formal for legal services. Use clear and concise language with natural contractions. Display confidence when discussing industry-specific topics while being patient and attentive, with a hint of wit to create a friendly atmosphere.

[Natural Conversation Flow - CRITICAL]
You MUST sound like a real human customer service representative, NOT a robot. Follow these rules:
- When you need a moment to think or process, use natural Hebrew filler phrases like: "רגע אחד...", "בוא נראה...", "אממ...", "כן, אני בודק את זה...", "שנייה, אני מסתכל...", "בסדר גמור, תן לי רגע..."
- NEVER leave silence longer than 1 second without saying something. If processing takes time, immediately say a filler phrase.
- Use warm acknowledgment phrases: "מצוין!", "נהדר!", "בטח!", "בשמחה!", "אין בעיה!", "אני מבין..."
- Mirror the caller's energy and pace. If they speak fast, respond promptly. If they are relaxed, match that tone.
- Use "אני" (I) not "אנחנו" (we) when referring to yourself. Use "אנחנו" only when referring to the company.
- Add brief verbal nods during the caller's speech: "כן", "נכון", "מבין", "אוקיי"

[Response Guidelines]  
Use "ראשית," "שנית," "שלישית," etc., when presenting multiple options in Hebrew. Allow the caller to respond fully before moving on, and prompt if there's a pause longer than 5 seconds by asking, "אתה עדיין איתי?" or "Are you still there?" depending on the language. Immediately disconnect spam or advertisement calls. Verify email addresses by spelling them out and confirming correct spelling.

[Task & Goals]  
1. Answer incoming calls with: "Thank you for calling $companyName. This is $agentName, your AI dispatcher. How may I help you today?"
2. Understand the issue or service request: "Could you please tell me what service you need or the issue you're facing?"
   < wait for user response >
3. Respond confidently based on the specific service: "That's something we can absolutely help with. Thanks for explaining! It sounds like a [industry-specific service]. We'll collect all the necessary details for you."
4. Ask for the preferred service time: "When would you like the service to be done?" Convert relative times to exact datetime using the {{now}} as reference, formatted in RFC 3339.
5. Collect user details one by one: Ask for full name, then email address, then job address. Confirm the email by spelling it back.
6. Confirm the appointment details: "Thank you! Just to confirm, we have collected your details for a [jobTitle] on [datetime] at [address]. I am booking your appointment."
7. Call the "createJob" function only once with [userName], [userEmail], [title] (generate this title yourself from the {{summary}} analysis), [jobDescription], [userPhoneNumber] (the phone number of the user calling {{customer.number}}), [address] (user address where the job needs to be done), [requestedTime] (the time when user needs the job to be done). Once the information is stored and server returns successful message, politely end the conversation by saying "Your appointment has been scheduled successfully at [requestedTime]. Goodbye (end the call).

[Error Handling / Fallback]  
If the input is unclear, request clarification politely with warmth: "סליחה, לא שמעתי טוב. אפשר לחזור על זה?" or "I didn't quite catch that, could you repeat?" Should you encounter any issues, inform the customer and ask them to repeat. For off-topic inquiries, gently redirect to industry-related topics.
If any time in the call user want to talk to human call "transfer_call_tool" with $fallbackNumber

[Call Closing]  
If the customer says goodbye, reciprocate warmly and hang up. Offer additional assistance: "Is there anything else I can help you with today?" or "יש עוד משהו שאני יכול לעזור בו?" Thank the customer: "Thank you for choosing $companyName. Have a fantastic day!" or "תודה שבחרת ב-$companyName. יום מצוין!"
''';

  // Return the final prompt template
  return promptTemplate;
}

List<String>? createJobTollId() {
  return [
    "c6ebb4e2-5895-471e-a993-ccc3cf78db42",
    "c70d6472-b3af-439a-81cf-f3d936472a58"
  ];
}

String? transferCallPrompt(
  CompanyRecord companyData,
  String agentNamee,
) {
  String companyName = companyData.name;
  String agentName =
      agentNamee; // You can pass agent name as a parameter as well
  String phoneNumber = companyData.companyPhoneNumbers.first;
  String website = companyData.companyLink;
  String industry = companyData.industry;
  String service = companyData.service.map((s) {
        // Formatting service as a readable string with name, description, price, and duration
        String serviceName = s.name ?? 'Unknown Service';
        String description = s.description ?? 'No description available';
        String price = s.price != null ? '\$${s.price}' : 'Not available';
        String duration = s.duration ?? 'Duration not specified';

        return '$serviceName: $description | Price: $price | Duration: $duration';
      }).join('\n') ??
      'No services listed'; // Formatting each service entry
  // Assuming service is a list

  String timeZone = companyData.timeZone;
  String fallbackNumber = companyData.fallBackNumber;
  bool offerFreeEstimation = companyData.offerFreeEstimation;
  bool leaveMessagePermission = companyData.leaveMessagePermission;
  bool createJobPermission = companyData.createJobPermission;
  bool reschedulePermission = companyData.reshedulePermission;
  bool cancelPermission = companyData.cancelPermission;
  bool addNotePermission = companyData.addNotePermission;
  bool priceRestriction = companyData.priceRestriction;
  bool legalRestriction = companyData.legalRestriction;
  bool medicalRestriction = companyData.medicalRestriction;
  bool personalQuestion = companyData.personalQuestion;
  String additionalRestrictionTopics = companyData.additionalRestrictionTopics;

  return '''
[Identity]  
You are a call forwarding agent responsible for connecting users to the appropriate service by verifying job IDs.


[Company Information]  
- Phone Number: $phoneNumber 
- Website: $website  
- Time Zone: $timeZone  

[Service Details]  
We provide the following services: 
$service

[Permissions & Restrictions]  
- Offer Free Estimation: ${offerFreeEstimation ? 'Yes' : 'No'}  
- Leave Message Permission: ${leaveMessagePermission ? 'Yes' : 'No'}  
- Create Job Permission: ${createJobPermission ? 'Yes' : 'No'}  
- Reschedule Permission: ${reschedulePermission ? 'Yes' : 'No'}  
- Cancel Permission: ${cancelPermission ? 'Yes' : 'No'}  
- Add Note Permission: ${addNotePermission ? 'Yes' : 'No'}  
- Price Negotiation Restriction: ${priceRestriction ? 'Yes' : 'No'}  
- Legal Advice Restriction: ${legalRestriction ? 'Yes' : 'No'}  
- Medical Advice Restriction: ${medicalRestriction ? 'Yes' : 'No'}  
- Personal Staff Question: ${personalQuestion ? 'Yes' : 'No'}  
- Additional Restriction Topics: $additionalRestrictionTopics  

[Style]  
- Use a professional and clear tone.  
- Communicate in a concise and straightforward manner.

[Response Guidelines]  
- Confirm the job ID by repeating it back to the user with capitalization.  
- Ensure all numbers are spelled out for clarity.

[Task & Goals]  
1. Prompt the user for their job ID.  
2. Upon receiving the job ID, repeat it back for confirmation without adding spaces.  
3. Trigger the 'getCustomerNumberAgainstJobId' tool with the provided jobId. The jobId must be an integer value sent to the function.  
4. On successfully verifying job id from the system, prompt the user that "Your job id has been verified successfully" and then trigger the 'transfer_call_tool' tool with the received phone number from "getCustomerNumberAgainstJobId".  
5. If there is an error, communicate the error message to the user.

[Error Handling / Fallback]  
- If the user's input is unclear or invalid, politely ask them to repeat or clarify their job ID.  
-If any time in the call user want to talk to human call "transfer_call_tool" with $fallbackNumber
- If there is an error in connecting to the server or receiving the number, inform the user and attempt to reconnect.
  ''';
}

List<String>? transferCallToolIds() {
  return [
    "994ec105-1cdd-4edc-94c8-9521226d1ab3",
    "c70d6472-b3af-439a-81cf-f3d936472a58"
  ];
}

String? outboundAppointementSetterSystemPrompt(
  CompanyRecord companyData,
  String agentNamee,
) {
  // Extract relevant fields from companyData
  String companyName = companyData.name;
  String agentName =
      agentNamee; // You can pass agent name as a parameter as well
  String phoneNumber = companyData.companyPhoneNumbers.first;

  String website = companyData.companyLink;
  String industry = companyData.industry;
  String service = companyData.service.map((s) {
        // Formatting service as a readable string with name, description, price, and duration
        String serviceName = s.name ?? 'Unknown Service';
        String description = s.description ?? 'No description available';
        String price = s.price != null ? '\$${s.price}' : 'Not available';
        String duration = s.duration ?? 'Duration not specified';

        return '$serviceName: $description | Price: $price | Duration: $duration';
      }).join('\n') ??
      'No services listed'; // Formatting each service entry
  // Assuming service is a list

  String timeZone = companyData.timeZone;
  String fallbackNumber = companyData.fallBackNumber;
  bool offerFreeEstimation = companyData.offerFreeEstimation;
  bool leaveMessagePermission = companyData.leaveMessagePermission;
  bool createJobPermission = companyData.createJobPermission;
  bool reschedulePermission = companyData.reshedulePermission;
  bool cancelPermission = companyData.cancelPermission;
  bool addNotePermission = companyData.addNotePermission;
  bool priceRestriction = companyData.priceRestriction;
  bool legalRestriction = companyData.legalRestriction;
  bool medicalRestriction = companyData.medicalRestriction;
  bool personalQuestion = companyData.personalQuestion;
  String additionalRestrictionTopics = companyData.additionalRestrictionTopics;

  // Create the assistant prompt dynamically
  String promptTemplate = '''
[Identity]  
You are $agentName, an AI-powered customer service representative for $companyName, operating within the $industry industry. Your primary role is to assist with inquiries, collect relevant details for appointments, and store them in the system to ensure a smooth and pleasant customer experience.

[Company Information]  
- Phone Number: $phoneNumber  
- Website: $website  
- Time Zone: $timeZone  

[Service Details]  
We provide the following services: 
$service

[Permissions & Restrictions]  
- Offer Free Estimation: ${offerFreeEstimation ? 'Yes' : 'No'}  
- Leave Message Permission: ${leaveMessagePermission ? 'Yes' : 'No'}  
- Create Job Permission: ${createJobPermission ? 'Yes' : 'No'}  
- Reschedule Permission: ${reschedulePermission ? 'Yes' : 'No'}  
- Cancel Permission: ${cancelPermission ? 'Yes' : 'No'}  
- Add Note Permission: ${addNotePermission ? 'Yes' : 'No'}  
- Price Negotiation Restriction: ${priceRestriction ? 'Yes' : 'No'}  
- Legal Advice Restriction: ${legalRestriction ? 'Yes' : 'No'}  
- Medical Advice Restriction: ${medicalRestriction ? 'Yes' : 'No'}  
- Personal Staff Question: ${personalQuestion ? 'Yes' : 'No'}  
- Additional Restriction Topics: $additionalRestrictionTopics  

[Style]  
Maintain a professional yet approachable tone suitable for the industry. Adapt your personality to fit the company's brand, being friendly for home services or formal for legal services. Use clear and concise language with natural contractions. Display confidence when discussing industry-specific topics while being patient and attentive, with a hint of wit to create a friendly atmosphere.

[Natural Conversation Flow - CRITICAL]
You MUST sound like a real human customer service representative, NOT a robot. Follow these rules:
- When you need a moment to think or process, use natural Hebrew filler phrases like: "רגע אחד...", "בוא נראה...", "אממ...", "כן, אני בודק את זה...", "שנייה, אני מסתכל...", "בסדר גמור, תן לי רגע..."
- NEVER leave silence longer than 1 second without saying something. If processing takes time, immediately say a filler phrase.
- Use warm acknowledgment phrases: "מצוין!", "נהדר!", "בטח!", "בשמחה!", "אין בעיה!", "אני מבין..."
- Mirror the caller's energy and pace. If they speak fast, respond promptly. If they are relaxed, match that tone.
- Use "אני" (I) not "אנחנו" (we) when referring to yourself. Use "אנחנו" only when referring to the company.
- Add brief verbal nods during the caller's speech: "כן", "נכון", "מבין", "אוקיי"

[Response Guidelines]  
Use "ראשית," "שנית," "שלישית," etc., when presenting multiple options in Hebrew. Allow the caller to respond fully before moving on, and prompt if there's a pause longer than 5 seconds by asking, "אתה עדיין איתי?" or "Are you still there?" depending on the language. Immediately disconnect spam or advertisement calls. Verify email addresses by spelling them out and confirming correct spelling.

[Task & Goals]  
1. Reach out to customer with: "Hey {{full_name}} this is James from $companyName. I came to know that you have {{service}} issue. Please provide the necessary information so I can book an appointment. Start with collection the following information for customer"   
4. Ask for the preferred service time: "When would you like the service to be done?" Convert relative times to exact datetime using the {{now}} as reference, formatted in RFC 3339.  
5. Collect user details one by one: Ask for full name, then email address, then job address. Confirm the email by spelling it back.  
6. Confirm the appointment details: "Thank you! Just to confirm, we have collected your details for a [jobTitle] on [datetime] at [address]. I am booking your appointment."  
7. Call the "createJob" function only once with [userName], [userEmail], [title] (generate this title yourself from the {{summary}} analysis), [jobDescription], [userPhoneNumber] (the phone number of the user calling {{customer.number}}), [address] (user address where the job needs to be done), [requestedTime] (the time when user needs the job to be done). Once the information is stored and server returns successful message, politely end the conversation by saying "Your appointment has been scheduled successfully at [requestedTime]. Goodbye (end the call).

[Error Handling / Fallback]  
If the input is unclear, request clarification politely with warmth: "סליחה, לא שמעתי טוב. אפשר לחזור על זה?" or "I didn't quite catch that, could you repeat?" Should you encounter any issues, inform the customer and ask them to repeat. For off-topic inquiries, gently redirect to industry-related topics.

[Call Closing]  
If the customer says goodbye, reciprocate warmly and hang up. Offer additional assistance: "Is there anything else I can help you with today?" or "יש עוד משהו שאני יכול לעזור בו?" Thank the customer: "Thank you for choosing AI Dispatch. Have a fantastic day!" or "תודה שבחרת ב-AI Dispatch. יום מצוין!"
''';

  // Return the final prompt template
  return promptTemplate;
}

dynamic updateTool(
  dynamic inputJson,
  String phoneNumber,
) {
  // Check if the phone number is already in destinations
  bool phoneExistsInDestinations = inputJson['destinations']
      .any((destination) => destination['number'] == phoneNumber);

  // Check if the phone number is already in messages conditions
  bool phoneExistsInConditions = inputJson['messages'][0]['conditions']
      .any((condition) => condition['value'] == phoneNumber);

  // If the phone number is not in destinations, add it
  if (!phoneExistsInDestinations) {
    inputJson['destinations'].add({
      "type": "number",
      "number": phoneNumber,
      "message": "I am transferring your call to customer",
      "description":
          "On successfully receiving the phone number from 'getCustomerNumber' tool you have to forward the call",
      "transferPlan": {"mode": "blind-transfer", "sipVerb": "refer"},
      "numberE164CheckEnabled": false
    });
  }

  // If the phone number is not in conditions, add it
  if (!phoneExistsInConditions) {
    inputJson['messages'][0]['conditions']
        .add({"param": "phoneNumber", "value": phoneNumber, "operator": "eq"});
  }

  inputJson.remove('id');
  inputJson.remove('createdAt');
  inputJson.remove('updatedAt');
  inputJson.remove('type');
  inputJson.remove('orgId');

  // Return the modified JSON object
  return inputJson;
}

String lowercaseString(String value) {
  return value.toLowerCase();
}

String formatListToString(List<String> inputList) {
  return inputList.join(', ');
}

List<String> getSubItems(String industryName) {
  Map<String, List<String>> services = {
    "Locksmith": [
      "Lock installation",
      "Rekeying services",
      "Master key systems",
      "Emergency lockouts",
      "Smart lock setup",
      "Safe cracking",
      "High-security locks",
      "Access control wiring"
    ],
    "Junk Removal": [
      "Furniture removal",
      "Appliance disposal",
      "Construction debris",
      "Yard waste hauling",
      "Heavy equipment use",
      "Hazardous waste handling",
      "Recycling procedures",
      "Hoarding cleanup"
    ],
    "Garage Door Services": [
      "Door installation",
      "Torsion spring repair",
      "Track realignment",
      "Opener programming",
      "Cable replacement",
      "Panel replacement",
      "Sensor calibration",
      "Safety inspections"
    ],
    "Appliance Repair": [
      "Refrigerator repair",
      "Washer/dryer repair",
      "Oven/stove repair",
      "Microwave servicing",
      "Icemaker repair",
      "Control board replacement",
      "Refrigerant handling",
      "Appliance installations"
    ],
    "Carpet Cleaning": [
      "Steam extraction",
      "Deep stain treatment",
      "Pet odor removal",
      "Upholstery cleaning",
      "Area rug care",
      "Water damage drying",
      "Deodorizing treatments",
      "Fabric protection"
    ],
    "Plumbing": [
      "Leak detection",
      "Water heater install",
      "Sewer inspections",
      "Pipe replacements",
      "Drain unclogging",
      "Gas line repair",
      "Fixture installations",
      "Emergency response"
    ],
    "Electrical": [
      "Home rewiring",
      "Breaker panel upgrades",
      "Surge protection install",
      "Interior lighting install",
      "Exterior lighting install",
      "EV charger setup",
      "Generator wiring",
      "Troubleshooting circuits"
    ],
    "HVAC": [
      "HVAC system installs",
      "Heat pump repair",
      "Furnace servicing",
      "AC maintenance",
      "Ductwork repair",
      "Smart thermostat install",
      "Refrigerant recycling",
      "Airflow testing"
    ],
    "Handyman": [
      "Minor plumbing repairs",
      "Minor electrical repairs",
      "Drywall patching",
      "Painting and touch-ups",
      "Flooring repairs",
      "Furniture assembly",
      "Door/window repair",
      "Small carpentry jobs"
    ],
    "Pest Control": [
      "Termite treatments",
      "Rodent exclusion",
      "Bed bug extermination",
      "General pest control",
      "Mosquito control",
      "Wildlife removal",
      "Eco-friendly treatments",
      "Inspection services"
    ],
    "Pool Services": [
      "Pool chemical balancing",
      "Pump/filter maintenance",
      "Pool leak repair",
      "Tile cleaning",
      "Heater troubleshooting",
      "Skimmer repairs",
      "Pool opening/closing",
      "Water testing"
    ],
    "Landscaping": [
      "Mowing and edging",
      "Sod installation",
      "Tree pruning",
      "Seasonal cleanups",
      "Irrigation repairs",
      "Mulch installation",
      "Landscape design",
      "Hardscape construction"
    ],
    "Restoration Services": [
      "Mold inspection",
      "Water extraction",
      "Structural drying",
      "Smoke/soot cleanup",
      "Deodorization services",
      "Demolition and removal",
      "Rebuilding services",
      "Insurance reporting"
    ],
    "Security System Installation": [
      "CCTV camera setup",
      "Alarm system wiring",
      "Motion sensor install",
      "Smart lock integration",
      "Access control setup",
      "Video doorbell install",
      "System troubleshooting",
      "Cabling and networking"
    ],
    "Moving Services": [
      "Residential moving",
      "Commercial moving",
      "Packing services",
      "Furniture assembly",
      "Long-distance coordination",
      "Fragile item handling",
      "Storage setup",
      "Heavy lifting safety"
    ],
    "Window Cleaning": [
      "Interior window cleaning",
      "Exterior window washing",
      "Screen cleaning",
      "Frame washing",
      "Ladder safety",
      "High-rise access",
      "Hard water removal",
      "Solar panel cleaning"
    ]
  };

  return services[industryName] ?? [];
}

String? returnRandomAreaCode() {
  List<String> areaCodes = [
    "205", "213", "269", "659", "920", // Your requested area codes
    "212", "310", "408", "503", "646", "718", "913", "702",
    "801", // Additional random area codes
    "415", "617", "801", "213", "323", "305", "818", "410", // More random codes
    "408", "917" // Additional random area codes
  ];

  // Return a random area code from the list
  final random = math.Random();
  int randomIndex =
      random.nextInt(areaCodes.length); // Get a random index from the list
  return areaCodes[randomIndex]; // Return the randomly selected area code
}

List<PhoneNumberStruct> updateForwardingNumber(
  String forwardingNumber,
  PhoneNumberStruct phoneStruct,
  List<PhoneNumberStruct> phoneList,
) {
  // Iterate through the list to find the struct with the matching trackingId
  for (var phone in phoneList) {
    if (phone.id == phoneStruct.id) {
      phone.forwardingNumber =
          forwardingNumber; // Directly updating the forwardingNumber
      // Update the forwarding number
    }
  }

  // Return the updated list
  return phoneList;
}

List<ScheduleStruct> return24x7Schedule() {
  List<ScheduleStruct> schedule = [];
  List<String> days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  for (String day in days) {
    schedule.add(ScheduleStruct(
      day: day,
      startTime: DateTime(2023, 1, 1, 0, 0), // 12:00 AM (start of day)
      endTime: DateTime(2023, 1, 1, 23, 59, 59), // 11:59:59 PM (end of day)
      closed: false,
    ));
  }

  return schedule;
}

double? forecastCost(double? credits) {
  return double.parse(((100 / DateTime.now().day) *
          DateTime(DateTime.now().year, DateTime.now().month + 1, 0).day)
      .toStringAsFixed(1));
}

String? extractBusinessPhoneNumber(dynamic data) {
  try {
    final messages = data["assistant"]["model"]["messages"];
    for (var message in messages) {
      if (message["role"] == "system" &&
          message["content"].contains("Phone Number:")) {
        final lines = message["content"].split('\n');
        for (var line in lines) {
          if (line.contains("Phone Number:")) {
            final phone = line.split("Phone Number:")[1].trim();
            return phone; // remove '+' if present
          }
        }
      }
    }
  } catch (e) {
    return "Error extracting phone number: $e";
  }
}

dynamic assistantBody(
  dynamic jsonInput,
  CompanyRecord? company,
  String? lead,
) {
  final variables = {
    "agentName": "${company!.assistantname}",
    "companyName": "${company!.name}",
    "industry": "${company!.industry}",
    "phoneNumber": "+1-800-123-4567",
    "website": "${company!.companyLink}",
    "timeZone": "${company!.timeZone}",
    "fallbackNumber": "${company!.fallBackNumber}",
    "now": "${DateTime.now().toUtc()}",
    "reservations": "None"
  };

  dynamic replaceVariables(dynamic input) {
    if (input is String) {
      variables.forEach((key, value) {
        input = input.replaceAll('[$key]', value);
        input = input.replaceAll('{{$key}}', value);
      });
      return input;
    } else if (input is List) {
      return input.map((item) => replaceVariables(item)).toList();
    } else if (input is Map) {
      return input.map((key, value) => MapEntry(key, replaceVariables(value)));
    } else {
      return input;
    }
  }

  /// Turns a list of ServiceStruct into a pretty multiline string.
  String formatServices(List<ServiceStruct>? services) {
    if (services == null || services.isEmpty) return 'No services listed';

    return services.map((s) {
      // s.name, s.description, s.price, s.duration all come from your struct
      final name = s.name ?? 'Unknown Service';
      final description = s.description ?? 'No description available';
      final price = s.price != null ? '\$${s.price}' : 'Not available';
      final duration = s.duration ?? 'Duration not specified';

      return '$name: $description | Price: $price | Duration: $duration';
    }).join('\n');
  }

  /// Turns a list of ScheduleStruct into a pretty multiline string.
  String formatSchedule(List<ScheduleStruct>? schedule) {
    if (schedule == null || schedule.isEmpty) return 'No schedule available';

    return schedule.map((s) {
      final day = s.day ?? 'Unknown Day';
      final start = s.startTime != null
          ? s.startTime!.toLocal().toString()
          : 'Start time not available';
      final end = s.endTime != null
          ? s.endTime!.toLocal().toString()
          : 'End time not available';
      final closed = s.closed == true ? 'Yes' : 'No';

      return 'Day: $day | Start Time: $start | End Time: $end | Closed: $closed';
    }).join('\n');
  }

  final parsedJson = jsonInput is String
      ? Map<String, dynamic>.from(jsonDecode(jsonInput))
      : Map<String, dynamic>.from(jsonInput);

  variables['service'] = formatServices(company!.service);
  variables['schedule'] = formatSchedule(company!.schedule);

  final updatedJson = replaceVariables(parsedJson);
  updatedJson['metadata'] = {
    'userId': company!.userId!.id,
    'companyId': company!.reference!.id,
    'callType': 'outbound',
    'leadRef': lead!
  };

  updatedJson['voice']['voiceId'] = company.voice;
  updatedJson['voice']['provider'] = company.agent;
  if (company.agent != "vapi" &&
      company.agent != "lmnt" &&
      company.agent != "azure") {
    updatedJson['voice']['model'] = company.modelvoice;
  }
  if (company.provider != "assembly-ai" && company.provider != "azure") {
    updatedJson['transcriber']['model'] = company.modelname;
  }
  updatedJson['transcriber']['language'] = company.language;
  updatedJson['transcriber']['provider'] = company.provider;
  updatedJson['firstMessage'] = company.outboundmessage;
  
  // Enable natural conversation features for lowest latency & human-like behavior
  updatedJson['backchannelingEnabled'] = true;
  updatedJson['backgroundDenoisingEnabled'] = true;
  updatedJson['silenceTimeoutSeconds'] = 30;
  updatedJson['responseDelaySeconds'] = 0.4;
  updatedJson['llmRequestDelaySeconds'] = 0.1;
  updatedJson['numWordsToInterruptAssistant'] = 2;
  updatedJson['maxDurationSeconds'] = 600;
  
  // Hebrew-specific filler injection for natural conversation
  if (company.language != null && company.language!.startsWith('he')) {
    updatedJson['fillerInjectionEnabled'] = true;
  }
  
  updatedJson.remove('id');
  updatedJson.remove('orgId');
  updatedJson.remove('isServerUrlSecretSet');
  updatedJson.remove('createdAt');
  updatedJson.remove('updatedAt');

  return updatedJson;
}

DocumentReference? returnLeadRef(String? id) {
  return FirebaseFirestore.instance.collection('Lead').doc(id!);
}

bool filterInvoiceBySelectedMonth(
  String item,
  String? selectedMonth,
) {
  // If no month is selected, show everything
  if (selectedMonth == null || selectedMonth.isEmpty) return true;

  DateTime? createdDate;

  try {
    // Convert timestamp string to DateTime
    final timestamp = int.tryParse(item);
    if (timestamp != null) {
      createdDate = DateTime.fromMillisecondsSinceEpoch(timestamp * 1000);
    } else {
      createdDate = DateTime.tryParse(item); // fallback
    }
  } catch (_) {
    return false;
  }

  if (createdDate == null) return false;

  // Extract month name (e.g., "August")
  final selectedMonthOnly = selectedMonth.split(' ')[0];
  final itemMonthName = DateFormat.MMMM().format(createdDate);

  return itemMonthName == selectedMonthOnly;
}

List<String> getMonthList() {
  return [
    'January 2025',
    'February 2025',
    'March 2025',
    'April 2025',
    'May 2025',
    'June 2025',
    'July 2025',
    'August 2025',
  ];
}

List<String> getlanguagesfor(String provider) {
  List<String> languages = [];

  if (provider == "assembly-ai") {
    languages = ["English"];
  } else if (provider == "azure") {
    languages = [
      "Af-ZA",
      "Am-ET",
      "Ar-AE",
      "Ar-BH",
      "Ar-DZ",
      "Ar-EG",
      "Ar-IL",
      "Ar-IQ",
      "Ar-JO",
      "Ar-KW",
      "Ar-LB",
      "Ar-Ly",
      "Ar-MA",
      "Ar-OM",
      "Ar-PS",
      "Ar-QA",
      "Ar-SA",
      "Ar-Sy",
      "Ar-TN",
      "Ar-YE",
      "Az-AZ",
      "Bg-BG",
      "Bn-IN",
      "Bs-BA",
      "Ca-ES",
      "Cy-GB",
      "Da-DK",
      "De-AT",
      "De-CH",
      "De-DE",
      "Ei-GR",
      "En-AU",
      "En-CA",
      "En-GB",
      "En-GH",
      "En-HK",
      "En-IE",
      "En-IN",
      "En-KE",
      "En-NG",
      "En-NZ",
      "En-PH",
      "En-SG",
      "En-TZ",
      "En-US",
      "En-ZA",
      "Es-AR",
      "Es-BO",
      "Es-CL",
      "Es-CO",
      "Es-CR",
      "Es-CU",
      "Es-DO",
      "Es-EC",
      "Es-ES",
      "Es-GQ",
      "Es-GT",
      "Es-HN",
      "Es-MX",
      "Es-NI",
      "Es-PA",
      "Es-PE",
      "Es-PR",
      "Es-PY",
      "Es-SV",
      "Es-US",
      "Es-UY",
      "Es-VE",
      "Et-EE",
      "Eu-ES",
      "Fa-IR",
      "Fi-FI",
      "Fil-PH",
      "Fr-BF",
      "Fr-CA",
      "Fr-CH",
      "Fr-FR",
      "Ga-IE",
      "Gl-ES",
      "Gu-IN",
      "He-IL",
      "Hi-IN",
      "Hr-HR",
      "Hu-HU",
      "Hy-AM",
      "Id-ID",
      "Is-IS",
      "It-CH",
      "It-IT",
      "Ja-JP",
      "Jv-ID",
      "Ka-GE",
      "Kk-KZ",
      "Km-KH",
      "Kn-IN",
      "Ko-KR",
      "Lo-LA",
      "Lt-LT",
      "Lv-LV",
      "Mk-MK",
      "Mi-IN",
      "Mn-MN",
      "Mr-IN",
      "Ms-MY",
      "Mt-MT",
      "My-MM",
      "Nb-NO",
      "Ne-NP",
      "NI-BE",
      "NI-NL",
      "Pa-IN",
      "Pl-PL",
      "Ps-AF",
      "Pt-BR",
      "Pt-PT",
      "Ro-RO",
      "Ru-RU",
      "Si-LK",
      "Sk-SK",
      "Sl-SI",
      "So-SO",
      "Sq-AL",
      "Sr-RS",
      "Sv-SE",
      "Sw-KE",
      "Sw-TZ",
      "Ta-IN",
      "Te-IN",
      "Th-TH",
      "Tr-TR",
      "Uk-UA",
      "Ur-IN",
      "Uz-UZ",
      "Vi-VN",
      "Wuu-CN",
      "Yue-CN",
      "Zh-CN",
      "Zh-CN-shandong",
      "Zh-CN-sichuan",
      "Zh-HK",
      "Zh-TW",
      "Zu-ZA"
    ];
  } else if (provider == "deepgram") {
    languages = [
      "En",
      "Bg",
      "Ca",
      "Zh",
      "Zh-CN",
      "Zh-HK",
      "Zh-Hans",
      "Zh-TW",
      "Zh-Hant",
      "Cs",
      "Da",
      "Da-DK",
      "Nl",
      "En-US",
      "En-AU",
      "En-GB",
      "En-NZ",
      "En-IN",
      "Et",
      "Fi",
      "Nl-BE",
      "Fr",
      "Fr-CA",
      "De",
      "De-CH",
      "El",
      "He",
      "He-IL",  // Hebrew (Israel) - added for better Hebrew support
      "Hi",
      "Hu",
      "Id",
      "It",
      "Ja",
      "Ko",
      "Ko-KR",
      "Lv",
      "Lt",
      "Ms",
      "Multi",
      "No",
      "Pl",
      "Pt",
      "Pt-BR",
      "Ro",
      "Ru",
      "Sk",
      "Es",
      "Es-419",
      "Sv",
      "Sv-SE",
      "Th",
      "Th-TH",
      "Tr",
      "Uk",
      "Vi"
    ];
  } else if (provider == "11labs") {
    languages = [
      "Af",
      "Sq",
      "Am",
      "Ar",
      "Hy",
      "As",
      "Az",
      "Ba",
      "Eu",
      "Be",
      "Bn",
      "Bs",
      "Br",
      "Bg",
      "Ca",
      "Zh",
      "Hr",
      "Cs",
      "Da",
      "Nl",
      "En",
      "Et",
      "Fo",
      "Fi",
      "Fr",
      "Gl",
      "Ka",
      "De",
      "El",
      "Gu",
      "Ht",
      "Ha",
      "Haw",
      "He",
      "Hi",
      "Hu",
      "Is",
      "Id",
      "It",
      "Ja",
      "Jp",
      "Jv",
      "Kn",
      "Kk",
      "Km",
      "Ko",
      "Lo",
      "La",
      "Lv",
      "Ln",
      "Lt",
      "Lb",
      "Mk",
      "Mg",
      "Ms",
      "Ml",
      "Mt",
      "Mi",
      "Mr",
      "Mn",
      "Mymr",
      "Ne",
      "No",
      "Nn",
      "Oc",
      "Ps",
      "Fa",
      "Pl",
      "Pt",
      "Pa",
      "Ro",
      "Ru",
      "Sa",
      "Sr",
      "Sn",
      "Sd",
      "Si",
      "Sk",
      "Sl",
      "So",
      "Es",
      "Su",
      "Sw",
      "Sv",
      "Tl",
      "Tg",
      "Ta",
      "Tt",
      "Te",
      "Th",
      "Bo",
      "Tr",
      "Tk",
      "Uk",
      "Ur",
      "Uz",
      "Vi",
      "Cy",
      "Yi",
      "Yo"
    ];
  } else if (provider == "gladia") {
    languages = [
      "Af",
      "Sq",
      "Am",
      "Ar",
      "Hy",
      "As",
      "Az",
      "Ba",
      "Eu",
      "Be",
      "Bn",
      "Bs",
      "Br",
      "Bg",
      "Ca",
      "Zh",
      "Hr",
      "Cs",
      "Da",
      "Nl",
      "En",
      "Et",
      "Fo",
      "Fi",
      "Fr",
      "Gl",
      "Ka",
      "De",
      "El",
      "Gu",
      "Ht",
      "Ha",
      "Haw",
      "He",
      "Hi",
      "Hu",
      "Is",
      "Id",
      "It",
      "Ja",
      "Jp",
      "Jv",
      "Kn",
      "Kk",
      "Km",
      "Ko",
      "Lo",
      "La",
      "Lv",
      "Ln",
      "Lt",
      "Lb",
      "Mk",
      "Mg",
      "Ms",
      "Ml",
      "Mt",
      "Mi",
      "Mr",
      "Mn",
      "Mymr",
      "Ne",
      "No",
      "Nn",
      "Oc",
      "Ps",
      "Fa",
      "Pl",
      "Pt",
      "Pa",
      "Ro",
      "Ru",
      "Sa",
      "Sr",
      "Sn",
      "Sd",
      "Si",
      "Sk",
      "Sl",
      "So",
      "Es",
      "Su",
      "Sw",
      "Sv",
      "Tl",
      "Tg",
      "Ta",
      "Tt",
      "Te",
      "Th",
      "Bo",
      "Tr",
      "Tk",
      "Uk",
      "Ur",
      "Uz",
      "Vi",
      "Cy",
      "Yi",
      "Yo"
    ];
  } else if (provider == "google") {
    languages = [
      "Multilingual",
      "Arabic",
      "Bengali",
      "Bulgarian",
      "Chinese",
      "Croatian",
      "Czech",
      "Danish",
      "Dutch",
      "English",
      "Estonian",
      "Finnish",
      "French",
      "German",
      "Greek",
      "Hebrew",
      "Hindi",
      "Hungarian",
      "Indonesian",
      "Italian",
      "Japanese",
      "Korean",
      "Latvian",
      "Lithuanian",
      "Norwegian",
      "Polish",
      "Portuguese",
      "Romanian",
      "Russian",
      "Serbian",
      "Slovak",
      "Slovenian",
      "Spanish",
      "Swahili",
      "Swedish",
      "Thai",
      "Turkish",
      "Ukrainian",
      "Vietnamese"
    ];
  } else if (provider == "openai") {
    languages = [
      "En",
      "Af",
      "Ar",
      "Hy",
      "Az",
      "Be",
      "Bs",
      "Bg",
      "Ca",
      "Zh",
      "Hr",
      "Cs",
      "Da",
      "Nl",
      "Et",
      "Fi",
      "Fr",
      "Gl",
      "De",
      "El",
      "He",
      "Hi",
      "Hu",
      "Is",
      "Id",
      "It",
      "Ja",
      "Kn",
      "Kk",
      "Ko",
      "Lv",
      "Lt",
      "Mk",
      "Ms",
      "Mr",
      "Mi",
      "Ne",
      "No",
      "Fa",
      "Pl",
      "Pt",
      "Ro",
      "Ru",
      "Sr",
      "Sk",
      "Sl",
      "Es",
      "Sw",
      "Sv",
      "Tl",
      "Ta",
      "Th",
      "Tr",
      "Uk",
      "Ur",
      "Vi",
      "Cy"
    ];
  } else if (provider == "speechmaticsa") {
    languages = [
      "English",
      "Portuguese",
      "Ar",
      "Ba",
      "Eu",
      "Be",
      "Bn",
      "Bg",
      "Yue",
      "Ca",
      "Hr",
      "Cs",
      "Da",
      "Nl",
      "En",
      "Eo",
      "Et",
      "Fi",
      "Fr",
      "Gl",
      "De",
      "El",
      "He",
      "Hi",
      "Hu",
      "Id",
      "Ia",
      "Ga",
      "It",
      "Ja",
      "Ko",
      "Lv",
      "Lt",
      "Ms",
      "Mt",
      "Cmn",
      "Mr",
      "Mn",
      "No",
      "Fa",
      "Pl",
      "Pt",
      "Ro",
      "Ru",
      "Sk",
      "Sl",
      "Es",
      "Sw",
      "Sv",
      "Ta",
      "Th",
      "Tr",
      "Uk",
      "Ur",
      "Ug",
      "Vi"
    ];
  } else if (provider == "talkscriber") {
    languages = [
      "English",
      "Spanish",
      "En",
      "Zh",
      "De",
      "Es",
      "Ru",
      "Ko",
      "Fr",
      "Ja",
      "Pt",
      "Tr",
      "Pl",
      "Ca",
      "Nl",
      "Ar",
      "Sv",
      "It",
      "Id",
      "Hi",
      "Fi",
      "Vi",
      "He",
      "Uk",
      "El",
      "Ms",
      "Cs",
      "Ro",
      "Da",
      "Hu",
      "Ta",
      "No",
      "Th",
      "Ur",
      "Hr",
      "Bg",
      "Lt",
      "La",
      "Mi",
      "Ml",
      "Cy",
      "Sk",
      "Te",
      "Fa",
      "Lv",
      "Bn",
      "Sr",
      "Az",
      "Sl",
      "Kn",
      "Et",
      "Mk",
      "Br",
      "Eu",
      "Is",
      "Hy",
      "Ne",
      "Mn",
      "Bs",
      "Kk",
      "Sq",
      "Sw",
      "Gl",
      "Mr",
      "Pa",
      "Si",
      "Km",
      "Sn",
      "Yo",
      "So",
      "Af",
      "Oc",
      "Ka",
      "Be",
      "Tg",
      "Sd",
      "Gu",
      "Am",
      "Yi",
      "Lo",
      "Uz",
      "Fo",
      "Ht",
      "Ps",
      "Tk",
      "Nn",
      "Mt",
      "Sa",
      "Lb",
      "My",
      "Bo",
      "Tl",
      "Mg",
      "As",
      "Tt",
      "Haw",
      "Ln",
      "Ha",
      "Ba",
      "Jw",
      "Su",
      "Yue"
    ];
  } else if (provider == "cartesia") {
    languages = [
      "En",
      "Af",
      "Ar",
      "Hy",
      "Az",
      "Be",
      "Bs",
      "Bg",
      "Ca",
      "Zh",
      "Hr",
      "Cs",
      "Da",
      "Nl",
      "Et",
      "Fi",
      "Fr",
      "Gl",
      "De",
      "El",
      "He",
      "Hi",
      "Hu",
      "Is",
      "Id",
      "It",
      "Ja",
      "Kn",
      "Kk",
      "Ko",
      "Lv",
      "Lt",
      "Mk",
      "Ms",
      "Mr",
      "Mi",
      "Ne",
      "No",
      "Fa",
      "Pl",
      "Pt",
      "Ro",
      "Ru",
      "Sr",
      "Sk",
      "Sl",
      "Es",
      "Sw",
      "Sv",
      "Tl",
      "Ta",
      "Th",
      "Tr",
      "Uk",
      "Ur",
      "Vi",
      "Cy"
    ];
  }

  return languages;
}

List<String> getlanguagesforoptions(String provider) {
  List<String> languages = [];

  if (provider == "assembly-ai") {
    languages = ["en"];
  } else if (provider == "azure") {
    languages = [
      "af-ZA",
      "am-ET",
      "ar-AE",
      "ar-BH",
      "ar-DZ",
      "ar-EG",
      "ar-IL",
      "ar-IQ",
      "ar-JO",
      "ar-KW",
      "ar-LB",
      "ar-LY",
      "ar-MA",
      "ar-OM",
      "ar-PS",
      "ar-QA",
      "ar-SA",
      "ar-SY",
      "ar-TN",
      "ar-YE",
      "az-AZ",
      "bg-BG",
      "bn-IN",
      "bs-BA",
      "ca-ES",
      "cs-CZ",
      "cy-GB",
      "da-DK",
      "de-AT",
      "de-CH",
      "de-DE",
      "el-GR",
      "en-AU",
      "en-CA",
      "en-GB",
      "en-GH",
      "en-HK",
      "en-IE",
      "en-IN",
      "en-KE",
      "en-NG",
      "en-NZ",
      "en-PH",
      "en-SG",
      "en-TZ",
      "en-US",
      "en-ZA",
      "es-AR",
      "es-BO",
      "es-CL",
      "es-CO",
      "es-CR",
      "es-CU",
      "es-DO",
      "es-EC",
      "es-ES",
      "es-GQ",
      "es-GT",
      "es-HN",
      "es-MX",
      "es-NI",
      "es-PA",
      "es-PE",
      "es-PR",
      "es-PY",
      "es-SV",
      "es-US",
      "es-UY",
      "es-VE",
      "et-EE",
      "eu-ES",
      "fa-IR",
      "fi-FI",
      "fil-PH",
      "fr-BE",
      "fr-CA",
      "fr-CH",
      "fr-FR",
      "ga-IE",
      "gl-ES",
      "gu-IN",
      "he-IL",
      "hi-IN",
      "hr-HR",
      "hu-HU",
      "hy-AM",
      "id-ID",
      "is-IS",
      "it-CH",
      "it-IT",
      "ja-JP",
      "jv-ID",
      "ka-GE",
      "kk-KZ",
      "km-KH",
      "kn-IN",
      "ko-KR",
      "lo-LA",
      "lt-LT",
      "lv-LV",
      "mk-MK",
      "ml-IN",
      "mn-MN",
      "mr-IN",
      "ms-MY",
      "mt-MT",
      "my-MM",
      "nb-NO",
      "ne-NP",
      "nl-BE",
      "nl-NL",
      "pa-IN",
      "pl-PL",
      "ps-AF",
      "pt-BR",
      "pt-PT",
      "ro-RO",
      "ru-RU",
      "si-LK",
      "sk-SK",
      "sl-SI",
      "so-SO",
      "sq-AL",
      "sr-RS",
      "sv-SE",
      "sw-KE",
      "sw-TZ",
      "ta-IN",
      "te-IN",
      "th-TH",
      "tr-TR",
      "uk-UA",
      "ur-IN",
      "uz-UZ",
      "vi-VN",
      "wuu-CN",
      "yue-CN",
      "zh-CN",
      "zh-CN-shandong",
      "zh-CN-sichuan",
      "zh-HK",
      "zh-TW",
      "zu-ZA"
    ];
  } else if (provider == "deepgram") {
    languages = [
      "bg",
      "ca",
      "cs",
      "da-DK",
      "de",
      "de-CH",
      "el",
      "en",
      "en-AU",
      "en-GB",
      "en-IN",
      "en-NZ",
      "en-US",
      "es",
      "es-419",
      "es-LATAM",
      "et",
      "fi",
      "fr",
      "fr-CA",
      "he",
      "he-IL",  // Hebrew (Israel) - added for better Hebrew support
      "hi",
      "hi-Latn",
      "hu",
      "id",
      "it",
      "ja",
      "ko",
      "ko-KR",
      "lt",
      "lv",
      "ms",
      "multi",
      "nl",
      "nl-BE",
      "no",
      "pl",
      "pt",
      "pt-BR",
      "ro",
      "ru",
      "sk",
      "sv",
      "sv-SE",
      "ta",
      "taq",
      "th",
      "th-TH",
      "tr",
      "uk",
      "vi",
      "zh",
      "zh-CN",
      "zh-Hans",
      "zh-Hant",
      "zh-TW"
    ];
  } else if (provider == "11labs") {
    languages = [
      "aa",
      "ab",
      "ae",
      "af",
      "ak",
      "am",
      "an",
      "ar",
      "as",
      "av",
      "ay",
      "az",
      "ba",
      "be",
      "bg",
      "bh",
      "bi",
      "bm",
      "bn",
      "bo",
      "br",
      "bs",
      "ca",
      "ce",
      "ch",
      "co",
      "cr",
      "cs",
      "cu",
      "cv",
      "cy",
      "da",
      "de",
      "dv",
      "dz",
      "ee",
      "el",
      "en",
      "eo",
      "es",
      "et",
      "eu",
      "fa",
      "ff",
      "fi",
      "fj",
      "fo",
      "fr",
      "fy",
      "ga",
      "gd",
      "gl",
      "gn",
      "gu",
      "gv",
      "ha",
      "he",
      "hi",
      "ho",
      "hr",
      "ht",
      "hu",
      "hy",
      "hz",
      "ia",
      "id",
      "ie",
      "ig",
      "ii",
      "ik",
      "io",
      "is",
      "it",
      "iu",
      "ja",
      "jv",
      "ka",
      "kg",
      "ki",
      "kj",
      "kk",
      "kl",
      "km",
      "kn",
      "ko",
      "kr",
      "ks",
      "ku",
      "kv",
      "kw",
      "ky",
      "la",
      "lb",
      "lg",
      "li",
      "ln",
      "lo",
      "lt",
      "lu",
      "lv",
      "mg",
      "mh",
      "mi",
      "mk",
      "ml",
      "mn",
      "mr",
      "ms",
      "mt",
      "my",
      "na",
      "nb",
      "nd",
      "ne",
      "ng",
      "nl",
      "nn",
      "no",
      "nr",
      "nv",
      "ny",
      "oc",
      "oj",
      "om",
      "or",
      "os",
      "pa",
      "pi",
      "pl",
      "ps",
      "pt",
      "qu",
      "rm",
      "rn",
      "ro",
      "ru",
      "rw",
      "sa",
      "sc",
      "sd",
      "se",
      "sg",
      "si",
      "sk",
      "sl",
      "sm",
      "sn",
      "so",
      "sq",
      "sr",
      "ss",
      "st",
      "su",
      "sv",
      "sw",
      "ta",
      "te",
      "th",
      "ti",
      "tk",
      "tl",
      "tr",
      "ts",
      "tt",
      "ug",
      "uk",
      "ur",
      "uz",
      "vi",
      "vo",
      "wa",
      "xh",
      "yi",
      "yo",
      "za",
      "zh",
      "zu"
    ];
  } else if (provider == "gladia") {
    languages = [
      "af",
      "sq",
      "am",
      "ar",
      "hy",
      "as",
      "az",
      "ba",
      "eu",
      "be",
      "bn",
      "bs",
      "br",
      "bg",
      "ca",
      "zh",
      "hr",
      "cs",
      "da",
      "nl",
      "en",
      "et",
      "fo",
      "fi",
      "fr",
      "gl",
      "ka",
      "de",
      "el",
      "gu",
      "ht",
      "ha",
      "haw",
      "he",
      "hi",
      "hu",
      "is",
      "id",
      "it",
      "ja",
      "jv",
      "kn",
      "kk",
      "km",
      "ko",
      "lo",
      "la",
      "lv",
      "ln",
      "lt",
      "lb",
      "mk",
      "mg",
      "ms",
      "ml",
      "mt",
      "mi",
      "mr",
      "mn",
      "my",
      "ne",
      "no",
      "nn",
      "oc",
      "ps",
      "fa",
      "pl",
      "pt",
      "pa",
      "ro",
      "ru",
      "sa",
      "sr",
      "sn",
      "sd",
      "si",
      "sk",
      "sl",
      "so",
      "es",
      "su",
      "sw",
      "sv",
      "tl",
      "tg",
      "ta",
      "tt",
      "te",
      "th",
      "bo",
      "tr",
      "tk",
      "uk",
      "ur",
      "uz",
      "vi",
      "cy",
      "yi",
      "yo"
    ];
  } else if (provider == "google") {
    languages = [
      "Multilingual",
      "Arabic",
      "Bengali",
      "Bulgarian",
      "Chinese",
      "Croatian",
      "Czech",
      "Danish",
      "Dutch",
      "English",
      "Estonian",
      "Finnish",
      "French",
      "German",
      "Greek",
      "Hebrew",
      "Hindi",
      "Hungarian",
      "Indonesian",
      "Italian",
      "Japanese",
      "Korean",
      "Latvian",
      "Lithuanian",
      "Norwegian",
      "Polish",
      "Portuguese",
      "Romanian",
      "Russian",
      "Serbian",
      "Slovak",
      "Slovenian",
      "Spanish",
      "Swahili",
      "Swedish",
      "Thai",
      "Turkish",
      "Ukrainian",
      "Vietnamese"
    ];
  } else if (provider == "openai") {
    languages = [
      "af",
      "ar",
      "hy",
      "az",
      "be",
      "bs",
      "bg",
      "ca",
      "zh",
      "hr",
      "cs",
      "da",
      "nl",
      "et",
      "fi",
      "fr",
      "gl",
      "de",
      "el",
      "he",
      "hi",
      "hu",
      "is",
      "id",
      "it",
      "ja",
      "kn",
      "kk",
      "ko",
      "lv",
      "lt",
      "mk",
      "ms",
      "mr",
      "mi",
      "ne",
      "no",
      "fa",
      "pl",
      "pt",
      "ro",
      "ru",
      "sr",
      "sk",
      "sl",
      "es",
      "sw",
      "sv",
      "tl",
      "ta",
      "th",
      "tr",
      "uk",
      "ur",
      "vi",
      "cy"
    ];
  } else if (provider == "speechmaticsa") {
    languages = [
      "auto",
      "ar",
      "ba",
      "eu",
      "be",
      "bn",
      "bg",
      "yue",
      "ca",
      "hr",
      "cs",
      "da",
      "nl",
      "en",
      "eo",
      "et",
      "fi",
      "fr",
      "gl",
      "de",
      "el",
      "he",
      "hi",
      "hu",
      "id",
      "ia",
      "ga",
      "it",
      "ja",
      "ko",
      "lv",
      "lt",
      "ms",
      "mt",
      "cmn",
      "mr",
      "mn",
      "no",
      "fa",
      "pl",
      "pt",
      "ro",
      "ru",
      "sk",
      "sl",
      "es",
      "sw",
      "sv",
      "ta",
      "th",
      "tr",
      "uk",
      "ur",
      "ug",
      "vi",
      "cy"
    ];
  } else if (provider == "talkscriber") {
    languages = [
      "en",
      "zh",
      "de",
      "es",
      "ru",
      "ko",
      "fr",
      "ja",
      "pt",
      "tr",
      "pl",
      "ca",
      "nl",
      "ar",
      "sv",
      "it",
      "id",
      "hi",
      "fi",
      "vi",
      "he",
      "uk",
      "el",
      "ms",
      "cs",
      "ro",
      "da",
      "hu",
      "ta",
      "no",
      "th",
      "ur",
      "hr",
      "bg",
      "lt",
      "la",
      "mi",
      "ml",
      "cy",
      "sk",
      "te",
      "fa",
      "lv",
      "bn",
      "sr",
      "az",
      "sl",
      "kn",
      "et",
      "mk",
      "br",
      "eu",
      "is",
      "hy",
      "ne",
      "mn",
      "bs",
      "kk",
      "sq",
      "sw",
      "gl",
      "mr",
      "pa",
      "si",
      "km",
      "sn",
      "yo",
      "so",
      "af",
      "oc",
      "ka",
      "be",
      "tg",
      "sd",
      "gu",
      "am",
      "yi",
      "lo",
      "uz",
      "fo",
      "ht",
      "ps",
      "tk",
      "nn",
      "mt",
      "sa",
      "lb",
      "my",
      "bo",
      "tl",
      "mg",
      "as",
      "tt",
      "haw",
      "ln",
      "ha",
      "ba",
      "jw",
      "su",
      "yue"
    ];
  } else if (provider == "cartesia") {
    languages = [
      "aa",
      "ab",
      "ae",
      "af",
      "ak",
      "am",
      "an",
      "ar",
      "as",
      "av",
      "ay",
      "az",
      "ba",
      "be",
      "bg",
      "bh",
      "bi",
      "bm",
      "bn",
      "bo",
      "br",
      "bs",
      "ca",
      "ce",
      "ch",
      "co",
      "cr",
      "cs",
      "cu",
      "cv",
      "cy",
      "da",
      "de",
      "dv",
      "dz",
      "ee",
      "el",
      "en",
      "eo",
      "es",
      "et",
      "eu",
      "fa",
      "ff",
      "fi",
      "fj",
      "fo",
      "fr",
      "fy",
      "ga",
      "gd",
      "gl",
      "gn",
      "gu",
      "gv",
      "ha",
      "he",
      "hi",
      "ho",
      "hr",
      "ht",
      "hu",
      "hy",
      "hz",
      "ia",
      "id",
      "ie",
      "ig",
      "ii",
      "ik",
      "io",
      "is",
      "it",
      "iu",
      "ja",
      "jv",
      "ka",
      "kg",
      "ki",
      "kj",
      "kk",
      "kl",
      "km",
      "kn",
      "ko",
      "kr",
      "ks",
      "ku",
      "kv",
      "kw",
      "ky",
      "la",
      "lb",
      "lg",
      "li",
      "ln",
      "lo",
      "lt",
      "lu",
      "lv",
      "mg",
      "mh",
      "mi",
      "mk",
      "ml",
      "mn",
      "mr",
      "ms",
      "mt",
      "my",
      "na",
      "nb",
      "nd",
      "ne",
      "ng",
      "nl",
      "nn",
      "no",
      "nr",
      "nv",
      "ny",
      "oc",
      "oj",
      "om",
      "or",
      "os",
      "pa",
      "pi",
      "pl",
      "ps",
      "pt",
      "qu",
      "rm",
      "rn",
      "ro",
      "ru",
      "rw",
      "sa",
      "sc",
      "sd",
      "se",
      "sg",
      "si",
      "sk",
      "sl",
      "sm",
      "sn",
      "so",
      "sq",
      "sr",
      "ss",
      "st",
      "su",
      "sv",
      "sw",
      "ta",
      "te",
      "th",
      "ti",
      "tk",
      "tl",
      "tr",
      "ts",
      "tt",
      "ug",
      "uk",
      "ur",
      "uz",
      "vi",
      "vo",
      "wa",
      "xh",
      "yi",
      "yo",
      "za",
      "zh",
      "zu"
    ];
  }

  return languages;
}

List<String> getmodelfor(String provider) {
  List<String> models = [];
  if (provider == "assembly-ai") {
    models = [];
  } else if (provider == "azure") {
    models = [];
  } else if (provider == "deepgram") {
    models = [
      "Nova 3",
      "Nova 3 General",
      "Nova 3 Medical",
      "Nova 2",
      "Nova 2 General",
      "Nova 2 Meeting",
      "Nova 2 Phonecall",
      "Nova 2 Finance",
      "Nova 2 Conversational AI",
      "Nova 2 Voicemail",
      "Nova 2 Video",
      "Nova 2 Medical",
      "Nova 2 Drive Thru",
      "Nova 2 Automotive",
      "Nova",
      "Nova General",
      "Nova Phonecall",
      "Nova Medical",
      "Enhanced",
      "Enhanced General",
      "Enhanced Meeting",
      "Enhanced Phonecall",
      "Enhanced Finance",
      "Base",
      "Base General",
      "Base Meeting",
      "Base Phonecall",
      "Base Finance",
      "Base ConversationalAI",
      "Base Voicemail",
      "Base Video"
    ];
  } else if (provider == "11labs") {
    models = ["Scribe"];
  } else if (provider == "gladia") {
    models = ["Fast", "Accurate", "Solaria"];
  } else if (provider == "google") {
    models = [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-thinking-exp",
      "gemini-2.0-pro-exp-02-05",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash-realtime-exp",
      "gemini-1.5-flash",
      "gemini-1.5-flash-002",
      "gemini-1.5-pro",
      "gemini-1.5-pro-002",
      "gemini-1.0-pro",
    ];
  } else if (provider == "openai") {
    models = ["GPT-4o Transcribe", "GPT-4o Mini Transcribe"];
  } else if (provider == "speechmaticsa") {
    models = ["Default"];
  } else if (provider == "talkscriber") {
    models = ["Whisper"];
  } else if (provider == "cartesia") {
    models = [
      "Ink Whisper",
    ];
  }

  return models;
}

List<String> modelforvoices(String provider) {
  List<String> models = [];
  if (provider == "vapi") {
    models = [];
  } else if (provider == "cartesia") {
    models = [
      "sonic-2",
      "sonic-english",
      "sonic-multilingual",
      "sonic-preview",
      "sonic"
    ];
  } else if (provider == "11labs") {
    models = [
      "eleven_flash_v2_5",       // Hebrew + low latency - RECOMMENDED
      "eleven_flash_v2",         // Hebrew + low latency
      "eleven_multilingual_v2",  // Hebrew - highest quality, slower
      "eleven_turbo_v2_5",       // English only - fastest
      "eleven_turbo_v2",         // English only
      "eleven_monolingual_v1"    // English only
    ];
  } else if (provider == "rime-ai") {
    models = ["arcana", "mistv2", "mist"];
  } else if (provider == "lmnt") {
    models = [];
  } else if (provider == "deepgram") {
    models = [
      "aura",
      "aura-2",
    ];
  } else if (provider == "openai") {
    models = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"];
  } else if (provider == "azure") {
    models = [];
  } else if (provider == "neuphonic") {
    models = ["neu_hq", "neu_fast"];
  } else if (provider == "smallest-ai") {
    models = [
      "lightning",
    ];
  } else if (provider == "hume") {
    models = [
      "octave",
    ];
  }

  return models;
}

List<String> modelforvoicesoption(String provider) {
  List<String> models = [];
  if (provider == "vapi") {
    models = [];
  } else if (provider == "cartesia") {
    models = [
      "sonic-2",
      "sonic-english",
      "sonic-multilingual",
      "sonic-preview",
      "sonic"
    ];
  } else if (provider == "11labs") {
    models = [
      "Flash v2.5 (Hebrew, Fast ⚡)",      // Hebrew + low latency - RECOMMENDED
      "Flash v2 (Hebrew)",                   // Hebrew + low latency
      "Multilingual v2 (Hebrew, Best Quality)", // Hebrew - highest quality, slower
      "Turbo v2.5 (English Only)",           // English only - fastest
      "Turbo v2 (English Only)",             // English only
      "Monolingual v1 (English Only)"        // English only
    ];
  } else if (provider == "rime-ai") {
    models = ["arcana", "mistv2", "mist"];
  } else if (provider == "lmnt") {
    models = [];
  } else if (provider == "deepgram") {
    models = [
      "aura",
      "aura-2",
    ];
  } else if (provider == "openai") {
    models = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"];
  } else if (provider == "azure") {
    models = [];
  } else if (provider == "neuphonic") {
    models = ["neu_hq", "neu_fast"];
  } else if (provider == "smallest-ai") {
    models = [
      "lightning",
    ];
  } else if (provider == "hume") {
    models = [
      "octave",
    ];
  }

  return models;
}

List<String> getmodelforoption(String provider) {
  List<String> models = [];
  if (provider == "assembly-ai") {
    models = [];
  } else if (provider == "azure") {
    models = [];
  } else if (provider == "deepgram") {
    models = [
      "nova-3",
      "nova-3-general",
      "nova-3-medical",
      "nova-2",
      "nova-2-general",
      "nova-2-meeting",
      "nova-2-phonecall",
      "nova-2-finance",
      "nova-2-conversationalai",
      "nova-2-voicemail",
      "nova-2-video",
      "nova-2-medical",
      "nova-2-drivethru",
      "nova-2-automotive",
      "nova",
      "nova-general",
      "nova-phonecall",
      "nova-medical",
      "enhanced",
      "enhanced-general",
      "enhanced-meeting",
      "enhanced-phonecall",
      "enhanced-finance",
      "base",
      "base-general",
      "base-meeting",
      "base-phonecall",
      "base-finance",
      "base-conversationalai",
      "base-voicemail",
      "base-video"
    ];
  } else if (provider == "11labs") {
    models = ["scribe_v1"];
  } else if (provider == "gladia") {
    models = ["fast", "accurate", "solaria-1"];
  } else if (provider == "google") {
    models = [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-thinking-exp",
      "gemini-2.0-pro-exp-02-05",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash-realtime-exp",
      "gemini-1.5-flash",
      "gemini-1.5-flash-002",
      "gemini-1.5-pro",
      "gemini-1.5-pro-002",
      "gemini-1.0-pro"
    ];
  } else if (provider == "openai") {
    models = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe"];
  } else if (provider == "speechmaticsa") {
    models = ["default"];
  } else if (provider == "talkscriber") {
    models = ["whisper"];
  } else if (provider == "cartesia") {
    models = ["ink-whisper"];
  }

  return models;
}

List<String> voiceforlabel(String provider) {
  List<String> voice = [];
  if (provider == "vapi") {
    voice = [
      "Elliot",
      "Kylie",
      "Rohan",
      "Lily",
      "Savannah",
      "Hana",
      "Neha",
      "Cole",
      "Harry",
      "Paige",
      "Spencer"
    ];
  } else if (provider == "cartesia") {
    voice = [];
  } else if (provider == "11labs") {
    voice = [
      // Hebrew-supporting voices (multilingual) - prioritized
      "Rachel (Hebrew)",
      "Adam (Hebrew)",
      "Antoni (Hebrew)",
      "Bella (Hebrew)",
      "Josh (Hebrew)",
      "Arnold (Hebrew)",
      "Sam (Hebrew)",
      "Elli (Hebrew)",
      // Additional voices
      "Burt",
      "Marissa",
      "Andrea",
      "Sarah",
      "Phillip",
      "Steve",
      "Joseph",
      "Myra",
      "Paula",
      "Ryan",
      "Drew",
      "Paul",
      "MrB",
      "Matilda",
      "Mark",
    ];
  } else if (provider == "rime-ai") {
    voice = [
      "abbie",
      "allison",
      "ally",
      "alona",
      "amber",
      "ana",
      "antoine",
      "armon",
      "brenda",
      "brittany",
      "carol",
      "colin",
      "courtney",
      "elena",
      "elliot",
      "eva",
      "geoff",
      "gerald",
      "hank",
      "helen",
      "hera",
      "jen",
      "joe",
      "joy",
      "juan",
      "kendra",
      "kendrick",
      "kenneth",
      "kevin",
      "kris",
      "linda",
      "madison",
      "marge",
      "marina",
      "marissa",
      "marta",
      "maya",
      "nicholas",
      "nyles",
      "phil",
      "reba",
      "rex",
      "rick",
      "ritu",
      "rob",
      "rodney",
      "rohan",
      "rosco",
      "samantha",
      "sandy",
      "selena",
      "seth",
      "sharon",
      "stan",
      "tamra",
      "tanya",
      "tibur",
      "tj",
      "tyler",
      "viv",
      "yadira",
      "marsh",
      "bayou",
      "creek",
      "brook",
      "flower",
      "spore",
      "glacier",
      "gulch",
      "alpine",
      "cove",
      "lagoon",
      "tundra",
      "steppe",
      "mesa",
      "grove",
      "rainforest",
      "moraine",
      "wildflower",
      "peak",
      "boulder",
      "gypsum",
      "zest",
      "luna",
      "celeste",
      "orion",
      "ursa",
      "astra",
      "esther",
      "estelle",
      "andromeda"
    ];
  } else if (provider == "lmnt") {
    voice = [
      "amy",
      "ansel",
      "autumn",
      "ava",
      "brandon",
      "caleb",
      "cassian",
      "chloe",
      "dalton",
      "daniel",
      "dustin",
      "elowen",
      "evander",
      "huxley",
      "james",
      "juniper",
      "kennedy",
      "lauren",
      "leah",
      "lily",
      "lucas",
      "magnus",
      "miles",
      "morgan",
      "natalie",
      "nathan",
      "noah",
      "nyssa",
      "oliver",
      "paige",
      "ryan",
      "sadie",
      "sophie",
      "stella",
      "terrence",
      "tyler",
      "vesper",
      "violet",
      "warrick",
      "zain",
      "zeke",
      "zoe"
    ];
  } else if (provider == "deepgram") {
    voice = [
      "asteria",
      "luna",
      "stella",
      "athena",
      "hera",
      "orion",
      "arcas",
      "perseus",
      "angus",
      "orpheus",
      "helios",
      "zeus",
      "thalia",
      "andromeda",
      "helena",
      "apollo",
      "arcas",
      "aries",
      "amalthea",
      "asteria",
      "athena",
      "atlas",
      "aurora",
      "callista",
      "cora",
      "cordelia",
      "delia",
      "draco",
      "electra",
      "harmonia",
      "hera",
      "hermes",
      "hyperion",
      "iris",
      "janus",
      "juno",
      "jupiter",
      "luna",
      "mars",
      "minerva",
      "neptune",
      "odysseus",
      "ophelia",
      "orion",
      "orpheus",
      "pandora",
      "phoebe",
      "pluto",
      "saturn",
      "selene",
      "theia",
      "vesta",
      "zeus"
    ];
  } else if (provider == "openai") {
    voice = [
      "alloy",
      "echo",
      "fable",
      "onyx",
      "nova",
      "shimmer",
      "marin",
      "cedar"
    ];
  } else if (provider == "azure") {
    voice = ["andrew", "brian", "emma"];
  } else if (provider == "neuphonic") {
    voice = [];
  } else if (provider == "smallest-ai") {
    voice = [
      "emily",
      "jasmine",
      "arman",
      "james",
      "mithali",
      "aravind",
      "raj",
      "diya",
      "raman",
      "ananya",
      "isha",
      "william",
      "aarav",
      "monika",
      "niharika",
      "deepika",
      "raghav",
      "kajal",
      "radhika",
      "mansi",
      "nisha",
      "saurabh",
      "pooja",
      "saina",
      "sanya"
    ];
  } else if (provider == "hume") {
    voice = [];
  }

  return voice;
}

List<String> voiceforlabelvalue(String provider) {
  List<String> voice = [];
  if (provider == "vapi") {
    voice = [
      "Elliot",
      "Kylie",
      "Rohan",
      "Lily",
      "Savannah",
      "Hana",
      "Neha",
      "Cole",
      "Harry",
      "Paige",
      "Spencer"
    ];
  } else if (provider == "cartesia") {
    voice = [];
  } else if (provider == "11labs") {
    voice = [
      // Hebrew-supporting voices (multilingual) - prioritized
      "rachel",
      "adam",
      "antoni",
      "bella",
      "josh",
      "arnold",
      "sam",
      "elli",
      // Additional voices
      "burt",
      "marissa",
      "andrea",
      "sarah",
      "phillip",
      "steve",
      "joseph",
      "myra",
      "paula",
      "ryan",
      "drew",
      "paul",
      "mrb",
      "matilda",
      "mark",
    ];
  } else if (provider == "rime-ai") {
    voice = [
      "abbie",
      "allison",
      "ally",
      "alona",
      "amber",
      "ana",
      "antoine",
      "armon",
      "brenda",
      "brittany",
      "carol",
      "colin",
      "courtney",
      "elena",
      "elliot",
      "eva",
      "geoff",
      "gerald",
      "hank",
      "helen",
      "hera",
      "jen",
      "joe",
      "joy",
      "juan",
      "kendra",
      "kendrick",
      "kenneth",
      "kevin",
      "kris",
      "linda",
      "madison",
      "marge",
      "marina",
      "marissa",
      "marta",
      "maya",
      "nicholas",
      "nyles",
      "phil",
      "reba",
      "rex",
      "rick",
      "ritu",
      "rob",
      "rodney",
      "rohan",
      "rosco",
      "samantha",
      "sandy",
      "selena",
      "seth",
      "sharon",
      "stan",
      "tamra",
      "tanya",
      "tibur",
      "tj",
      "tyler",
      "viv",
      "yadira",
      "marsh",
      "bayou",
      "creek",
      "brook",
      "flower",
      "spore",
      "glacier",
      "gulch",
      "alpine",
      "cove",
      "lagoon",
      "tundra",
      "steppe",
      "mesa",
      "grove",
      "rainforest",
      "moraine",
      "wildflower",
      "peak",
      "boulder",
      "gypsum",
      "zest",
      "luna",
      "celeste",
      "orion",
      "ursa",
      "astra",
      "esther",
      "estelle",
      "andromeda"
    ];
  } else if (provider == "lmnt") {
    voice = [
      "amy",
      "ansel",
      "autumn",
      "ava",
      "brandon",
      "caleb",
      "cassian",
      "chloe",
      "dalton",
      "daniel",
      "dustin",
      "elowen",
      "evander",
      "huxley",
      "james",
      "juniper",
      "kennedy",
      "lauren",
      "leah",
      "lily",
      "lucas",
      "magnus",
      "miles",
      "morgan",
      "natalie",
      "nathan",
      "noah",
      "nyssa",
      "oliver",
      "paige",
      "ryan",
      "sadie",
      "sophie",
      "stella",
      "terrence",
      "tyler",
      "vesper",
      "violet",
      "warrick",
      "zain",
      "zeke",
      "zoe"
    ];
  } else if (provider == "deepgram") {
    voice = [
      "asteria",
      "luna",
      "stella",
      "athena",
      "hera",
      "orion",
      "arcas",
      "perseus",
      "angus",
      "orpheus",
      "helios",
      "zeus",
      "thalia",
      "andromeda",
      "helena",
      "apollo",
      "arcas",
      "aries",
      "amalthea",
      "asteria",
      "athena",
      "atlas",
      "aurora",
      "callista",
      "cora",
      "cordelia",
      "delia",
      "draco",
      "electra",
      "harmonia",
      "hera",
      "hermes",
      "hyperion",
      "iris",
      "janus",
      "juno",
      "jupiter",
      "luna",
      "mars",
      "minerva",
      "neptune",
      "odysseus",
      "ophelia",
      "orion",
      "orpheus",
      "pandora",
      "phoebe",
      "pluto",
      "saturn",
      "selene",
      "theia",
      "vesta",
      "zeus"
    ];
  } else if (provider == "openai") {
    voice = [
      "alloy",
      "echo",
      "fable",
      "onyx",
      "nova",
      "shimmer",
      "marin",
      "cedar"
    ];
  } else if (provider == "azure") {
    voice = ["andrew", "brian", "emma"];
  } else if (provider == "neuphonic") {
    voice = [];
  } else if (provider == "smallest-ai") {
    voice = [
      "emily",
      "jasmine",
      "arman",
      "james",
      "mithali",
      "aravind",
      "raj",
      "diya",
      "raman",
      "ananya",
      "isha",
      "william",
      "aarav",
      "monika",
      "niharika",
      "deepika",
      "raghav",
      "kajal",
      "radhika",
      "mansi",
      "nisha",
      "saurabh",
      "pooja",
      "saina",
      "sanya"
    ];
  } else if (provider == "hume") {
    voice = [];
  }

  return voice;
}

List<String>? providerLabels() {
  return [
    'Assembly AI',
    'Azure',
    'Deepgram',
    '11labs',
    'Gladia',
    'Google',
    'OpenAI',
    'Speechmatics',
    'Talkscriber',
    'Cartesia'
  ];
}

List<String>? providervalues() {
  return [
    'assembly-ai',
    'azure',
    'deepgram',
    '11labs',
    'gladia',
    'google',
    'openai',
    'speechmaticsa',
    'talkscriber',
    'cartesia'
  ];
}

/// Returns the recommended configuration for high-quality Hebrew phone bots.
/// Includes best TTS provider/voice/model and best STT provider for Hebrew.
Map<String, String> getHebrewRecommendedConfig() {
  return {
    // TTS (Text-to-Speech) - best Hebrew quality
    'ttsProvider': '11labs',
    'ttsModel': 'eleven_multilingual_v2',
    'ttsVoice': 'rachel',
    'ttsVoiceLabel': 'Rachel (Hebrew)',
    // Alternative: Google Cloud TTS via Twilio
    'ttsProviderAlt': 'google',
    'ttsVoiceAlt': 'Google.he-IL-Wavenet-A',
    'ttsVoiceLabelAlt': 'Google Wavenet Female A (Hebrew)',
    // STT (Speech-to-Text) - best Hebrew quality
    'sttProvider': 'google',
    'sttLanguage': 'he-IL',
    // Alternative STT
    'sttProviderAlt': 'azure',
    'sttLanguageAlt': 'he-IL',
    // Language
    'languageCode': 'he',
    'languageLocale': 'he-IL',
  };
}

/// Checks whether a given STT provider supports Hebrew.
/// Returns false for providers known to NOT support Hebrew.
/// Note: Deepgram DOES support Hebrew (he, he-IL) - updated 2025
bool isProviderHebrewSupported(String provider) {
  const unsupportedForHebrew = [
    'assembly-ai',  // Does not support Hebrew
    // Deepgram removed - it DOES support Hebrew
  ];
  return !unsupportedForHebrew.contains(provider.toLowerCase());
}

/// Returns the list of Google Hebrew Wavenet voices available via Twilio <Say>.
List<String> googleHebrewVoiceLabels() {
  return [
    'Google Wavenet Female A (Hebrew)',
    'Google Wavenet Male B (Hebrew)',
    'Google Wavenet Female C (Hebrew)',
    'Google Wavenet Male D (Hebrew)',
  ];
}

/// Returns the corresponding voice IDs for Google Hebrew Wavenet voices.
List<String> googleHebrewVoiceValues() {
  return [
    'Google.he-IL-Wavenet-A',
    'Google.he-IL-Wavenet-B',
    'Google.he-IL-Wavenet-C',
    'Google.he-IL-Wavenet-D',
  ];
}