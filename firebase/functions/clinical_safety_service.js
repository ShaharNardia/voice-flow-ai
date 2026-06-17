/**
 * clinical_safety_service.js — WP1: Clinical Safety Guardrails.
 *
 * Clalit tender §5.4: the virtual agent must NEVER give a diagnosis, clinical
 * advice, treatment/medication recommendation, or interpret results; it must
 * declare it is an AI; it must escalate clinical "red flags" to a human; and it
 * must avoid hallucination (answers grounded in the scenario/KB only).
 *
 * This module is PURE and deterministic by design (no LLM round-trip in the
 * gate): a rule-based multilingual classifier is auditable, testable to a hard
 * pass-rate, and can't itself hallucinate. It is the safety floor; an optional
 * LLM second-opinion can be layered on top later, never under it.
 *
 * Languages: Hebrew (he), Arabic (ar), Russian (ru), English (en).
 *
 * NOTHING here runs unless a tenant has clinicalSafety enabled
 * (healthcare_config.subEnabled(cfg,"clinicalSafety")). Callers gate first.
 */

"use strict";

const SUPPORTED_LANGS = ["he", "ar", "ru", "en"];
function normLang(language) {
  const l = String(language || "he").slice(0, 2).toLowerCase();
  return SUPPORTED_LANGS.includes(l) ? l : "he";
}

// ── Red-flag / emergency phrases → immediate human escalation ───────────────
// Clinical-risk statements that must route to a human NOW (not deflect-and-continue).
const RED_FLAGS = {
  he: ["כאב בחזה", "לחץ בחזה", "קוצר נשימה", "אני לא יכול לנשום", "איבוד הכרה", "התעלפתי",
       "דימום חזק", "שבץ", "התקף לב", "רוצה להתאבד", "לשים סוף לחיים", "אובדני",
       "פרכוסים", "שיתוק", "צד אחד של הפנים", "מנת יתר"],
  ar: ["ألم في الصدر", "ضيق في التنفس", "لا أستطيع التنفس", "فقدان الوعي", "نزيف حاد",
       "جلطة", "نوبة قلبية", "أريد الانتحار", "إنهاء حياتي", "تشنجات", "شلل", "جرعة زائدة"],
  ru: ["боль в груди", "не могу дышать", "одышка", "потеря сознания", "сильное кровотечение",
       "инсульт", "сердечный приступ", "хочу покончить с собой", "суицид", "судороги",
       "паралич", "передозировка"],
  en: ["chest pain", "can't breathe", "cannot breathe", "shortness of breath", "passed out",
       "lost consciousness", "severe bleeding", "stroke", "heart attack", "want to die",
       "kill myself", "suicidal", "end my life", "seizure", "paralysis", "overdose"],
};

// ── Clinical-advice / diagnosis / medication / test-interpretation requests ──
// These must be DEFLECTED (no advice) + offer a human, but are not emergencies.
const CLINICAL_REQUEST = {
  he: ["אבחנה", "מה יש לי", "ממה אני סובל", "האם זה מסוכן", "מה לקחת", "איזו תרופה", "מינון",
       "לפרש", "מה אומרת הבדיקה", "תוצאות הבדיקה", "האם אני חולה", "איך לטפל", "מה הטיפול",
       "כמה גלולות", "להפסיק תרופה", "תופעות לוואי"],
  ar: ["تشخيص", "ماذا لدي", "هل هذا خطير", "ماذا آخذ", "أي دواء", "جرعة", "تفسير", "نتائج الفحص",
       "هل أنا مريض", "كيف أعالج", "ما العلاج", "آثار جانبية"],
  ru: ["диагноз", "что со мной", "это опасно", "что принять", "какое лекарство", "дозировка",
       "расшифровать", "результаты анализа", "я болен", "как лечить", "какое лечение", "побочные"],
  en: ["diagnose", "diagnosis", "what do i have", "is this dangerous", "what should i take",
       "which medication", "what medicine", "dosage", "interpret", "what do my results",
       "test results", "am i sick", "how do i treat", "what's the treatment", "side effects"],
};

// ── AI virtual-agent disclosure (spoken at call start) ──────────────────────
const DISCLOSURE = {
  he: "שלום, מדבר עוזר וירטואלי מבוסס בינה מלאכותית. אני לא נותן ייעוץ רפואי, ובכל מקרה דחוף או שאלה רפואית אעביר אותך לנציג אנושי.",
  ar: "مرحباً، أنا مساعد افتراضي يعمل بالذكاء الاصطناعي. لا أقدم استشارات طبية، وفي أي حالة طارئة أو سؤال طبي سأحوّلك إلى ممثل بشري.",
  ru: "Здравствуйте, с вами виртуальный ассистент на базе искусственного интеллекта. Я не даю медицинских советов и в любой срочной ситуации переключу вас на оператора.",
  en: "Hello, this is an AI-powered virtual assistant. I do not provide medical advice, and for any urgent or clinical question I will transfer you to a human representative.",
};

