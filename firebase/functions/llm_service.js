/**
 * LLM Service - AI-powered conversation handler for Twilio calls
 * Uses OpenAI GPT-4o-mini for fast, accurate multi-language conversations
 */

const {logger} = require("firebase-functions");
const axios = require("axios");
const {logAnomaly} = require("./anomaly_service");

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
      "Got it!",
      "Sure!",
      "Great!",
      "No problem!",
      "Perfect!",
      "Makes sense!",
      "That works!",
      "Sounds good!",
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
  if (!language) return "en"; // Default to English

  const lang = language.toLowerCase();
  if (lang.startsWith("he")) return "he";
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ar")) return "ar";

  // Default to English for unknown languages
  return "en";
}

/**
 * Build system prompt from company and assistant context
 * @param {Object} assistant - Assistant definition
 * @param {Object} companyData - Company data
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "he", "en")
 * @returns {string} System prompt in the specified language
 */
// ── Public accessors used by voice_service.js ─────────────────────────────
function getVibeSnippet(lang, vibe) {
  const langKey = lang === "he" ? "he" : lang === "ar" ? "ar" : "en";
  return VIBE_SNIPPETS[langKey]?.[vibe] || VIBE_SNIPPETS[langKey]?.friendly || "";
}

// ── Vibe snippets injected into system prompts ────────────────────────────
const VIBE_SNIPPETS = {
  en: {
    professional: "Tone: professional and formal. Polished vocabulary, full sentences, no slang.",
    friendly:     "Tone: warm and friendly — like chatting with a helpful neighbor.",
    energetic:    "Tone: upbeat and enthusiastic. High energy, positive, motivated.",
    empathetic:   "Tone: calm and empathetic. Listen first, acknowledge feelings, never rush.",
    direct:       "Tone: brief and direct. One sentence max per reply. No small talk, get to the point.",
    sales:        "Tone: persuasive sales rep. Highlight benefits, handle objections, create urgency naturally.",
  },
  he: {
    professional: "סגנון: מקצועי ורשמי. מילים ברורות, משפטים מלאים, ללא סלנג.",
    friendly:     "סגנון: חם וידידותי — כמו שיחה עם שכן טוב.",
    energetic:    "סגנון: אנרגטי ומלא חיות. קול חיובי, נלהב, מוטיבציוני.",
    empathetic:   "סגנון: רגוע ואמפתי. קשוב, מכיר ברגשות, לא ממהר.",
    direct:       "סגנון: קצר וישיר. משפט אחד מקסימום. בלי שיחות סרק.",
    sales:        "סגנון: איש מכירות משכנע. מדגיש יתרונות, מטפל בהתנגדויות, יוצר דחיפות באופן טבעי.",
  },
  ar: {
    professional: "الأسلوب: مهني ورسمي. كلمات واضحة وجمل كاملة بدون عامية.",
    friendly:     "الأسلوب: دافئ وودي — كالتحدث مع جار لطيف.",
    energetic:    "الأسلوب: حيوي ومتحمس. إيجابي ومتحفز وملئ بالطاقة.",
    empathetic:   "الأسلوب: هادئ ومتعاطف. يستمع أولاً ويراعي المشاعر ولا يتسرع.",
    direct:       "الأسلوب: مختصر ومباشر. جملة واحدة كحد أقصى. بدون كلام زائد.",
    sales:        "الأسلوب: مندوب مبيعات مقنع. يبرز المزايا ويعالج الاعتراضات ويخلق إلحاحاً بشكل طبيعي.",
  },
};

// ── Arabic gender instruction ─────────────────────────────────────────────
// Arabic grammar is gendered — the assistant needs to know whom it's addressing.
function arabicGenderInstruction(callerGender) {
  if (callerGender === "male") {
    return "الجنس: المتصل رجل. استخدم الصيغة المذكرة طوال المحادثة (أنت، تريد، تفهم، تعرف).";
  }
  if (callerGender === "female") {
    return "الجنس: المتصلة امرأة. استخدم الصيغة المؤنثة طوال المحادثة (أنتِ، تريدين، تفهمين، تعرفين).";
  }
  if (callerGender === "ask") {
    return `الجنس: في بداية المحادثة، بعد التحية الأولى، اسأل بلطف: "كيف تفضل أن أخاطبك؟" — ثم استخدم الصيغة المناسبة طوال المحادثة. إذا لم يرد أو لم يكن واضحاً، استخدم صيغة محايدة.`;
  }
  // neutral: rephrase to avoid gendered forms where possible
  return `الجنس: استخدم صياغة محايدة قدر الإمكان — تجنب الضمائر الجنسية المباشرة. استخدم الاسم إذا كان متاحاً، وإلا صِغ الجملة بأسلوب غير مباشر.`;
}

