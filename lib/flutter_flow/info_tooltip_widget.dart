import 'package:flutter/material.dart';
import 'flutter_flow_theme.dart';

/// A reusable info tooltip widget that shows an (i) icon
/// and displays a tooltip with explanation on hover
class InfoTooltip extends StatelessWidget {
  final String message;
  final double iconSize;
  final Color? iconColor;
  final EdgeInsetsGeometry? padding;

  const InfoTooltip({
    super.key,
    required this.message,
    this.iconSize = 16.0,
    this.iconColor,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.only(left: 6.0),
      child: Tooltip(
        message: message,
        preferBelow: false,
        verticalOffset: 20,
        showDuration: const Duration(seconds: 5),
        waitDuration: const Duration(milliseconds: 300),
        decoration: BoxDecoration(
          color: FlutterFlowTheme.of(context).primaryText.withOpacity(0.9),
          borderRadius: BorderRadius.circular(8),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        textStyle: TextStyle(
          color: FlutterFlowTheme.of(context).primaryBackground,
          fontSize: 13,
          fontWeight: FontWeight.w400,
          height: 1.4,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: MouseRegion(
          cursor: SystemMouseCursors.help,
          child: Container(
            width: iconSize + 4,
            height: iconSize + 4,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: iconColor ?? 
                    FlutterFlowTheme.of(context).secondaryText.withOpacity(0.5),
                width: 1.5,
              ),
            ),
            child: Center(
              child: Text(
                'i',
                style: TextStyle(
                  color: iconColor ?? 
                      FlutterFlowTheme.of(context).secondaryText,
                  fontSize: iconSize * 0.7,
                  fontWeight: FontWeight.w600,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Helper class containing all tooltip messages in simple Hebrew
/// Explanations are written as if explaining to an 8-year-old
class TooltipMessages {
  // ===== Navigation Menu =====
  static const String dashboard = 
      '🏠 לוח הבקרה\n'
      'זה כמו השלט הראשי שלך!\n'
      'כאן תוכל לראות הכל במבט אחד -\n'
      'כמה שיחות היו, כמה לקוחות חדשים,\n'
      'והאם הכל עובד טוב.';

  static const String leads = 
      '👥 לידים (אנשים מתעניינים)\n'
      'אלה אנשים שאולי רוצים לקנות ממך!\n'
      'כמו רשימה של חברים חדשים\n'
      'שרוצים לשמוע עוד על מה שאתה מוכר.';

  static const String calls = 
      '📞 שיחות\n'
      'כאן אפשר לראות את כל השיחות -\n'
      'מי התקשר, מתי, וכמה זמן דיברו.\n'
      'כמו יומן של כל הטלפונים!';

  static const String callLogs = 
      '📋 יומן שיחות\n'
      'רשימה של כל השיחות שהיו.\n'
      'אפשר לשמוע הקלטות ולקרוא\n'
      'מה נאמר בכל שיחה.';

  static const String placeCall = 
      '📱 בצע שיחה\n'
      'לחץ כאן כדי להתקשר למישהו!\n'
      'הרובוט החכם שלנו יתקשר בשבילך\n'
      'וידבר עם הלקוח.';

  static const String assistants = 
      '🤖 עוזרים (AI)\n'
      'אלה הרובוטים החכמים שמדברים בטלפון!\n'
      'אפשר ליצור כמה עוזרים שונים,\n'
      'כל אחד עם אישיות משלו.';

  static const String phoneNumbers = 
      '☎️ מספרי טלפון\n'
      'המספרים שהלקוחות יכולים להתקשר אליהם.\n'
      'כמו כרטיס הביקור שלך -\n'
      'המספר שאנשים מכירים.';

  static const String professionals = 
      '👷 אנשי מקצוע\n'
      'הצוות שלך! הטכנאים, המתקינים,\n'
      'כל מי שיוצא לעבוד אצל הלקוחות.';

  static const String billing = 
      '💳 חיובים\n'
      'כאן רואים כמה כסף משלמים,\n'
      'כמה דקות שיחה השתמשת,\n'
      'והחשבוניות שלך.';

  static const String settings = 
      '⚙️ הגדרות\n'
      'המקום לשנות איך הכל עובד.\n'
      'כמו להתאים את הטלפון שלך\n'
      'בדיוק כמו שאתה אוהב.';

  // ===== Voice/AI Settings =====
  static const String voiceProvider = 
      '🎤 ספק קול\n'
      'מי עושה את הקול של הרובוט?\n'
      'יש חברות שונות שיודעות לעשות\n'
      'קולות שנשמעים כמו בן אדם אמיתי.\n'
      'בחר את הקול שהכי נשמע לך טוב!';

  static const String voiceSelection = 
      '🗣️ בחירת קול\n'
      'איך הרובוט יישמע?\n'
      'גבר? אישה? צעיר? מבוגר?\n'
      'בחר קול שיתאים ללקוחות שלך.';

  static const String transcriptionProvider = 
      '✍️ ספק תמלול\n'
      'מי הופך את מה שאנשים אומרים למילים כתובות?\n'
      'כמו מישהו שיושב ורושם הכל!\n'
      'ככה הרובוט מבין מה הלקוח אומר.';

  static const String language = 
      '🌍 שפה\n'
      'באיזו שפה הרובוט ידבר וישמע?\n'
      'עברית? אנגלית? ערבית?\n'
      'בחר את השפה של הלקוחות שלך.';

  static const String model = 
      '🧠 מודל AI\n'
      'כמה חכם יהיה הרובוט?\n'
      'יש מודלים יותר חכמים (ויקרים יותר)\n'
      'ויש פשוטים יותר (וזולים יותר).\n'
      'GPT-4 הכי חכם, GPT-3.5 מהיר וזול.';

  static const String firstMessage = 
      '👋 הודעה ראשונה\n'
      'מה הרובוט יגיד כשעונה לטלפון?\n'
      'למשל: "שלום! תודה שהתקשרת.\n'
      'איך אפשר לעזור לך היום?"';

  static const String systemPrompt = 
      '📝 הוראות למערכת\n'
      'זה כמו לתת לרובוט חוקים!\n'
      'מה הוא יכול לעשות, מה אסור לו,\n'
      'איך להתנהג, ומה לענות.\n'
      'ככל שההוראות ברורות יותר -\n'
      'הרובוט יעבוד טוב יותר!';

  // ===== Lead Management =====
  static const String leadStatus = 
      '📊 סטטוס ליד\n'
      'איפה הליד נמצא בתהליך?\n'
      '• חדש = רק הצטרף\n'
      '• יצרנו קשר = דיברנו איתו\n'
      '• מעוניין = רוצה לקנות\n'
      '• סגור = קנה!';

  static const String callStatus = 
      '📞 סטטוס שיחה\n'
      'מה קרה בשיחה האחרונה?\n'
      '• הצליח = דיברנו!\n'
      '• לא ענה = הטלפון צלצל אבל אף אחד לא ענה\n'
      '• תפוס = הקו היה תפוס';

  static const String leadSource = 
      '🔍 מקור הליד\n'
      'מאיפה הליד הזה הגיע?\n'
      'מפרסומת? מהאתר? מחבר שהמליץ?\n'
      'ככה יודעים מה עובד הכי טוב!';

  // ===== Phone Settings =====
  static const String forwardingNumber = 
      '📲 מספר להעברה\n'
      'אם הרובוט לא יכול לעזור,\n'
      'לאיזה מספר להעביר את השיחה?\n'
      'בדרך כלל זה המספר שלך או של המשרד.';

  static const String callRecording = 
      '🎙️ הקלטת שיחות\n'
      'האם לשמור הקלטה של כל שיחה?\n'
      'זה עוזר לשמוע אחר כך מה נאמר\n'
      'ולשפר את השירות.';

  // ===== Billing =====
  static const String credits = 
      '💰 קרדיטים\n'
      'כמה "כסף" נשאר לך במערכת?\n'
      'כל שיחה עולה קצת קרדיטים.\n'
      'כשנגמרים - צריך להוסיף עוד!';

  static const String minutesUsed = 
      '⏱️ דקות שימוש\n'
      'כמה דקות של שיחות השתמשת?\n'
      'ככל שמשתמשים יותר -\n'
      'משלמים יותר.';

  static const String subscription = 
      '📦 מנוי\n'
      'סוג החבילה שלך.\n'
      'חבילות יותר גדולות = יותר דקות\n'
      'ויותר אפשרויות!';

  // ===== Assistant Settings =====
  static const String assistantName = 
      '📛 שם העוזר\n'
      'איך קוראים לרובוט שלך?\n'
      'למשל: "שרה", "דני", "מיכל".\n'
      'בחר שם שנשמע ידידותי!';

  static const String maxCallDuration = 
      '⏰ משך שיחה מקסימלי\n'
      'כמה זמן הכי ארוך שהרובוט ידבר?\n'
      'אחרי הזמן הזה השיחה תיפסק.\n'
      'זה עוזר לחסוך כסף!';

  static const String silenceTimeout = 
      '🤫 זמן שקט\n'
      'אחרי כמה שניות של שקט\n'
      'הרובוט יבין שהשיחה נגמרה?\n'
      'בדרך כלל 30 שניות זה בסדר.';

  // ===== Jobs/Scheduling =====
  static const String jobStatus = 
      '📋 סטטוס עבודה\n'
      'מה המצב של העבודה?\n'
      '• ממתין = עוד לא התחילו\n'
      '• בתהליך = עובדים על זה עכשיו\n'
      '• הושלם = סיימנו!';

  static const String assignTechnician = 
      '👷 הקצאת טכנאי\n'
      'מי יטפל בעבודה הזו?\n'
      'בחר את איש המקצוע המתאים\n'
      'שיצא ללקוח.';

  static const String scheduledTime = 
      '📅 זמן מתוכנן\n'
      'מתי העבודה אמורה להתבצע?\n'
      'התאריך והשעה שסיכמנו עם הלקוח.';
}

/// Extension to easily add info tooltip to any widget
extension InfoTooltipExtension on Widget {
  Widget withInfoTooltip(String message) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        this,
        InfoTooltip(message: message),
      ],
    );
  }
}

