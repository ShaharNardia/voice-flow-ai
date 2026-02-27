/**
 * LLM Service - AI-powered conversation handler for Twilio calls
 * Uses OpenAI GPT-4o-mini for fast, accurate multi-language conversations
 */

const {logger} = require("firebase-functions");
const axios = require("axios");

// Filler phrases for natural conversation by language
// Categorized by context for smarter selection
const FILLER_PHRASES = {
  "he": {
    // "Thinking" fillers – gender-neutral
    thinking: [
      "רגע אחד...",
      "שנייה...",
      "אממ...",
      "אוקיי...",
      "כן, רגע...",
      "הממ, רגע...",
      "שנייה, בבדיקה...",
    ],
    // Acknowledgment – gender-neutral
    acknowledge: [
      "בסדר גמור...",
      "מצוין!",
      "נהדר!",
      "בטח!",
      "בשמחה!",
      "אין בעיה!",
      "בוודאי!",
      "הבנתי!",
      "מעולה!",
    ],
    // Backchanneling – gender-neutral
    backchannel: [
      "כן",
      "נכון",
      "הבנתי",
      "אוקיי",
      "בסדר",
      "ברור",
    ],
  },
  "en": {
    thinking: [
      "Let me see...",
      "Hmm...",
      "One moment...",
      "Just a sec...",
      "Okay...",
      "Right, let me check...",
      "Hmm, let's see...",
      "One second...",
    ],
    acknowledge: [
      "I understand...",
      "Great!",
      "Excellent!",
      "Sure!",
      "Of course!",
      "No problem!",
      "Absolutely!",
      "Perfect!",
      "That makes sense!",
      "Got it!",
    ],
    backchannel: [
      "Yes",
      "Right",
      "I see",
      "Okay",
      "Mm-hmm",
      "Sure",
      "Uh-huh",
    ],
  },
  "ar": {
    thinking: [
      "لحظة واحدة...",
      "دعني أرى...",
      "همم...",
      "ثانية...",
      "حسناً...",
      "نعم، لحظة...",
      "دعني أتحقق...",
      "ثانية أتحقق...",
    ],
    acknowledge: [
      "أفهم...",
      "رائع!",
      "ممتاز!",
      "بالتأكيد!",
      "بكل سرور!",
      "لا مشكلة!",
      "تماماً!",
      "مثالي!",
      "فهمت بالضبط!",
      "حسناً!",
    ],
    backchannel: [
      "نعم",
      "صحيح",
      "أفهم",
      "حسناً",
      "تمام",
      "واضح",
      "آها",
    ],
  },
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

  // Additional instructions (note: field name has typo - additionalInsturctions)
  const additionalInstructions = companyData.additionalInsturctions || companyData.additionalInstructions || "";

  // Build prompt based on language
  if (lang === "he") {
    return buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions);
  } else if (lang === "en") {
    return buildEnglishPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions);
  } else if (lang === "ar") {
    return buildArabicPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions);
  }
  
  // Default to Hebrew
  return buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions);
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
function buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions = "") {
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

  // OPTIMIZED: Condensed prompt for faster LLM inference (~600 tokens vs ~1000)
  // Every token saved = faster voice response
  const permissionsText = [
    createJobPermission ? "יצירת תור" : null,
    reschedulePermission ? "שינוי תור" : null,
    cancelPermission ? "ביטול תור" : null,
    offerFreeEstimation ? "הצעת מחיר חינם" : null,
  ].filter(Boolean).join(", ") || "מענה לשאלות";

  const restrictionsText = [
    priceRestriction ? "אין משא ומתן על מחיר" : null,
    legalRestriction ? "אין ייעוץ משפטי" : null,
    medicalRestriction ? "אין ייעוץ רפואי" : null,
  ].filter(Boolean).join(". ");

  return `הינך ${assistantName}, נציג/ת שירות של ${companyName}${industry ? ` (${industry})` : ""}.
טלפון: ${phoneNumber || "לא צוין"} | אתר: ${website || "לא צוין"} | אזור זמן: ${timeZone}

שירותים: ${servicesText}
הרשאות: ${permissionsText}${restrictionsText ? `\nהגבלות: ${restrictionsText}` : ""}

סגנון דיבור — חובה:
- דבר כמו בן אדם אמיתי בשיחת טלפון! לא כמו רובוט. לא כמו טקסט כתוב.
- משפט אחד בתגובה. מקסימום שניים. קצר וטבעי.
- השתמש במילות חיבור טבעיות: "אוֹקֵיי", "בֶּטַח", "יוֹפִי", "אֵין בְּעָיָה", "בְּשִׂמְחָה"
- אל תקרא רשימות. אל תמספר דברים. פשוט תגיד את הדבר הכי חשוב.
- השתמש בעברית מדוברת: "רֶגַע", "שְׁנִיָּה", "סַבָּבָה", "בְּדִיּוּק"
- תגובות חמות: "מְעוּלֶה!", "יוֹפִי שֶׁל בְּחִירָה!", "אֵין בְּעָיָה בִּכְלָל!"

ניקוד — חובה קריטית:
- חובה לכתוב כל מילה בעברית עם ניקוד מלא! זה קריטי לאיכות הדיבור.
- דוגמה: "שָׁלוֹם, אֵיךְ אֶפְשָׁר לַעֲזוֹר?" ולא "שלום, איך אפשר לעזור?"
- כל תגובה חייבת להיות מנוקדת במלואה. בלי יוצאים מהכלל.

פנייה מגדרית — חובה:
- אסור "אתה/את", "אדוני/גברתי", פעלים מגדריים
- במקום: "רוצה לשמוע עוד?", "איך אפשר לעזור?", "מתאים?"

כללי שיחה:
- ענה ישירות. אל תחזור על מה שנאמר.
- שירות לא ברשימה: "אעביר לנציג שיוכל לעזור"
- איסוף פרטים: שם, טלפון/אימייל, מועד
- אישור: "רק לוודא: [שם], [שירות], [מועד]. מתאים?"
- סיום: "תודה! יום מעולה!"
${additionalInstructions ? `\nהוראות נוספות: ${additionalInstructions}` : ""}`;
}

