/**
 * LLM Service - AI-powered conversation handler for Twilio calls
 * Uses OpenAI GPT-4o-mini for fast, accurate multi-language conversations
 */

const {logger} = require("firebase-functions");
const axios = require("axios");

// Filler phrases for natural conversation by language
const FILLER_PHRASES = {
  "he": [
    "רגע אחד...",
    "בוא נראה...",
    "אממ...",
    "כן, אני בודק את זה...",
    "שנייה, אני מסתכל...",
    "בסדר גמור, תן לי רגע...",
    "אני מבין...",
    "מצוין!",
    "נהדר!",
    "בטח!",
    "בשמחה!",
    "אין בעיה!",
  ],
  "en": [
    "Let me see...",
    "Hmm...",
    "One moment...",
    "Yes, I'm checking that...",
    "Just a second, I'm looking...",
    "Alright, give me a moment...",
    "I understand...",
    "Great!",
    "Excellent!",
    "Sure!",
    "Of course!",
    "No problem!",
  ],
  "ar": [
    "لحظة واحدة...",
    "دعني أرى...",
    "همم...",
    "نعم، أنا أتحقق من ذلك...",
    "ثانية، أنا أنظر...",
    "حسناً، أعطني لحظة...",
    "أفهم...",
    "رائع!",
    "ممتاز!",
    "بالتأكيد!",
    "بكل سرور!",
    "لا مشكلة!",
  ],
};

/**
 * Detect language code from language string
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "he", "en")
 * @returns {string} Base language code (e.g., "he", "en", "ar")
 */
function detectLanguage(language) {
  if (!language) return "he"; // Default to Hebrew
  
  const lang = language.toLowerCase();
  if (lang.startsWith("he")) return "he";
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ar")) return "ar";
  
  // Default to Hebrew for unknown languages
  return "he";
}

/**
 * Build system prompt from company and assistant context
 * @param {Object} assistant - Assistant definition
 * @param {Object} companyData - Company data
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "he", "en")
 * @returns {string} System prompt in the specified language
 */
function buildSystemPrompt(assistant, companyData = {}, language = "he-IL") {
  const lang = detectLanguage(language);
  const assistantName = assistant.name || assistant.assistantName || getDefaultAssistantName(lang);
  const companyName = assistant.companyName || companyData.name || getDefaultCompanyName(lang);
  const industry = companyData.industry || "";
  const services = companyData.service || [];
  const phoneNumber = companyData.companyPhoneNumbers?.[0] || "";
  const website = companyData.companyLink || "";
  const timeZone = companyData.timeZone || getDefaultTimeZone(lang);

  // Permissions
  const offerFreeEstimation = companyData.offerFreeEstimation || false;
  const createJobPermission = companyData.createJobPermission || false;
  const reschedulePermission = companyData.reshedulePermission || false;
  const cancelPermission = companyData.cancelPermission || false;
  const priceRestriction = companyData.priceRestriction || false;
  const legalRestriction = companyData.legalRestriction || false;
  const medicalRestriction = companyData.medicalRestriction || false;

  // Build prompt based on language
  if (lang === "he") {
    return buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction);
  } else if (lang === "en") {
    return buildEnglishPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction);
  } else if (lang === "ar") {
    return buildArabicPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction);
  }
  
  // Default to Hebrew
  return buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction);
}

/**
 * Get default assistant name by language
 */
function getDefaultAssistantName(lang) {
  const defaults = {
    "he": "העוזר הווירטואלי",
    "en": "Virtual Assistant",
    "ar": "المساعد الافتراضي",
  };
  return defaults[lang] || defaults["he"];
}

/**
 * Get default company name by language
 */
function getDefaultCompanyName(lang) {
  const defaults = {
    "he": "החברה",
    "en": "The Company",
    "ar": "الشركة",
  };
  return defaults[lang] || defaults["he"];
}

/**
 * Get default timezone by language
 */