// ── Accent instruction ────────────────────────────────────────────────────
// Returns a system-prompt snippet that guides the model's pronunciation.
// Primarily useful for Voice-to-Voice (Realtime API); Standard TTS accent
// is controlled by voice selection, but the instruction doesn't hurt.
function getAccentInstruction(lang, voiceAccent) {
  if (!voiceAccent || voiceAccent === "default") return "";
  if (lang === "he") {
    if (voiceAccent === "native-il") {
      return "הגייה: דבר עברית במבטא ישראלי מקומי טבעי (ספרדי מודרני / צבר). ההגייה שלך צריכה להישמע כמו דובר עברית ילידי — לא כמו דובר אנגלי המדבר עברית. שמור על אינטונציה ורצב ישראלי.";
    }
    if (voiceAccent === "neutral") {
      return "הגייה: דבר עברית בהגייה ברורה, ניטרלית ומובנת — ללא מבטא אזורי או זר.";
    }
  }
  if (lang === "ar") {
    if (voiceAccent === "msa") {
      return "اللهجة: تحدث بالعربية الفصحى الحديثة (MSA) — رسمية وواضحة ومفهومة في جميع البلدان العربية.";
    }
    if (voiceAccent === "levantine") {
      return "اللهجة: تحدث باللهجة الشامية (سوريا، لبنان، فلسطين، الأردن) — طبيعية وعامية ومألوفة.";
    }
    if (voiceAccent === "gulf") {
      return "اللهجة: تحدث باللهجة الخليجية (الإمارات، السعودية، الكويت) — طبيعية وعامية خليجية.";
    }
    if (voiceAccent === "egyptian") {
      return "اللهجة: تحدث باللهجة المصرية — الأكثر انتشاراً وفهماً في العالم العربي.";
    }
  }
  return "";
}

// ── Gender instruction for Hebrew ─────────────────────────────────────────
function hebrewGenderInstruction(callerGender) {
  if (callerGender === "male") {
    return "פנייה: הלקוח הוא גבר. השתמש בלשון זכר לאורך כל השיחה: אתה, רוצה, מבין, יודע, מסכים.";
  }
  if (callerGender === "female") {
    return "פנייה: הלקוחה היא אישה. השתמש בלשון נקבה לאורך כל השיחה: את, רוצה, מבינה, יודעת, מסכימה.";
  }
  if (callerGender === "ask") {
    return `פנייה: בתחילת השיחה, אחרי הברכה הראשונה, שאל בעדינות: "כדי לפנות אליך נכון — מה עדיף, זכר, נקבה, או ניטרלי?" — ואז השתמש בצורה שהמשתמש בחר לאורך שאר השיחה. אם המשתמש לא ברור או לא רוצה לענות, עבור לפנייה ניטרלית.`;
  }
  // neutral (default): restructure sentences to avoid gendered forms entirely
  return `פנייה: השתמש בניסוח ניטרלי לאורך כל השיחה — אל תשתמש ב"אתה", "את", "אדוני", "גברתי". במקום זה:
- השתמש בשם הפרטי אם ידוע ("אז רונן, מה אתם מחפשים?")
- השתמש בפנייה עקיפה: "מה נשמע?", "מה אפשר לעזור?", "מתאים לך?", "נוח?"
- נסח מחדש פעלים כדי להימנע מהטיה: "האם יש עניין ב..." במקום "האם תרצה..."
- בשום אופן אל תנחש מגדר.`;
}