// ── Safe scripted deflection when a clinical request is detected ─────────────
const DEFLECTION = {
  he: "אני עוזר וירטואלי ולא יכול לתת ייעוץ רפואי או לפרש תוצאות. אני יכול לעזור בקביעת תור, בירור פרטים או להעביר אותך לנציג אנושי שיסייע. במה תרצה שאעזור?",
  ar: "أنا مساعد افتراضي ولا يمكنني تقديم استشارة طبية أو تفسير النتائج. يمكنني مساعدتك في حجز موعد أو الاستفسار أو تحويلك إلى ممثل بشري. كيف يمكنني المساعدة؟",
  ru: "Я виртуальный ассистент и не могу давать медицинские советы или толковать результаты. Я могу помочь записаться на приём, уточнить детали или соединить вас с оператором. Чем помочь?",
  en: "I'm a virtual assistant and can't give medical advice or interpret results. I can help you book an appointment, check details, or transfer you to a human representative. How can I help?",
};

const ESCALATION = {
  he: "זה נשמע דחוף. אני מעביר אותך עכשיו לנציג אנושי. אם זה מצב חירום, חייגו 101.",
  ar: "يبدو هذا عاجلاً. سأحوّلك الآن إلى ممثل بشري. إذا كانت حالة طارئة، اتصل بـ 101.",
  ru: "Это срочно. Я сейчас переключу вас на оператора. Если это экстренная ситуация, звоните 101.",
  en: "This sounds urgent. I'm transferring you to a human representative now. If this is an emergency, call your local emergency number.",
};

function matchAny(text, phrases) {
  const t = String(text || "").toLowerCase();
  return phrases.find((p) => t.includes(p.toLowerCase())) || null;
}

/**
 * INPUT guardrail. Classify a caller utterance.
 * @returns {{ action:"escalate"|"deflect"|"allow", reason:string|null, match:string|null, say:string|null, transfer:boolean }}
 */
function classifyInput(text, language) {
  const lang = normLang(language);
  const red = matchAny(text, RED_FLAGS[lang]) || matchAny(text, RED_FLAGS.en);
  if (red) {
    return { action: "escalate", reason: "red_flag", match: red, say: ESCALATION[lang], transfer: true };
  }
  const clinical = matchAny(text, CLINICAL_REQUEST[lang]) || matchAny(text, CLINICAL_REQUEST.en);
  if (clinical) {
    return { action: "deflect", reason: "clinical_request", match: clinical, say: DEFLECTION[lang], transfer: false };
  }
  return { action: "allow", reason: null, match: null, say: null, transfer: false };
}

/**
 * OUTPUT guardrail. Screen a model reply before TTS. If it appears to give
 * clinical advice / diagnosis / medication guidance, replace with the safe
 * deflection template. Returns { safe, blocked, reason, text }.
 */
function screenOutput(reply, language) {
  const lang = normLang(language);
  const t = String(reply || "");
  // Advice-y patterns the agent must never voice (multilingual, conservative).
  const ADVICE = [
    /\b(you should take|take \d|i recommend (taking|you take)|the dosage is|increase your dose|stop taking)\b/i,
    /\b(you (likely|probably) have|this is (likely|probably)|you are suffering from|the diagnosis is)\b/i,
    /(אתה צריך לקחת|קח \d|המינון הוא|מומלץ לקחת|כנראה יש לך|האבחנה היא|אתה סובל מ)/,
    /(يجب أن تأخذ|الجرعة هي|أنصحك بتناول|على الأرجح لديك|التشخيص هو)/i,
    /(вам следует принять|дозировка|примите \d|вероятно, у вас|диагноз)/i,
  ];
  for (const re of ADVICE) {
    if (re.test(t)) {
      return { safe: false, blocked: true, reason: "clinical_advice_in_output", text: DEFLECTION[lang] };
    }
  }
  return { safe: true, blocked: false, reason: null, text: t };
}

/** Disclosure line for call start. */
function getDisclosure(language) { return DISCLOSURE[normLang(language)]; }

/**
 * Hardened system-prompt preamble — prepended to the assistant instructions
 * when clinical safety is on. Front-loaded so the model treats it as binding.
 */
function buildSafetyPreamble(language) {
  const lang = normLang(language);
  const lines = [
    "CLINICAL SAFETY — BINDING, OVERRIDES ALL OTHER INSTRUCTIONS:",
    "You are an AI virtual assistant for a healthcare organization. You are NOT a clinician.",
    "1. NEVER provide a diagnosis, medical opinion, treatment plan, medication or dosage advice, or interpret test/lab/imaging results. If asked, say you cannot and offer to book an appointment or transfer to a human.",
    "2. ALWAYS ground answers in the provided knowledge base / scenario. If the answer is not there, say you don't have that information — NEVER guess or invent medical facts.",
    "3. If the caller describes a clinical emergency or red-flag symptom (chest pain, difficulty breathing, loss of consciousness, severe bleeding, stroke/heart-attack signs, suicidal intent), STOP and escalate to a human immediately; tell them to call emergency services if urgent.",
    "4. You have already disclosed that you are an AI assistant. Stay in that role; do not claim to be a doctor, nurse, or human.",
    "5. When you cannot help with a request, always offer a concrete alternative (booking, information lookup, or human transfer).",
  ];
  const langName = { he: "Hebrew", ar: "Arabic", ru: "Russian", en: "English" }[lang];
  lines.push(`Respond only in ${langName}.`);
  return lines.join("\n");
}

module.exports = {
  classifyInput, screenOutput, getDisclosure, buildSafetyPreamble, normLang,
  _internal: { RED_FLAGS, CLINICAL_REQUEST, DISCLOSURE, DEFLECTION, ESCALATION, matchAny },
};