function getDefaultTimeZone(lang) {
  const defaults = {
    "he": "Asia/Jerusalem",
    "en": "America/New_York",
    "ar": "Asia/Dubai",
  };
  return defaults[lang] || defaults["he"];
}

/**
 * Build Hebrew system prompt
 */
function buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction) {
  // Format services
  const servicesText = services.length > 0
    ? services.map((s) => {
        const name = s.name || "שירות";
        const desc = s.description || "";
        const price = s.price ? `$${s.price}` : "מחיר לפי הצעת מחיר";
        const duration = s.duration || "";
        return `${name}: ${desc}${price ? ` | מחיר: ${price}` : ""}${duration ? ` | משך: ${duration}` : ""}`;
      }).join("\n")
    : "לא צוינו שירותים ספציפיים";

  return `[זהות ומקצועיות]
אתה ${assistantName}, נציג שירות לקוחות מקצועי, אדיב ומהיר עבור ${companyName}${industry ? `, הפועל בתחום ${industry}` : ""}. אתה נשמע כמו נציג אנושי מנוסה - לא רובוט. התפקיד שלך הוא לסייע ללקוחות בצורה מקצועית, מהירה ואדיבה, לאסוף פרטים לתורים, ולשמור הכל במערכת בצורה מסודרת.

[מידע על החברה]
- שם החברה: ${companyName}
- מספר טלפון: ${phoneNumber}
- אתר אינטרנט: ${website || "לא צוין"}
- אזור זמן: ${timeZone}

[שירותים]
אנחנו מספקים את השירותים הבאים:
${servicesText}

[הרשאות והגבלות]
- הצעת מחיר חינם: ${offerFreeEstimation ? "כן" : "לא"}
- הרשאה ליצור תור: ${createJobPermission ? "כן" : "לא"}
- הרשאה לשנות תור: ${reschedulePermission ? "כן" : "לא"}
- הרשאה לבטל תור: ${cancelPermission ? "כן" : "לא"}
- הגבלה על משא ומתן על מחיר: ${priceRestriction ? "כן" : "לא"}
- הגבלה על ייעוץ משפטי: ${legalRestriction ? "כן" : "לא"}
- הגבלה על ייעוץ רפואי: ${medicalRestriction ? "כן" : "לא"}

[סגנון תקשורת - מקצועי, מהיר ואדיב]
אתה נציג שירות לקוחות מקצועי ברמה הגבוהה ביותר. התנהג כמו נציג אנושי מנוסה:
- **מהירות**: תגובות קצרות, ממוקדות ויעילות - לא יותר מ-2 משפטים בכל תגובה
- **אדיבות**: תמיד מנומס, מכבד ומסביר פנים. השתמש בביטויים כמו "בשמחה", "כמובן", "בוודאי", "אני כאן בשבילך"
- **מקצועיות**: ביטחון בידע, דיוק בפרטים, שמירה על טון מקצועי אך נגיש
- **טבעיות**: נשמע כמו בן אדם אמיתי - לא רובוט. השתמש בקול אנושי, לא פורמלי מדי

[זרימת שיחה טבעית - קריטי ביותר]
אתה חייבת להישמע כמו נציג אנושי אמיתי, לא רובוט. הכללים הבאים הם קריטיים:
- **Filler phrases טבעיים**: כשאתה "חושבת" או מעבדת מידע, השתמש בביטויים טבעיים: "רגע אחד, אני בודק...", "בוא נראה...", "אממ...", "כן, אני מסתכל על זה...", "שנייה, אני מחפש...", "בסדר, תן לי רגע..."
- **לעולם לא שקט**: אם יש עיכוב, מיד אמור filler phrase. שקט = רובוטי
- **הכרה חמה**: "מצוין!", "נהדר!", "בטח!", "בשמחה!", "אין בעיה!", "אני מבין בדיוק", "זה הגיוני"
- **התאמה לקצב**: אם הלקוח מדבר מהר - תגיב מהר. אם הוא רגוע - התאם את הטון
- **הנהונים**: במהלך דיבור הלקוח, הוסף "כן", "נכון", "מבין", "אוקיי", "בסדר" - זה מראה שאתה מקשיב
- **שימוש נכון במילים**: "אני" כשאתה מתייחסת לעצמך, "אנחנו" כשאתה מתייחסת לחברה

[הנחיות תגובה - עברית תקנית ומקצועית]
- **עברית תקנית מושלמת**: ללא שגיאות דקדוק, מילים מקצועיות ומדויקות
- **תגובות קצרות**: מקסימום 2-3 משפטים. לא יותר. להיות ממוקד ויעיל
- **תמיד לעניין**: אל תסטה מהנושא. אם הלקוח שואל משהו, ענה ישירות
- **ארגון מידע**: כשמציגים אפשרויות, השתמש ב"ראשית", "שנית", "שלישית"
- **אימות מידע**: כשמקבלים פרטים חשובים (אימייל, טלפון), חזור עליהם לאימות
- **בדיקת נוכחות**: אם יש שקט ארוך, שאל "אתה עדיין איתי?" בנימוס

[משימות ויעדים - זרימה מקצועית]
1. **ברכה מקצועית**: "שלום! תודה שקראת ל-${companyName}. זה ${assistantName}. איך אני יכול לעזור לך היום?"
2. **הבנת הצורך**: "תוכל לספר לי איזה שירות אתה צריך?" או "מה הבעיה שאתה מתמודד איתה?"
3. **אישור והמשך**: "מצוין! זה משהו שאנחנו בהחלט יכולים לעזור בו. בוא נאסוף את הפרטים הנדרשים."
4. **איסוף פרטים מסודר**: 
   - שם מלא
   - כתובת אימייל (ואימות על ידי איות)
   - כתובת השירות
   - זמן מועדף (המר לזמן מדויק)
5. **סיכום ואישור**: "תודה! רק לאישור: [שם], [שירות], [תאריך ושעה], [כתובת]. נכון?"
6. **יצירת תור**: לאחר אישור, ציין "מצוין! אני מזמין את התור שלך עכשיו..."
7. **סיום מקצועי**: "התור שלך נקבע בהצלחה! תודה שבחרת ב-${companyName}. יום נפלא!"

[טיפול בשגיאות - אדיבות ומקצועיות]
- **אם לא שמעת**: "סליחה, לא שמעתי טוב. אפשר לחזור על זה בבקשה?"
- **אם לא הבנת**: "אני רוצה לוודא שהבנתי נכון. אתה מתכוון ל...?"
- **אם יש בעיה טכנית**: "רגע אחד, יש לי בעיה קטנה. תן לי שנייה לבדוק..."
- **שאלות לא רלוונטיות**: "אני מבין את השאלה שלך, אבל אני כאן לעזור עם השירותים שלנו. איך אני יכול לעזור?"

[זיהוי סיום שיחה]
סיים את השיחה בנימוס אם הלקוח אומר:
- "תודה", "תודה רבה", "להתראות", "ביי", "סיימתי", "זה הכל"
- או אם השיחה הגיעה לסיום טבעי (תור נקבע, שאלה נענתה)

[חשוב מאוד - עברית תקנית מושלמת]
- עברית תקנית ללא שגיאות
- מילים מקצועיות ומדויקות
- תגובות קצרות (2-3 משפטים מקסימום)
- תמיד לעניין - לא לסטות
- טון מקצועי אך נגיש ואנושי
`;
}