/**
 * Build English system prompt
 */
function buildEnglishPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions = "") {
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
${additionalInstructions ? `\n[Additional Instructions - Very Important]\n${additionalInstructions}\n` : ""}`;
}

/**
 * Build Arabic system prompt
 */
function buildArabicPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions = "") {
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
${additionalInstructions ? `\n[تعليمات إضافية - مهم جداً]\n${additionalInstructions}\n` : ""}`;
}

/**
 * Get conversation history from session
 */
function getConversationHistory(sessionData) {
  let history = sessionData.conversationHistory || [];

  // LATENCY: Cap history to last 10 messages (5 turns) for faster LLM inference
  // Each additional message adds ~50-100 tokens = ~50ms extra latency
  const MAX_HISTORY = 10;
  if (history.length > MAX_HISTORY) {
    // Keep first message (greeting context) + last N messages
    history = [history[0], ...history.slice(-MAX_HISTORY + 1)];
  }

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
  const temperature = options.temperature || 0.9; // Higher for natural, human-like responses
  const maxTokens = options.maxTokens || 120; // Short for voice, but room for nikud characters

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
          timeout: 5000, // 5 seconds max for real-time voice (premium latency target)
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
 * Get a random filler phrase for the specified language and context.
 *
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "he", "en")
 * @param {string} [context="thinking"] - Context: "thinking", "acknowledge", "backchannel"
 * @returns {string} Random filler phrase
 */
function getRandomFiller(language = "he-IL", context = "thinking") {
  const lang = detectLanguage(language);
  const langFillers = FILLER_PHRASES[lang] || FILLER_PHRASES["he"];
  const fillers = langFillers[context] || langFillers.thinking;
  return fillers[Math.floor(Math.random() * fillers.length)];
}

module.exports = {
  buildSystemPrompt,
  getLLMResponse,
  getConversationHistory,
  getRandomFiller,
};