function buildSystemPrompt(assistant, companyData = {}, language = "en-US") {
  const lang = detectLanguage(language);
  const assistantName = assistant.name || assistant.assistantName || getDefaultAssistantName(lang);
  const companyName = assistant.companyName || companyData.name || getDefaultCompanyName(lang);
  const industry = companyData.industry || "";
  const services = companyData.service || [];
  const phoneNumber = companyData.companyPhoneNumbers?.[0] || "";
  const website = companyData.companyLink || "";
  const timeZone = companyData.timeZone || getDefaultTimeZone(lang);
  const vibe = assistant.assistantVibe || "friendly";
  const callerGender = assistant.callerGender || "auto";

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
    return buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions, vibe, callerGender);
  } else if (lang === "en") {
    return buildEnglishPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions, vibe);
  } else if (lang === "ar") {
    return buildArabicPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions);
  }

  // Default to English
  return buildEnglishPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions, vibe);
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
  return defaults[lang] || defaults["en"];
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
  return defaults[lang] || defaults["en"];
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
  return defaults[lang] || defaults["en"];
}

/**
 * Build Hebrew system prompt
 */
function buildHebrewPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions = "", vibe = "friendly", callerGender = "auto") {
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

  return `אני ${assistantName} של ${companyName}${industry ? `, תחום ${industry}` : ""}.
טלפון: ${phoneNumber || "לא צוין"} | אתר: ${website || "לא צוין"}

שירותים: ${servicesText}
הרשאות: ${permissionsText}${restrictionsText ? `\nהגבלות: ${restrictionsText}` : ""}

איך לדבר:
אני נציג שירות ישראלי. דיבור טבעי של ישראלי, כאילו אני מדבר עם חבר בטלפון. לא תרגום מאנגלית. לא סגנון כתוב. שיחה טבעית בעברית ישראלית.

דוגמאות לסגנון הנכון:
- "אהלן! מה נשמע? איך אפשר לעזור?"
- "יופי, אז בוא נסגור את זה"
- "רגע, בוא נבדוק את זה"
- "אין בעיה בכלל, מסדרים את זה"
- "סבבה, הבנתי"
- "וואלה? מעולה!"

סגנון שגוי שאסור להשתמש בו:
- "אני שמח לעמוד לרשותך" ← ככה לא מדברים בישראל
- "כיצד אוכל לסייע" ← מדבר כמו רובוט
- "האם תרצה" ← עברית מתורגמת
- "בהחלט, אשמח לעזור לך בכך" ← נשמע כמו תרגום

${hebrewGenderInstruction(callerGender)}
${VIBE_SNIPPETS.he[vibe] || VIBE_SNIPPETS.he.friendly}

כללים:
- משפט אחד, מקסימום שניים. קצר.
- עונה ישר לעניין. לא חוזר על מה שנאמר.
- שירות שאין ברשימה: "רגע, אעביר לנציג שיוכל לעזור"
- איסוף פרטים: שם, טלפון, מתי נוח
- אישור: "אז רגע, סיכום קצר: [שם], [שירות], [זמן]. הכל טוב?"
- סיום: "יאללה, תודה! יום טוב!" — ואז הנח לשיחה להסתיים. לא להגיד "אני מסיים את השיחה", "השיחה מסתיימת", וכדומה. פשוט אמור שלום ותן לשיחה להיסגר.
${additionalInstructions ? `\nהוראות נוספות: ${additionalInstructions}` : ""}`;
}

/**
 * Build English system prompt — voice-optimized, ~280 tokens
 */