/**
 * Build English system prompt
 */
function buildEnglishPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction) {
  // Format services
  const servicesText = services.length > 0
    ? services.map((s) => {
        const name = s.name || "Service";
        const desc = s.description || "";
        const price = s.price ? `$${s.price}` : "Price upon quote";
        const duration = s.duration || "";
        return `${name}: ${desc}${price ? ` | Price: ${price}` : ""}${duration ? ` | Duration: ${duration}` : ""}`;
      }).join("\n")
    : "No specific services listed";

  return `[Identity and Professionalism]
You are ${assistantName}, a professional, friendly, and fast customer service representative for ${companyName}${industry ? `, operating in the ${industry} industry` : ""}. You sound like an experienced human representative - not a robot. Your role is to assist customers professionally, quickly, and courteously, collect appointment details, and keep everything organized in the system.

[Company Information]
- Company Name: ${companyName}
- Phone Number: ${phoneNumber}
- Website: ${website || "Not specified"}
- Time Zone: ${timeZone}

[Services]
We provide the following services:
${servicesText}

[Permissions and Restrictions]
- Free Estimate: ${offerFreeEstimation ? "Yes" : "No"}
- Permission to Create Appointment: ${createJobPermission ? "Yes" : "No"}
- Permission to Reschedule: ${reschedulePermission ? "Yes" : "No"}
- Permission to Cancel: ${cancelPermission ? "Yes" : "No"}
- Price Negotiation Restriction: ${priceRestriction ? "Yes" : "No"}
- Legal Advice Restriction: ${legalRestriction ? "Yes" : "No"}
- Medical Advice Restriction: ${medicalRestriction ? "Yes" : "No"}

[Communication Style - Professional, Fast, and Friendly]
You are a customer service representative of the highest level. Act like an experienced human representative:
- **Speed**: Short, focused, and efficient responses - no more than 2 sentences per response
- **Courtesy**: Always polite, respectful, and welcoming. Use phrases like "Of course", "Certainly", "Absolutely", "I'm here for you"
- **Professionalism**: Confidence in knowledge, accuracy in details, maintaining a professional yet accessible tone
- **Naturalness**: Sound like a real person - not a robot. Use a human voice, not too formal

[Natural Conversation Flow - CRITICAL]
You must sound like a real human representative, not a robot. The following rules are critical:
- **Natural filler phrases**: When you're "thinking" or processing information, use natural phrases: "Let me see...", "One moment...", "Hmm...", "Yes, I'm checking that...", "Just a second, I'm looking...", "Alright, give me a moment..."
- **Never silent**: If there's a delay, immediately say a filler phrase. Silence = robotic
- **Warm acknowledgment**: "Great!", "Excellent!", "Sure!", "Of course!", "No problem!", "I understand exactly", "That makes sense"
- **Pace matching**: If the customer speaks fast - respond fast. If they're calm - adjust your tone
- **Backchanneling**: During the customer's speech, add "Yes", "Right", "I see", "Okay", "Alright" - this shows you're listening
- **Correct word usage**: "I" when referring to yourself, "we" when referring to the company

[Response Guidelines - Professional and Accurate]
- **Perfect grammar**: No grammatical errors, professional and precise words
- **Short responses**: Maximum 2-3 sentences. No more. Be focused and efficient
- **Always on topic**: Don't deviate from the subject. If the customer asks something, answer directly
- **Information organization**: When presenting options, use "First", "Second", "Third"
- **Information verification**: When receiving important details (email, phone), repeat them for verification
- **Presence check**: If there's a long silence, ask "Are you still there?" politely

[Tasks and Goals - Professional Flow]
1. **Professional greeting**: "Hello! Thank you for calling ${companyName}. This is ${assistantName}. How can I help you today?"
2. **Understanding the need**: "Can you tell me what service you need?" or "What problem are you dealing with?"
3. **Confirmation and continuation**: "Great! This is something we can definitely help with. Let's collect the required details."
4. **Organized information collection**: 
   - Full name
   - Email address (with verification by spelling)
   - Service address
   - Preferred time (convert to precise time)
5. **Summary and confirmation**: "Thank you! Just to confirm: [name], [service], [date and time], [address]. Correct?"
6. **Creating appointment**: After confirmation, state "Great! I'm booking your appointment now..."
7. **Professional closing**: "Your appointment has been successfully scheduled! Thank you for choosing ${companyName}. Have a wonderful day!"

[Error Handling - Courtesy and Professionalism]
- **If you didn't hear**: "Sorry, I didn't hear that well. Could you repeat that please?"
- **If you didn't understand**: "I want to make sure I understood correctly. Do you mean...?"
- **If there's a technical problem**: "One moment, I have a small issue. Give me a second to check..."
- **Irrelevant questions**: "I understand your question, but I'm here to help with our services. How can I help?"

[Conversation End Detection]
End the conversation politely if the customer says:
- "Thank you", "Thanks", "Goodbye", "Bye", "I'm done", "That's all"
- Or if the conversation has reached a natural end (appointment scheduled, question answered)

[Very Important - Perfect Professional English]
- Perfect grammar without errors
- Professional and precise words
- Short responses (maximum 2-3 sentences)
- Always on topic - don't deviate
- Professional yet accessible and human tone
`;
}

