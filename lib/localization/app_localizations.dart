import 'package:flutter/material.dart';

class AppLocalizations {
  AppLocalizations(this.locale);

  final Locale locale;

  static const supportedLanguageCodes = ['en', 'he'];

  static const supportedLocales = [
    Locale('en'),
    Locale('he'),
  ];

  static const rtlLanguages = {'he'};

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static bool isSupported(Locale locale) =>
      supportedLanguageCodes.contains(locale.languageCode);

  static bool isRTLLocale(Locale locale) =>
      rtlLanguages.contains(locale.languageCode.toLowerCase());

  static TextDirection effectiveTextDirection(Locale locale) =>
      isRTLLocale(locale) ? TextDirection.rtl : TextDirection.ltr;

  final Map<String, String> _hebrewTranslations = {
    'VoiceFlow AI': 'VoiceFlow AI',
    'Dashboard': 'לוח בקרה',
    'Good Evening, ': 'ערב טוב, ',
    'Dispatch': 'מרכז שליטה',
    'Calls': 'שיחות',
    'Bookings': 'הזמנות',
    'Invoices': 'חשבוניות',
    'Professionals': 'אנשי מקצוע',
    'Settings': 'הגדרות',
    'Help': 'עזרה',
    'Logout': 'התנתקות',
    'Login': 'התחברות',
    'Email': 'אימייל',
    'Password': 'סיסמה',
    'Forgot Password?': 'שכחת סיסמה?',
    'Sign Up': 'הרשמה',
    'Remember me': 'זכור אותי',
    'Search': 'חיפוש',
    'Search calls...': 'חפש שיחות...',
    'Monitor and review technician-client communications':
        'נטר ובחן את התקשורת בין הטכנאי ללקוח',
    'All Technicians': 'כל הטכנאים',
    'Tech Call Monitoring': 'מעקב שיחות טכנאים',
    'Create Booking': 'צור הזמנה',
    'Agents': 'סוכנים',
    'AI Dispatch': 'Dispatch מבוסס AI',
    'Lead Capture': 'לכידת לידים',
    'Leads': 'לידים',
    'Call Blaster': 'חייגן המוני',
    'Phone Numbers': 'מספרי טלפון',
    'Profile': 'פרופיל',
    'Change Password': 'שנה סיסמה',
    'Edit Profile': 'ערוך פרופיל',
    'Feature Request': 'בקשת פיצ\'ר',
    'Billing': 'חיוב',
    'Language': 'שפה',
    'English': 'אנגלית',
    'Hebrew': 'עברית',
    'Switch to Hebrew': 'החלף לעברית',
    'OK': 'אישור',
    'Ok': 'אישור',
    'Unable to initiate the call.': 'לא ניתן היה להתחיל את השיחה.',
    'Failed to place call. {details}': 'החיוג נכשל. {details}',
    'Company information not found. Please contact support.':
        'פרטי החברה לא נמצאו. אנא פנה לתמיכה.',
    'No company phone number found. Please add a phone number first.':
        'לא נמצא מספר טלפון לחברה. אנא הוסף מספר טלפון תחילה.',
    'Sorry no company information exists': 'מצטערים, אין מידע על החברה.',
    'Sorry company information doesn\'t exist':
        'מצטערים, מידע על החברה אינו קיים.',
    'Sorry, your company information doesn\'t exist. Please set your company information.':
        'מצטערים, מידע החברה שלך אינו קיים. אנא הגדר את פרטי החברה.',
    'Please enter a password; the field is empty.':
        'אנא הזן סיסמה; השדה ריק.',
    'Failed to update assistant. {details}': 'עדכון העוזר נכשל. {details}',
    'Failed to create assistant. {details}': 'יצירת העוזר נכשלה. {details}',
    'Failed to delete assistant. {details}': 'מחיקת העוזר נכשלה. {details}',
    'Failed to place call.': 'החיוג נכשל.',
    'Switch to English': 'החלף לאנגלית',
    'Assistant deleted successfully': 'העוזר נמחק בהצלחה',
    'Error': 'שגיאה',
    'Call Successfull': 'התקשרות הצליחה',
    'Invalid Action': 'פעולה לא תקינה',
    'Call Failed': 'התקשרות נכשלה',
    'Success': 'הצלחה',
    'Failed': 'נכשל',
    'Cancel': 'ביטול',
    'Confirm': 'אישור',
    'New Agent': 'סוכן חדש',
    'Create New': 'צור חדש',
    'Upload CSV': 'העלה קובץ CSV',
    'Add Lead': 'הוסף ליד',
    'Log Out': 'התנתק',
    'Update': 'עדכן',
    'Create': 'צור',
    'Place Call': 'הוצא שיחה',
    'Edit profile': 'ערוך פרופיל',
    'Change password': 'שנה סיסמה',
    'Add New': 'הוסף חדש',
    'Generate Code': 'צור קוד',
    'Save': 'שמור',
    'Apply': 'החל',
    'Create Phone Number': 'צור מספר טלפון',
    'Go to Dashboard': 'עבור ללוח הבקרה',
    'Back': 'חזור',
    'Continue to Dashboard': 'המשך ללוח הבקרה',
    'Select Plan': 'בחר תוכנית',
    'Contact Sales': 'צור קשר עם המכירות',
    'Skip': 'דלג',
    'Test Connection': 'בדוק חיבור',
    'Greeting': 'ברכת פתיחה',
    'Lead Sources': 'מקורות לידים',
    'Services': 'שירותים',
    'permissions': 'הרשאות',
    'Restrictions': 'הגבלות',
    'Personalization': 'התאמה אישית',
    'Back to Greeting': 'חזרה לברכת הפתיחה',
    'Continue to Services': 'המשך לשירותים',
    'Back to Permissions': 'חזרה להרשאות',
    'Continue to FAQs': 'המשך לשאלות הנפוצות',
    'Continue to SMTP': 'המשך ל-SMTP',
    'Add Service': 'הוסף שירות',
    'Continue': 'המשך',
    'Continue to Business Info': 'המשך למידע העסקי',
    'Call Lead': 'התקשר לליד',
    'Send Email': 'שלח אימייל',
    'Select a CSV file to Import': 'בחר קובץ CSV לייבוא',
    'Done': 'סיום',
    'New Invoice': 'חשבונית חדשה',
    'Due:': 'תאריך יעד:',
    'Call Logs': 'יומן שיחות',
    'Assistants': 'עוזרים',
    'Lead Management': 'ניהול לידים',
    'Lead': 'ליד',
    'Billing Overview': 'סקירת חיוב',
    'Call Route': 'ניתוב שיחות',
    'Phone Number': 'מספר טלפון',
    'Agent': 'סוכן',
    'Api Connection': 'חיבור API',
    'Ai Training': 'אימון AI',
    'Manage Subscription': 'נהל מנוי',
    'Overview': 'סקירה',
    'View Details': 'הצג פרטים',
    'Nothing to show here': 'אין מה להציג כאן',
    'Email Connections': 'חיבורי אימייל',
    'Outgoing Call Workflows': 'תהליכי שיחות יוצאות',
    'Last checked:': 'בדיקה אחרונה:',
    'Add Workflow': 'הוסף תהליך',
    'Add': 'הוסף',
    'Professionals Overview': 'סקירת אנשי מקצוע',
    'Password reset email sent': 'נשלח אימייל לאיפוס סיסמה',
    'Invalid file format: {type}': 'סוג קובץ לא תקין: {type}',
    'No technicians found.': 'לא נמצאו טכנאים.',
    'Error: {message}': 'שגיאה: {message}',
    'Call route saved successfully': 'נתיב השיחות נשמר בהצלחה',
    'Call route update failed': 'עדכון נתיב השיחות נכשל',
    'Assistant updated successfully': 'העוזר עודכן בהצלחה',
    'Assistant update failed': 'עדכון העוזר נכשל',
    'Assistant created successfully': 'העוזר נוצר בהצלחה',
    'Assistant creation failed': 'יצירת העוזר נכשלה',
    'Lead uploaded successfully': 'הליד הועלה בהצלחה',
    'Lead upload failed': 'העלאת הליד נכשלה',
    'Profile updated successfully': 'הפרופיל עודכן בהצלחה',
    'Profile update failed': 'עדכון הפרופיל נכשל',
  };

  String translate(String value, {Map<String, String>? params}) {
    var result = locale.languageCode == 'he'
        ? _hebrewTranslations[value] ?? value
        : value;
    if (params != null && params.isNotEmpty) {
      params.forEach((key, replacement) {
        result = result.replaceAll('{$key}', replacement);
      });
    }
    return result;
  }
}

class AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => AppLocalizations.isSupported(locale);

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(covariant LocalizationsDelegate<AppLocalizations> old) =>
      false;
}