function buildEnglishPrompt(assistantName, companyName, industry, services, phoneNumber, website, timeZone, offerFreeEstimation, createJobPermission, reschedulePermission, cancelPermission, priceRestriction, legalRestriction, medicalRestriction, additionalInstructions = "", vibe = "friendly") {
  const servicesText = services.length > 0
    ? services.map((s) => {
        const parts = [s.name || "Service"];
        if (s.description) parts.push(s.description);
        if (s.price) parts.push(`$${s.price}`);
        if (s.duration) parts.push(s.duration);
        return parts.join(" | ");
      }).join("\n")
    : "General services — ask caller what they need";

  const canDo = [
    createJobPermission && "book appointments",
    reschedulePermission && "reschedule",
    cancelPermission && "cancel bookings",
    offerFreeEstimation && "offer free estimates",
  ].filter(Boolean).join(", ") || "answer questions";

  const cantDo = [
    priceRestriction && "negotiate prices",
    legalRestriction && "give legal advice",
    medicalRestriction && "give medical advice",
  ].filter(Boolean).join(", ");

  return `You are ${assistantName}, a phone agent for ${companyName}${industry ? ` (${industry})` : ""}.
${VIBE_SNIPPETS.en[vibe] || VIBE_SNIPPETS.en.friendly}

Rules (non-negotiable):
- Max 1–2 short sentences per reply. That's it.
- Never start a reply with "I". Vary openings: "Sure!", "Got it.", "Mmm, let me check.", "Right, so—"
- Use contractions always: I'll, we've, that's, don't, can't, you're.
- Never say "certainly", "absolutely", "of course", "I'd be happy to" — scripted and robotic.
- Before thinking: say a filler first. "One sec.", "Sure, let me pull that up.", "Mmm."
- Match caller's energy. They're casual → you're casual. They're in a hurry → you're fast.
- When in doubt, ask one focused question. Not two.
- When ending: just say goodbye naturally and stop. Never say "I'm ending the call", "ending the call now", or announce that you're hanging up.

You can: ${canDo}
${cantDo ? `You cannot: ${cantDo}` : ""}

Company: ${companyName}${phoneNumber ? ` | Phone: ${phoneNumber}` : ""}${website ? ` | ${website}` : ""} | TZ: ${timeZone}

Services:
${servicesText}

Goal: greet → understand need → collect name + phone + preferred time → confirm → ${createJobPermission ? "book it" : "pass to team"}.
Wrap up warmly: "Awesome, you're all set! Anything else?"${additionalInstructions ? `\n\nExtra instructions: ${additionalInstructions}` : ""}`;
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
 * Agent tools — exposed to the LLM via OpenAI function calling.
 * The LLM decides autonomously when to call them based on conversation context.
 */
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send a follow-up or confirmation email to the customer. Use this when the customer provides their email address and asks for a confirmation, summary, or any written follow-up.",
      parameters: {
        type: "object",
        properties: {
          to: {type: "string", description: "Customer email address"},
          template: {type: "string", enum: ["appointmentConfirmation", "callSummary", "welcome"], description: "Email template to use"},
          templateVars: {type: "object", description: "Template variables (customerName, companyName, appointmentTime, address, details, etc.)"},
        },
        required: ["to", "template"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Send a WhatsApp message to the customer. Use this when the customer asks for a WhatsApp confirmation, reminder, or follow-up message.",
      parameters: {
        type: "object",
        properties: {
          to: {type: "string", description: "Customer phone number in E.164 format (e.g. +12125551234)"},
          message: {type: "string", description: "Message text to send"},
        },
        required: ["to", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_appointment",
      description: "Create a job or appointment in the system. Use this after collecting all required details (name, service, time) and the customer confirms they want to book.",
      parameters: {
        type: "object",
        properties: {
          customerName: {type: "string", description: "Customer full name"},
          customerEmail: {type: "string", description: "Customer email address (optional)"},
          customerPhone: {type: "string", description: "Customer phone in E.164 format"},
          service: {type: "string", description: "Service being booked"},
          scheduledTime: {type: "string", description: "Appointment date/time in ISO 8601 format"},
          address: {type: "string", description: "Service address (optional)"},
          notes: {type: "string", description: "Any additional notes (optional)"},
        },
        required: ["customerName", "service", "scheduledTime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Book a scheduled appointment on the business calendar and automatically email the customer (and the business) a calendar invite with an .ics attachment plus Google/Outlook deep-links. Use this after the customer confirms a specific date and time.",
      parameters: {
        type: "object",
        properties: {
          customerName: {type: "string", description: "Customer full name"},
          customerEmail: {type: "string", description: "Customer email for the calendar invite"},
          customerPhone: {type: "string", description: "Customer phone in E.164 format (optional)"},
          title: {type: "string", description: "Short title of the appointment (e.g. 'Consultation with Dr. Smith')"},
          startTime: {type: "string", description: "Appointment start datetime in ISO 8601 format"},
          endTime: {type: "string", description: "Appointment end datetime in ISO 8601 format"},
          location: {type: "string", description: "Address or meeting link (optional)"},
          notes: {type: "string", description: "Additional notes shown in the invite description (optional)"},
          timezone: {type: "string", description: "IANA timezone like 'America/New_York' (optional)"},
        },
        required: ["customerName", "title", "startTime", "endTime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer_call",
      description: "Transfer the call to a human agent. Use this when the customer explicitly asks to speak to a person, when the issue is complex and requires human judgment, or when you cannot resolve the customer's request.",
      parameters: {
        type: "object",
        properties: {
          to: {type: "string", description: "E.164 phone number of the human agent or queue to transfer to"},
          reason: {type: "string", description: "Brief reason for the transfer"},
        },
        required: ["to"],
      },
    },
  },
];

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
  const maxTokens = options.maxTokens || 100; // Short for voice: 1-2 sentences max

  // Build messages array (userMessage may be null for tool-result continuation passes)
  const messages = [
    {role: "system", content: systemPrompt},
    ...conversationHistory,
    ...(userMessage ? [{role: "user", content: userMessage}] : []),
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

    // Build request body - include tools only when provided
    const requestBody = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: {type: "text"},
    };

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = "auto";
      // When tools are enabled, response_format must not be set
      delete requestBody.response_format;
    }

    // Retry logic for transient OpenAI failures
    let response;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            requestBody,
            {
              headers: {
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              timeout: options.timeout || 5000,
            },
        );
        break; // Success — exit retry loop
      } catch (err) {
        const isRetryable = err.code === "ECONNRESET" ||
          err.code === "ETIMEDOUT" ||
          err.code === "ECONNABORTED" ||
          (err.response && (err.response.status === 429 || err.response.status >= 500));

        if (!isRetryable || attempt === maxRetries) {
          logAnomaly({
            severity: "error",
            category: "llm",
            code: "OPENAI_CALL_FAIL",
            message: `OpenAI chat.completions failed after ${attempt} retries: ${err.message}`,
            details: {
              status: err.response?.status || null,
              errCode: err.code || null,
              attempt,
              model: requestBody?.model || null,
            },
          });
          throw err; // Not retryable or max retries reached
        }

        const delay = 200 * Math.pow(2, attempt); // 200ms, 400ms
        logger.warn(`OpenAI retry ${attempt + 1}/${maxRetries}`, {
          error: err.message,
          status: err.response?.status,
          delay,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    const processingTime = Date.now() - startTime;
    const choice = response.data.choices[0];
    const content = choice?.message?.content;
    const toolCalls = choice?.message?.tool_calls || [];

    // LLM either returns text OR tool calls — not both
    if (!content && toolCalls.length === 0) {
      logger.error("OpenAI API returned empty content and no tool calls", {
        responseData: response.data,
        choices: response.data.choices,
      });
      logAnomaly({
        severity: "warn",
        category: "llm",
        code: "EMPTY_LLM_RESPONSE",
        message: "OpenAI returned empty content and no tool calls",
        details: {
          finishReason: choice?.finish_reason || null,
          usage: response.data?.usage || null,
        },
      });
      throw new Error("No content in AI response");
    }

    logger.info("OpenAI response received", {
      responseLength: content?.length || 0,
      toolCallCount: toolCalls.length,
      toolNames: toolCalls.map((tc) => tc.function?.name),
      tokensUsed: response.data.usage?.total_tokens,
      processingTimeMs: processingTime,
      promptTokens: response.data.usage?.prompt_tokens,
      completionTokens: response.data.usage?.completion_tokens,
    });

    return {
      text: content ? content.trim() : null,
      toolCalls,
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
function getRandomFiller(language = "en-US", context = "thinking") {
  const lang = detectLanguage(language);
  const langFillers = FILLER_PHRASES[lang] || FILLER_PHRASES["en"];
  const fillers = langFillers[context] || langFillers.thinking;
  return fillers[Math.floor(Math.random() * fillers.length)];
}

module.exports = {
  buildSystemPrompt,
  getLLMResponse,
  getConversationHistory,
  getRandomFiller,
  AGENT_TOOLS,
  getVibeSnippet,
  hebrewGenderInstruction,
  arabicGenderInstruction,
  getAccentInstruction,
};