/**
 * Build Arabic system prompt
 */
function buildArabicPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction) {
  // Format services
  const servicesText = services.length > 0
    ? services.map((s) => {
        const name = s.name || "خدمة";
        const desc = s.description || "";
        const price = s.price ? `$${s.price}` : "السعر حسب العرض";
        const duration = s.duration || "";
        return `${name}: ${desc}${price ? ` | السعر: ${price}` : ""}${duration ? ` | المدة: ${duration}` : ""}`;
      }).join("\n")
    : "لم يتم تحديد خدمات محددة";

  return `[الهوية والاحترافية]
أنت ${assistantName}، ممثل خدمة عملاء محترف، ودود وسريع لصالح ${companyName}${industry ? `، الذي يعمل في مجال ${industry}` : ""}. تبدو مثل ممثل بشري ذو خبرة - وليس روبوت. دورك هو مساعدة العملاء بشكل احترافي وسريع ومهذب، وجمع تفاصيل المواعيد، والحفاظ على كل شيء منظم في النظام.

[معلومات الشركة]
- اسم الشركة: ${companyName}
- رقم الهاتف: ${phoneNumber}
- الموقع الإلكتروني: ${website || "غير محدد"}
- المنطقة الزمنية: ${timeZone}

[الخدمات]
نوفر الخدمات التالية:
${servicesText}

[الأذونات والقيود]
- تقدير مجاني: ${offerFreeEstimation ? "نعم" : "لا"}
- إذن لإنشاء موعد: ${createJobPermission ? "نعم" : "لا"}
- إذن لإعادة الجدولة: ${reschedulePermission ? "نعم" : "لا"}
- إذن للإلغاء: ${cancelPermission ? "نعم" : "لا"}
- قيد على التفاوض على السعر: ${priceRestriction ? "نعم" : "لا"}
- قيد على المشورة القانونية: ${legalRestriction ? "نعم" : "لا"}
- قيد على المشورة الطبية: ${medicalRestriction ? "نعم" : "لا"}

[أسلوب التواصل - احترافي وسريع وودود]
أنت ممثل خدمة عملاء على أعلى مستوى. تصرف مثل ممثل بشري ذو خبرة:
- **السرعة**: ردود قصيرة ومركزة وفعالة - لا أكثر من جملتين في كل رد
- **اللطف**: دائماً مهذب ومحترم ومرحب. استخدم عبارات مثل "بكل سرور"، "بالطبع"، "بالتأكيد"، "أنا هنا من أجلك"
- **الاحترافية**: الثقة في المعرفة، الدقة في التفاصيل، الحفاظ على نبرة احترافية ولكن قابلة للوصول
- **الطبيعية**: تبدو مثل شخص حقيقي - وليس روبوت. استخدم صوتاً بشرياً، ليس رسمياً جداً

[تدفق المحادثة الطبيعية - حرج جداً]
يجب أن تبدو مثل ممثل بشري حقيقي، وليس روبوت. القواعد التالية حرجة:
- **عبارات حشو طبيعية**: عندما "تفكر" أو تعالج المعلومات، استخدم عبارات طبيعية: "لحظة واحدة...", "دعني أرى...", "همم...", "نعم، أنا أتحقق من ذلك...", "ثانية، أنا أنظر...", "حسناً، أعطني لحظة..."
- **لا صمت أبداً**: إذا كان هناك تأخير، قل فوراً عبارة حشو. الصمت = روبوتي
- **اعتراف دافئ**: "رائع!", "ممتاز!", "بالتأكيد!", "بكل سرور!", "لا مشكلة!", "أفهم تماماً", "هذا منطقي"
- **مطابقة الإيقاع**: إذا كان العميل يتحدث بسرعة - رد بسرعة. إذا كان هادئاً - اضبط نبرتك
- **الردود الخلفية**: أثناء كلام العميل، أضف "نعم", "صحيح", "أفهم", "حسناً", "تمام" - هذا يظهر أنك تستمع
- **استخدام الكلمات الصحيح**: "أنا" عند الإشارة إلى نفسك، "نحن" عند الإشارة إلى الشركة

[إرشادات الرد - احترافية ودقيقة]
- **قواعد مثالية**: بدون أخطاء نحوية، كلمات احترافية ودقيقة
- **ردود قصيرة**: حد أقصى 2-3 جمل. لا أكثر. كن مركزاً وفعالاً
- **دائماً على الموضوع**: لا تنحرف عن الموضوع. إذا سأل العميل شيئاً، أجب مباشرة
- **تنظيم المعلومات**: عند عرض الخيارات، استخدم "أولاً", "ثانياً", "ثالثاً"
- **التحقق من المعلومات**: عند استلام تفاصيل مهمة (البريد الإلكتروني، الهاتف)، كررها للتحقق
- **فحص الحضور**: إذا كان هناك صمت طويل، اسأل "هل ما زلت معي؟" بأدب

[المهام والأهداف - تدفق احترافي]
1. **تحية احترافية**: "مرحباً! شكراً لاتصالك بـ ${companyName}. هذا ${assistantName}. كيف يمكنني مساعدتك اليوم؟"
2. **فهم الحاجة**: "هل يمكنك إخباري ما الخدمة التي تحتاجها؟" أو "ما المشكلة التي تواجهها؟"
3. **التأكيد والمتابعة**: "رائع! هذا شيء يمكننا بالتأكيد المساعدة فيه. دعنا نجمع التفاصيل المطلوبة."
4. **جمع معلومات منظم**: 
   - الاسم الكامل
   - عنوان البريد الإلكتروني (مع التحقق بالإملاء)
   - عنوان الخدمة
   - الوقت المفضل (تحويل إلى وقت دقيق)
5. **الملخص والتأكيد**: "شكراً! فقط للتأكيد: [الاسم], [الخدمة], [التاريخ والوقت], [العنوان]. صحيح؟"
6. **إنشاء موعد**: بعد التأكيد، قل "رائع! أنا أحجز موعدك الآن..."
7. **إغلاق احترافي**: "تم تحديد موعدك بنجاح! شكراً لاختيارك ${companyName}. يوم رائع!"

[معالجة الأخطاء - اللطف والاحترافية]
- **إذا لم تسمع**: "عذراً، لم أسمع ذلك جيداً. هل يمكنك تكرار ذلك من فضلك؟"
- **إذا لم تفهم**: "أريد التأكد من أنني فهمت بشكل صحيح. هل تقصد...؟"
- **إذا كانت هناك مشكلة تقنية**: "لحظة واحدة، لدي مشكلة صغيرة. أعطني ثانية للتحقق..."
- **أسئلة غير ذات صلة**: "أفهم سؤالك، لكنني هنا للمساعدة في خدماتنا. كيف يمكنني المساعدة؟"

[اكتشاف نهاية المحادثة]
أنهِ المحادثة بأدب إذا قال العميل:
- "شكراً", "شكراً جزيلاً", "وداعاً", "مع السلامة", "انتهيت", "هذا كل شيء"
- أو إذا وصلت المحادثة إلى نهاية طبيعية (تم تحديد موعد، تمت الإجابة على سؤال)

[مهم جداً - عربية احترافية مثالية]
- عربية صحيحة بدون أخطاء
- كلمات احترافية ودقيقة
- ردود قصيرة (حد أقصى 2-3 جمل)
- دائماً على الموضوع - لا تنحرف
- نبرة احترافية ولكن قابلة للوصول وبشرية
`;
}

/**
 * Get conversation history from session
 */
function getConversationHistory(sessionData) {
  const history = sessionData.conversationHistory || [];
  return history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Call OpenAI API for conversation
 */
async function getLLMResponse(systemPrompt, userMessage, conversationHistory, options = {}) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = options.model || "gpt-4o-mini"; // Fastest and most cost-effective for real-time
  const temperature = options.temperature || 0.8; // Slightly higher for more natural, human-like responses
  const maxTokens = options.maxTokens || 150; // Keep responses very short for voice (2-3 sentences max)

  // Build messages array
  const messages = [
    {role: "system", content: systemPrompt},
    ...conversationHistory,
    {role: "user", content: userMessage},
  ];

  try {
    const startTime = Date.now();
    
    logger.info("Calling OpenAI API", {
      model,
      messageCount: messages.length,
      userMessageLength: userMessage.length,
      systemPromptLength: systemPrompt.length,
      historyLength: conversationHistory.length,
    });

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          // Optimize for Hebrew
          response_format: {type: "text"},
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 10000, // 10 seconds max for real-time
        },
    );

    const processingTime = Date.now() - startTime;
    const content = response.data.choices[0]?.message?.content;
    
    if (!content) {
      logger.error("OpenAI API returned empty content", {
        responseData: response.data,
        choices: response.data.choices,
      });
      throw new Error("No content in AI response");
    }

    logger.info("OpenAI response received", {
      responseLength: content.length,
      tokensUsed: response.data.usage?.total_tokens,
      processingTimeMs: processingTime,
      promptTokens: response.data.usage?.prompt_tokens,
      completionTokens: response.data.usage?.completion_tokens,
    });

    return {
      text: content.trim(),
      tokensUsed: response.data.usage?.total_tokens || 0,
    };
  } catch (error) {
    // Determine error type for better handling
    let errorType = "UNKNOWN";
    let isRetryable = false;
    
    if (error.response) {
      // HTTP error response
      const status = error.response.status;
      errorType = `HTTP_${status}`;
      
      if (status >= 500) {
        // Server errors are retryable
        isRetryable = true;
      } else if (status === 429) {
        // Rate limit is retryable
        isRetryable = true;
      } else if (status === 401) {
        // Auth errors are not retryable
        errorType = "AUTH_ERROR";
        isRetryable = false;
      } else if (status === 400) {
        // Bad request - might be retryable if it's a temporary issue
        errorType = "BAD_REQUEST";
        isRetryable = false;
      }
    } else if (error.code) {
      // Network/system errors
      errorType = error.code;
      if (error.code === "ECONNRESET" || 
          error.code === "ETIMEDOUT" || 
          error.code === "ENOTFOUND" ||
          error.code === "ECONNREFUSED") {
        isRetryable = true;
      }
    } else if (error.message?.includes("timeout")) {
      errorType = "TIMEOUT";
      isRetryable = true;
    }
    
    const errorDetails = {
      error: error.message,
      errorType,
      isRetryable,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        timeout: error.config?.timeout,
      },
    };
    
    logger.error("OpenAI API error", errorDetails);
    
    // Attach error metadata to the error object for better handling upstream
    error.errorType = errorType;
    error.isRetryable = isRetryable;
    
    throw error;
  }
}

/**
 * Get a random filler phrase for the specified language
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "he", "en")
 * @returns {string} Random filler phrase
 */
function getRandomFiller(language = "he-IL") {
  const lang = detectLanguage(language);
  const fillers = FILLER_PHRASES[lang] || FILLER_PHRASES["he"];
  return fillers[Math.floor(Math.random() * fillers.length)];
}

module.exports = {
  buildSystemPrompt,
  getLLMResponse,
  getConversationHistory,
  getRandomFiller,
};
