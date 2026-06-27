/**
 * Tutor Service v2 â€” browser English tutor with student profile, themed
 * curriculum, lesson time-boxing, placement exam, and fallback extraction.
 *
 * Endpoints:
 *   - tutorCreateSession          â€” mint ephemeral OpenAI token + compose instructions
 *   - lessonsSave                 â€” persist lesson + update student profile
 *   - lessonsList / lessonsGet    â€” retrieval
 *   - tutorGetStudentProfile      â€” fetch/create tutor_students/{uid}
 *   - tutorUpdateStudentProfile   â€” merge profile changes (placement results, etc.)
 *   - tutorKnowledgeProcessText   â€” per-student "My Reference" text source
 *   - tutorKnowledgeProcessUrl    â€” per-student URL source
 *   - tutorKnowledgeList          â€” list student's knowledge sources
 *   - tutorKnowledgeDelete        â€” remove a source
 */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const axios = require("axios");
const sgMail = require("@sendgrid/mail");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const admin = require("firebase-admin");
const {extractUidFromRequest} = require("./security_utils");

if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
// OPENAI_API_KEY is the defineSecret() object declared above; the runtime
// value lands in process.env.OPENAI_API_KEY once a handler with the secret
// in its secrets:[] list is invoked. Use process.env in code that reads it.

// â”€â”€ Theme library (server copy â€” must match saas-frontend/src/lib/lesson-themes.ts) â”€â”€
const THEMES = {
  travel: {
    emoji: "âœˆï¸",
    label: "Travel & Airports",
    modules: [
      {id: "book-flight", title: "Booking a flight", goals: "ask about prices, use the future tense ('I will travel'), confirm dates"},
      {id: "at-airport", title: "At the airport", goals: "check-in vocabulary, security, polite requests"},
      {id: "lost-luggage", title: "Lost luggage", goals: "polite complaints, past tense, filing a report"},
      {id: "hotel", title: "Hotel check-in", goals: "requests with 'could/would', amenities vocab"},
    ],
  },
  work: {
    emoji: "ðŸ’¼",
    label: "Work & Careers",
    modules: [
      {id: "introducing-yourself", title: "Introducing yourself at work", goals: "present-simple for job duties, adjectives for strengths"},
      {id: "meetings", title: "Running a meeting", goals: "agenda vocab, agreeing/disagreeing politely"},
      {id: "emails", title: "Professional emails (spoken)", goals: "formal register, closings, requests"},
      {id: "performance-review", title: "Performance conversations", goals: "past perfect, feedback vocab"},
    ],
  },
  food: {
    emoji: "ðŸ½ï¸",
    label: "Food & Restaurants",
    modules: [
      {id: "ordering", title: "Ordering at a restaurant", goals: "menu vocab, preferences, allergies"},
      {id: "complaining", title: "Politely complaining about food", goals: "'I'm afraid...', would-you-mind structures"},
      {id: "recipes", title: "Describing a recipe", goals: "sequencing words (first, then), imperative"},
    ],
  },
  shopping: {
    emoji: "ðŸ›ï¸",
    label: "Shopping",
    modules: [
      {id: "sizes-prices", title: "Asking about sizes and prices", goals: "comparatives (bigger/cheaper), numbers"},
      {id: "returns", title: "Making a return", goals: "past tense, receipt vocab, polite insistence"},
      {id: "bargaining", title: "Bargaining at a market", goals: "offers, counter-offers, 'how about...'"},
    ],
  },
  health: {
    emoji: "ðŸ¥",
    label: "Health & Doctor",
    modules: [
      {id: "symptoms", title: "Describing symptoms", goals: "body vocab, duration ('for 3 days'), pain scales"},
      {id: "pharmacy", title: "At the pharmacy", goals: "dosage vocab, side effects, reading labels"},
      {id: "emergency", title: "Calling an ambulance", goals: "urgency vocab, giving address, clear imperatives"},
    ],
  },
  smalltalk: {
    emoji: "ðŸ’¬",
    label: "Small Talk",
    modules: [
      {id: "weather", title: "Weather chat", goals: "comparative weather vocab, 'I think it's going to...'"},
      {id: "weekend", title: "Weekend plans", goals: "future continuous, plans vocab"},
      {id: "compliments", title: "Giving & receiving compliments", goals: "polite acceptance, reciprocating"},
    ],
  },
  news: {
    emoji: "ðŸ“°",
    label: "News & Current Events",
    modules: [
      {id: "discussing-news", title: "Discussing a news story", goals: "reported speech, opinions with 'in my view'"},
      {id: "debating", title: "Friendly debate", goals: "agreeing, disagreeing, conceding a point"},
    ],
  },
  interview: {
    emoji: "ðŸŽ¤",
    label: "Job Interview",
    modules: [
      {id: "tell-me-about-yourself", title: "'Tell me about yourself'", goals: "elevator pitch, past experience"},
      {id: "strengths-weaknesses", title: "Strengths & weaknesses", goals: "self-reflection vocab, constructive framing"},
      {id: "salary-negotiation", title: "Salary conversation", goals: "numbers, conditionals, polite firmness"},
    ],
  },
  presentations: {
    emoji: "ðŸ“Š",
    label: "Business Presentations",
    modules: [
      {id: "opening", title: "Opening a presentation", goals: "welcoming, outlining, signposting"},
      {id: "data", title: "Describing charts & data", goals: "trend vocab (rise/fall/stabilize), comparatives"},
      {id: "qna", title: "Handling Q&A", goals: "clarifying, admitting uncertainty, deflecting politely"},
    ],
  },
  relationships: {
    emoji: "â¤ï¸",
    label: "Relationships & Family",
    modules: [
      {id: "family", title: "Talking about family", goals: "family vocab, present perfect ('I've known them...')"},
      {id: "friendship", title: "Describing a close friend", goals: "adjectives for personality, relative clauses"},
      {id: "feelings", title: "Expressing feelings", goals: "emotion vocab, 'I feel... because...'"},
    ],
  },
  tech: {
    emoji: "ðŸ’»",
    label: "Technology",
    modules: [
      {id: "explain-app", title: "Explaining an app you use", goals: "tech vocab, cause-effect ('because of this...')"},
      {id: "troubleshooting", title: "Describing a tech problem", goals: "past tense, sequencing, specific vocab"},
      {id: "ai-chat", title: "Talking about AI", goals: "opinion, hypothetical ('if AI could...')"},
    ],
  },
  pronunciation: {
    emoji: "ðŸ—£ï¸",
    label: "Pronunciation Practice",
    modules: [
      {id: "th-sounds", title: "TH sounds (think / this)", goals: "voiced and unvoiced 'th' â€” tongue tip between the teeth"},
      {id: "r-vs-l", title: "R vs L", goals: "American 'r' (no tongue trill) vs clear 'l'"},
      {id: "vowel-length", title: "Long vs short vowels", goals: "ship vs sheep, full vs fool, sit vs seat"},
      {id: "word-stress", title: "Word stress", goals: "stress the right syllable"},
      {id: "sentence-rhythm", title: "Sentence rhythm & intonation", goals: "rising vs falling tones, stressed content words"},
      {id: "common-killers", title: "Common accent killers", goals: "schwa, silent letters, v/w, Ã¦/e"},
    ],
  },
  freechat: {
    emoji: "ðŸ—¨ï¸",
    label: "Free Conversation",
    modules: null,
  },
};

// â”€â”€ Tools for the Realtime model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TUTOR_TOOLS = [
  {
    type: "function",
    name: "log_correction",
    description: "Record a correction. You MUST call this EVERY time you correct the student â€” it is a required part of the turn. For pronunciation issues use category='pronunciation' (specific sound) or 'accent' (general accent pattern) or 'intonation' (rising/falling tone).",
    parameters: {
      type: "object",
      properties: {
        studentSaid: {type: "string"},
        correct: {type: "string"},
        explanation: {type: "string"},
        category: {type: "string", enum: ["grammar", "vocabulary", "pronunciation", "phrasing", "accent", "intonation"]},
      },
      required: ["studentSaid", "correct", "category"],
    },
  },
  {
    type: "function",
    name: "introduce_vocabulary",
    description: "Record a new word/phrase you're teaching. You MUST call this EVERY time you introduce a new vocabulary item â€” required, not optional.",
    parameters: {
      type: "object",
      properties: {
        word: {type: "string"},
        definition: {type: "string"},
        example: {type: "string"},
      },
      required: ["word", "definition"],
    },
  },
  {
    type: "function",
    name: "practice_pronunciation",
    description: "Use during pronunciation practice. Call this BEFORE a model-and-repeat exercise: you say the word, the student repeats. Logs a card for the UI.",
    parameters: {
      type: "object",
      properties: {
        word: {type: "string", description: "The word or phrase being practiced."},
        targetSound: {type: "string", description: "The specific sound or pattern (e.g. 'th /Î¸/', 'long ee /iË/', 'word stress on 2nd syllable')."},
        ipa: {type: "string", description: "Optional IPA transcription, e.g. /Î¸ÉªÅ‹k/."},
        tip: {type: "string", description: "One-sentence physical tip â€” tongue, lips, jaw position."},
      },
      required: ["word", "targetSound"],
    },
  },
  {
    type: "function",
    name: "complete_placement",
    description: "ONLY in placement-exam mode: call when you've assessed the student well enough to classify their level.",
    parameters: {
      type: "object",
      properties: {
        level: {type: "string", enum: ["beginner", "intermediate", "advanced"]},
        strengths: {type: "array", items: {type: "string"}},
        weaknesses: {type: "array", items: {type: "string"}},
        recommendedThemes: {type: "array", items: {type: "string"}},
        notes: {type: "string"},
      },
      required: ["level", "strengths", "weaknesses"],
    },
  },
];

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Instruction builder â€” course-aware.
// `course` carries the target language, scaffold language, exam-prep
// metadata, and theme list. The resulting prompt is fully language-agnostic.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SCAFFOLD_LANG_NAME = {he: "Hebrew", none: null};

function buildInstructions({mode, level, theme, module, durationMin, profile, refContext, course, lessonMode}) {
  const dur = [5, 10, 15, 30].includes(durationMin) ? durationMin : 15;
  const lang = course?.targetLangLabel || "English";
  const scaffold = SCAFFOLD_LANG_NAME[course?.scaffoldLang] || null;

  // A course-level `startFromZero` flag means the default student is a
  // total beginner. In that case, at beginner/unknown level we lean HEAVILY
  // on the scaffold language; we only taper off as the student progresses.
  const isAbsoluteBeginner = !!course?.startFromZero && (!level || level === "beginner");

  // Scaffold behaviour scales with level:
  //   beginner      â†’ up to 50% scaffold lang (explain concept, model phrase)
  //   intermediate  â†’ one-sentence clarifications only
  //   advanced      â†’ target-lang only
  let scaffoldRule;
  if (!scaffold) {
    scaffoldRule = `Never switch languages even if the student does â€” gently redirect: "Let's try that in ${lang}."`;
  } else if (isAbsoluteBeginner) {
    scaffoldRule = `The student is a TOTAL BEGINNER in ${lang}. Use ${scaffold} generously to explain concepts, translate phrases on first introduction, and check comprehension â€” roughly 50% ${scaffold}, 50% ${lang}. Pattern: say a short ${lang} phrase, give the ${scaffold} translation, ask the student to repeat the ${lang}. Introduce AT MOST 5 new ${lang} words per lesson. Keep ${lang} phrases very short (2-5 words). As soon as the student handles a concept confidently, stop translating that item.`;
  } else if (level === "intermediate") {
    scaffoldRule = `If the student is truly stuck after two tries, ONE short clarification in ${scaffold} is okay (a single word, or a 1-sentence grammar hint) â€” then immediately return to ${lang}. Do not translate whole sentences. Do not carry on a conversation in ${scaffold}.`;
  } else {
    scaffoldRule = `Always ${lang}. Do not switch to ${scaffold} â€” the student is advanced enough to learn new words through context, examples, and synonyms.`;
  }

  // Exam-prep add-on block (only appears if course.examPrep is present)
  const examBlock = course?.examPrep?.code
    ? (isAbsoluteBeginner
        ? `\nLONG-TERM GOAL: This student is building toward the ${course.examPrep.name}. Right now they're at the very start â€” DO NOT push B1 grammar yet. Focus on pronunciation, greetings, simple present tense, numbers, and daily-life phrases. Exam readiness is months away; today your job is to make them comfortable producing basic ${lang}.`
        : `\nEXAM-PREP MODE (${course.examPrep.code}): This student is preparing for the ${course.examPrep.name}. Occasionally simulate exam-style prompts: ${(course.examPrep.focus || []).join("; ")}. Target CEFR ${course.examPrep.code} vocabulary â€” prefer everyday useful words over rare/academic ones.`)
    : "";

  // Theme id list for placement recommendations
  const themeIds = (course?.themes || []).map((t) => t.id).join(", ");

  // PLACEMENT-EXAM MODE
  if (mode === "placement") {
    // Two flavours:
    //   (a) standard conversational placement (English course, or any course
    //       without startFromZero) â€” probes level through real conversation.
    //   (b) zero-from-scratch placement (startFromZero courses like Romanian
    //       for Hebrew speakers) â€” assumes beginner by default, only escalates
    //       if the student clearly handles more, and classifies quickly.
    if (course?.startFromZero) {
      // Derive starter theme IDs from the course's own A1 (or lowest-level) themes
      // so the placement recommendation always references real curriculum entries.
      const lowestLevel = (course.themes || []).find((t) => t.level)?.level;
      const lowestLevelThemes = (course.themes || []).filter((t) => t.level === lowestLevel);
      const starterIds = lowestLevelThemes.slice(0, 4).map((t) => t.id);
      const midLevelThemes = (course.themes || []).filter((t) => t.level && t.level !== lowestLevel);
      const midIds = midLevelThemes.slice(0, 3).map((t) => t.id);

      return `You are "Coach", a warm, patient ${lang} tutor. This is the student's FIRST lesson in this course. The course is designed for COMPLETE BEGINNERS â€” most students here know zero ${lang}. Your job right now is to quickly find out whether THIS student is a true beginner or has some prior knowledge, then end the placement early so the real lessons can begin.${examBlock}

Do this in roughly ${Math.min(dur, 8)} minutes:

STEP 1 (in ${scaffold || "English"}, ~30 seconds): Greet warmly in ${scaffold || "English"}. Say something like: "Welcome! This is a ${lang} class for beginners â€” we'll start from zero if that's where you are. Before we start, I just want to see how much ${lang} you already know, if any. No pressure â€” most people here are starting fresh."

STEP 2 (beginner probe, ~1-2 minutes): Say the ${lang} word for "hello" / "good day", then ask (in ${scaffold || "English"}) "did you recognise that word? can you say it back?" â†’ If they handle it, try introducing your name in ${lang} and asking them to repeat. Watch how they handle any special sounds.

STEP 3 (ONLY if step 2 was easy for them): Ask basic where-are-you-from and what's-your-name questions in ${lang}. If they respond naturally, probe further with a simple past-tense question.

STEP 4 (call complete_placement):
- level: "beginner" if they struggled with step 2, or know zero ${lang} (this will be MOST students)
- "intermediate" only if they handled step 3 easily
- "advanced" only if they conversed naturally at step 3 and beyond
- strengths: short â€” for true beginners, something like "open to learning", "good pronunciation on first try"
- weaknesses: honest and practical â€” e.g. "needs pronunciation basics and greetings first"
- recommendedThemes: pick ONLY from the theme ids listed below. True beginners â†’ use the first entry/entries from: ${JSON.stringify(starterIds)}. Those with some ${lang} â†’ use entries from: ${JSON.stringify(midIds)}. Theme ids available: ${themeIds}
- notes: one sentence

STEP 5: After the tool call, in ${scaffold || "English"}, cheerfully tell them what you found and say goodbye warmly.

TOOL CALLS (still mandatory):
- log_correction for every pronunciation/grammar slip they produce (if they produce any ${lang}).
- introduce_vocabulary for each ${lang} word you introduce.

SPEAKING: Use ${scaffold || "English"} for all meta-instructions and explanations during this short placement. Use ${lang} only for the actual test phrases. Do NOT try to carry out the whole placement in ${lang} â€” that will fail for a true beginner.`;
    }

    return `You are "Coach", a warm, patient ${lang} tutor. This is the student's FIRST lesson in this course. Secretly run a placement assessment â€” do NOT tell them it's an exam. Make it feel like a friendly get-to-know-you chat.${examBlock}

Over approximately ${dur} minutes, ask 5-7 open-ended conversational questions of escalating difficulty in ${lang}:
1. A simple self-introduction (tests basic present tense, pronouns).
2. What they did recently (past tense).
3. Describe a person they admire (adjectives, relative clauses).
4. A hypothetical: "if you won the lottery, what would you do?" (conditionals).
5. Their opinion on a simple current topic (complex grammar, idioms).
6. Describe a process or technical thing they know well (advanced vocabulary).
7. Tell a short story from their childhood (narrative tenses).

MANDATORY TOOL CALLS:
- EVERY mistake you notice â†’ call log_correction FIRST, then give the (gentle) correction verbally. Don't skip the tool call â€” it is REQUIRED.
- Any time you teach a new word â†’ call introduce_vocabulary FIRST, then say the word.

When you've assessed enough (or around the ${dur - 2} minute mark), call complete_placement with:
- level: beginner / intermediate / advanced
- strengths: 2-4 specific things they do well
- weaknesses: 2-4 specific areas to work on
- recommendedThemes: 3 of these theme ids that fit their interests: ${themeIds}
- notes: one sentence summary

After the tool call, cheerfully tell them their level and what you'll work on together, then say goodbye.

SPEAKING RULES:
- Always ${lang}. ${scaffoldRule}
- Never markdown.
- Short turns (1-2 sentences) so they do most of the talking.`;
  }

  // REGULAR LESSON MODE
  const themeInfo = theme && course ? (course.themes || []).find((t) => t.id === theme) : null;
  const isPronunciation = theme === "pronunciation";
  const themeHeader = themeInfo
    ? `Today's theme: ${themeInfo.emoji} ${themeInfo.label}.${module ? ` Specific module: "${module.title}". Learning goals: ${module.goals}.` : ""}`
    : `Today is free conversation â€” let the student pick what to discuss.`;

  const profileBlock = profile ? `
STUDENT PROFILE:
- Level: ${profile.level || "unknown"}
- Lessons completed: ${profile.totalLessonsCount || 0} (${profile.totalMinutes || 0} minutes)
${(profile.strengths || []).length ? `- Strengths: ${profile.strengths.slice(0, 6).join(", ")}` : ""}
${(profile.weaknesses || []).length ? `- Weaknesses to work on: ${profile.weaknesses.slice(0, 6).join(", ")}` : ""}
${(profile.recurringMistakes || []).length ? `- Recurring mistakes: ${profile.recurringMistakes.slice(0, 6).map((m) => m.pattern || m).join("; ")}` : ""}
${(profile.vocabularyMastered || []).length ? `- Vocabulary already mastered (don't re-teach): ${profile.vocabularyMastered.slice(0, 25).join(", ")}` : ""}
${(profile.vocabularyIntroduced || []).length ? `- Vocabulary introduced but not mastered â€” revisit these: ${profile.vocabularyIntroduced.slice(0, 15).join(", ")}` : ""}
` : "";

  const refBlock = refContext && refContext.trim()
    ? `\nSTUDENT'S OWN CONTEXT (weave their world into the conversation):\n${refContext.slice(0, 4000)}\n`
    : "";

  const pronunciationBlock = isPronunciation ? `

===== PRONUNCIATION COACHING MODE =====
You are GPT-4o Realtime â€” you HEAR the student's actual audio, not just text. Use that ability now.

Your job in this mode:
1. After the student speaks, listen for the SPECIFIC sound or pattern from the module goals (${module?.goals || "general accent issues"}).
2. If you hear an issue, immediately use the model-and-repeat technique:
   a. Call the practice_pronunciation tool FIRST with the word, target sound, IPA (if you know it), and a 1-sentence physical tip (where the tongue/lips go).
   b. Then say the word slowly and clearly TWICE, separated by a brief pause: "Listen â€” [word]. Again â€” [word]. Now you try."
   c. After they repeat, give specific feedback â€” call log_correction with category='pronunciation' if they still missed it, OR praise warmly if they nailed it.
3. Don't pile on â€” work one sound at a time.
4. Be encouraging. Pronunciation is hard. Mistakes are progress.

Whisper-1 transcribes the student to text, but the transcript may "auto-correct" their pronunciation. Trust your own ears.
` : "";

  // â”€â”€ Lesson-mode block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Each mode reshapes how the tutor behaves during the session.
  // The block is injected near the end of the prompt so it overrides the
  // default "short-turns, reactive" approach where needed.
  const modeId = lessonMode || "listen-speak";
  let modeBlock = "";

  if (modeId === "listen") {
    modeBlock = `

===== LISTEN-ONLY MODE =====
The student is in a passive listening session â€” they are NOT expected to speak or type today.
Your job is to deliver a self-contained mini-lesson out loud:
1. Open with a warm greeting, briefly explaining "today is a listening lesson â€” just relax and absorb."
2. Tell a short, vivid story or dialogue scene in ${lang} related to today's theme (4-6 sentences). Speak slowly and clearly.
3. Explain 2-3 key grammar points from the module goals, giving 2 examples each in ${lang}.
4. Teach 4-6 vocabulary words â€” call introduce_vocabulary for EACH before you say the word, then pronounce it twice at learner speed.
5. Call practice_pronunciation for 1-2 sounds that are tricky in ${lang} for learners.
6. Close with a brief recap and an encouragement to try the Conversation mode next time.
Pace yourself â€” repeat key phrases. Do NOT wait for student input. If the student says something, acknowledge warmly then continue the lesson.`;
  } else if (modeId === "shadow") {
    modeBlock = `

===== SHADOWING MODE =====
Pronunciation and rhythm training through model-and-repeat. Follow this CYCLE for the whole session:
1. Say ONE short phrase (4-7 words) from today's theme â€” slowly and clearly, at 70% speed.
2. Call practice_pronunciation with the most interesting/difficult sound in that phrase.
3. Say: "Acum repetÄƒ:" then say the phrase once more at natural speed.
4. Wait for the student to repeat.
5. Give brief feedback: "Bine!" if they nailed it, or call log_correction (category: pronunciation) and give ONE specific tip if they missed the sound. Then model the phrase once more.
6. Move to the next phrase without long pauses.
TARGET: 8-12 phrases per session. All phrases should relate to the module goals.
RULES: Never do long monologues. One phrase at a time. Keep energy positive and rhythmic.`;
  } else if (modeId === "vocab-drill") {
    modeBlock = `

===== VOCABULARY DRILL MODE =====
High-energy flashcard practice. Rotate through these THREE formats:
A) Say a ${lang} word â†’ student gives the meaning (in any language)
B) Give the English/Hebrew meaning â†’ student says the ${lang} word
C) Say a context sentence with a gap ("___ Ã®nseamnÄƒâ€¦") â†’ student fills the missing ${lang} word

Rules:
- Fast pace: ~20-30 seconds per item.
- Call introduce_vocabulary for every new word you're drilling.
- Call log_correction for every wrong answer before giving the correct one.
- Every 5 items: brief encouragement â€” "5 cuvinte! ContinuÄƒm!"
- Start with words from today's theme; if you run out, pull from previously introduced vocab (profile above).

OPENING LINE: "Hai sÄƒ exersÄƒm vocabularul! I'll fire words at you â€” answer as fast as you can. Ready? ÃŽncepem!"
TARGET: 10-15 words. Keep energy high throughout.`;
  } else if (modeId === "write-listen") {
    modeBlock = `

===== WRITE & LISTEN MODE =====
The student will TYPE all their answers â€” they are NOT speaking. Adapt accordingly:
- After asking a question or giving a task, PAUSE and wait for their typed response (it appears as a text message in the conversation).
- Read their text carefully. Correct any errors with log_correction (written errors count just as much as spoken ones).
- Respond in speech â€” keep your turns concise so the student can read along while listening.
- Include periodic DICTATION exercises: say a sentence in ${lang} slowly and clearly twice, ask them to write it exactly, then give feedback on their spelling and grammar.
- Treat silence as "still typing" â€” do not re-prompt too quickly.`;
  } else if (modeId === "listen-speak-write") {
    modeBlock = `

===== SPEAK & WRITE MODE =====
Alternate spoken conversation with short written exercises to reinforce the written form:
- Have 2-3 spoken exchanges as normal.
- Then give a writing prompt: say "Acum scrie:" followed by a short sentence using today's vocabulary. Ask them to TYPE it in the chat.
- Read their typed answer, correct any errors (call log_correction for written mistakes too), then praise what's right and resume speaking.
- PATTERN: speaking exchange â†’ writing check â†’ speaking exchange â†’ writing check.
- Written corrections are just as important as spoken ones.`;
  } else if (modeId === "exam-sim") {
    const partMin = Math.max(2, Math.round(dur / 3));
    modeBlock = `

===== B1 ORAL EXAM SIMULATION =====
Run a formal mock B1 oral exam. Adopt examiner tone â€” formal, neutral, encouraging but not chatty.
Structure the session in THREE timed parts (~${partMin} minutes each):

PART 1 â€” Self-introduction
Open: "BunÄƒ ziua. VÄƒ rog sÄƒ vÄƒ prezentaÈ›i."
The student should cover: name, age, city/country, occupation or studies, family, a hobby.
If they stall, a neutral prompt: "PuteÈ›i continua, vÄƒ rog?" Evaluate: tense accuracy, vocabulary range, fluency.

PART 2 â€” Situational task
Choose a scenario based on the lesson theme (e.g. tema = sÄƒnÄƒtate â†’ "SunteÈ›i la medic. DescrieÈ›i simptomele dvs."; tema = cÄƒlÄƒtorii â†’ "VreÈ›i sÄƒ rezervaÈ›i o camerÄƒ. TelefonaÈ›i recepÈ›iei.").
The student initiates and sustains the role-play. Evaluate: appropriate register, tense use, comprehension.

PART 3 â€” Opinion / argument
Ask: "Ce credeÈ›i despre [a simple, neutral statement related to the theme]? ArgumentaÈ›i-vÄƒ poziÈ›ia."
The student gives a structured argument with linking words (deoarece, totuÈ™i, Ã®n concluzie, pe de altÄƒ parte).
Evaluate: logical structure, linking words, complexity.

SCORING: When all three parts are done, call complete_placement with:
- level: your honest assessment of B1-readiness (beginner / intermediate / advanced)
- strengths: 3 specific oral exam strengths
- weaknesses: 3 specific areas to improve before the real exam
- notes: "Exam sim â€” Part 1: [X/10], Part 2: [X/10], Part 3: [X/10]. Total: [X/30]."

Throughout: call log_correction for EVERY formal-register error (wrong tense, wrong formality level, spelling if they type).
Maintain examiner tone â€” no casual chat, no "Great job!" after every sentence.`;
  }
  // (listen-speak / default: no extra block â€” the standard prompt already handles it)

  return `You are "Coach", a warm, patient ${lang} tutor. The student is ${level || "intermediate"} level.${examBlock}

${themeHeader}
${profileBlock}${refBlock}${pronunciationBlock}${modeBlock}

YOU LEAD THE LESSON â€” you are NOT reactive. Structure:
1. Open with a quick warm greeting in ${lang}, then IMMEDIATELY state today's goal out loud: "Today we're going to practice ${module?.title || themeInfo?.label || `${lang} conversation`}. By the end, you'll be able to ${module?.goals || "speak more naturally"}."
2. Ask a specific leading question that forces the student to use target grammar/vocabulary.
3. For each student answer: (a) correct if needed, (b) teach one new phrase related to the goal, (c) ask a follow-up question that pushes them harder.
4. Every 3-4 exchanges, recap: "So far we've covered X, Y, Z."
5. If the student drifts off-topic, gently steer back.
6. Never ask "what would you like to talk about?" â€” you already know.

TIMING â€” YOU HAVE ~${dur} MINUTES:
- First new vocabulary by minute 2.
- Cover 1-2 grammar points and 3-5 new vocabulary items total.
- Around minute ${dur - 2}, start wrapping up.
- At minute ${dur - 1} you'll receive a system message to wrap up. Do so: summarize key corrections + new vocabulary, praise their progress, say goodbye.

MANDATORY TOOL CALLS (non-negotiable):
- EVERY correction â†’ call log_correction FIRST, then say the correction verbally.
- EVERY new vocabulary word â†’ call introduce_vocabulary FIRST, then teach the word.

SPEAKING RULES:
- Always ${lang}. ${scaffoldRule}
- Never markdown or lists â€” this is speech.
- Short turns. 1-2 sentences. Let the student do most of the talking.
- ${level === "beginner" ? `Use simple present/past, short sentences, basic 500-word vocabulary.` : level === "advanced" ? `Use sophisticated vocabulary, idioms, phrasal verbs, complex grammar.` : `Use varied tenses and moderate vocabulary; introduce idioms sparingly.`}

Begin now by greeting warmly and setting today's goal in ${lang}.`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Student knowledge retrieval (tutor_knowledge_chunks)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchStudentKnowledge(db, studentUid, queryText, maxChars = 4000) {
  try {
    const snap = await db.collection("tutor_knowledge_chunks")
      .where("studentUid", "==", studentUid)
      .limit(200)
      .get();
    if (snap.empty) return "";
    // Without embeddings we just concatenate â€” fine for small student context.
    let out = "";
    for (const d of snap.docs) {
      const c = d.data().content || "";
      if (out.length + c.length > maxChars) break;
      out += (out ? "\n---\n" : "") + c;
    }
    return out;
  } catch (e) {
    logger.warn("fetchStudentKnowledge failed", {studentUid, error: e.message});
    return "";
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// tutorCreateSession
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.tutorCreateSession = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  if (!OPENAI_API_KEY) { res.status(500).json({error: "OPENAI_API_KEY not set"}); return; }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const theme = body.theme || null;
  const moduleId = body.moduleId || null;
  const durationMin = [5, 10, 15, 30].includes(+body.durationMin) ? +body.durationMin : 15;
  const voice = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"].includes(body.voice)
    ? body.voice : "coral";
  const VALID_LESSON_MODES = ["listen", "listen-speak", "listen-speak-write", "write-listen", "shadow", "vocab-drill", "exam-sim"];
  const lessonMode = VALID_LESSON_MODES.includes(body.lessonMode) ? body.lessonMode : "listen-speak";

  // Course resolution: body.courseId â†’ profile.currentCourseId â†’ "en-general"
  const {getCourse} = require("./courses");
  const requestedCourseId = body.courseId || null;

  try {
    const db = getFirestore();

    // Load / init student profile
    const profRef = db.collection("tutor_students").doc(uid);
    const profSnap = await profRef.get();
    let profile = profSnap.exists ? profSnap.data() : null;
    if (!profile) {
      profile = {
        uid,
        level: null,
        placementExamCompleted: false,
        totalLessonsCount: 0,
        totalMinutes: 0,
        strengths: [],
        weaknesses: [],
        vocabularyMastered: [],
        vocabularyIntroduced: [],
        recurringMistakes: [],
        preferredThemes: [],
        currentCourseId: "en-general",
        courseProgress: {},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await profRef.set(profile);
    }

    const courseId = requestedCourseId || profile.currentCourseId || "en-general";
    const course = getCourse(courseId);

    // Feature-gate the course (Romanian etc. require a flag)
    if (course.featureId) {
      const {featureEnabledForUser} = require("./feature_gate");
      const ok = await featureEnabledForUser(uid, course.featureId);
      if (!ok) {
        res.status(403).json({error: `Course '${course.id}' is not enabled for this account.`});
        return;
      }
    }

    // Resolve per-course progress with legacy fallback for English.
    // English users created before this change keep their flat fields; we
    // treat them as the English course's progress for reading purposes.
    const cp = (profile.courseProgress && profile.courseProgress[course.id]) || null;
    const isLegacyEnglish = !cp && course.id === "en-general";
    const courseProfile = {
      level: (cp?.level) ?? (isLegacyEnglish ? profile.level : null),
      placementExamCompleted: (cp?.placementExamCompleted) ?? (isLegacyEnglish ? !!profile.placementExamCompleted : false),
      strengths: (cp?.strengths) ?? (isLegacyEnglish ? profile.strengths : []),
      weaknesses: (cp?.weaknesses) ?? (isLegacyEnglish ? profile.weaknesses : []),
      preferredThemes: (cp?.preferredThemes) ?? (isLegacyEnglish ? profile.preferredThemes : []),
      completedModules: (cp?.completedModules) ?? (isLegacyEnglish ? profile.completedModules : {}),
      vocabularyMastered: (cp?.vocabularyMastered) ?? (isLegacyEnglish ? profile.vocabularyMastered : []),
      vocabularyIntroduced: (cp?.vocabularyIntroduced) ?? (isLegacyEnglish ? profile.vocabularyIntroduced : []),
      recurringMistakes: (cp?.recurringMistakes) ?? (isLegacyEnglish ? profile.recurringMistakes : []),
    };

    const mode = courseProfile.placementExamCompleted ? "lesson" : "placement";
    const themeInfo = theme ? (course.themes || []).find((t) => t.id === theme) : null;
    const moduleInfo = themeInfo && moduleId && themeInfo.modules
      ? themeInfo.modules.find((m) => m.id === moduleId) || null
      : null;

    // Load student's personal reference context
    const refContext = await fetchStudentKnowledge(db, uid, themeInfo?.label || "");

    const instructions = buildInstructions({
      mode,
      level: courseProfile.level,
      theme,
      module: moduleInfo,
      durationMin,
      profile: {
        ...profile,
        // Pass the course-scoped fields into the prompt â€” the instruction
        // template reads level/strengths/weaknesses/vocabulary from here.
        level: courseProfile.level,
        strengths: courseProfile.strengths,
        weaknesses: courseProfile.weaknesses,
        vocabularyMastered: courseProfile.vocabularyMastered,
        vocabularyIntroduced: courseProfile.vocabularyIntroduced,
        recurringMistakes: courseProfile.recurringMistakes,
      },
      refContext,
      course,
      lessonMode,
    });

    // Mint ephemeral OpenAI Realtime session
    const r = await axios.post(
      "https://api.openai.com/v1/realtime/sessions",
      {
        model: REALTIME_MODEL,
        voice,
        instructions,
        modalities: ["audio", "text"],
        input_audio_transcription: {model: "whisper-1"},
        // Semantic VAD: the model itself decides when the student is
        // finished talking (vs energy-based which reacts to any sound).
        // "low" eagerness waits for a complete sentence â€” dramatically
        // less sensitive to background noise, breaths, and filler.
        turn_detection: {
          type: "semantic_vad",
          eagerness: "low",
        },
        tools: TUTOR_TOOLS,
        tool_choice: "auto",
        temperature: 0.8,
        max_response_output_tokens: 400,
      },
      {headers: {"Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json"}, timeout: 10000},
    );

    res.status(200).json({
      client_secret: r.data.client_secret,
      session_id: r.data.id,
      model: r.data.model || REALTIME_MODEL,
      voice,
      mode,
      lessonMode,
      level: courseProfile.level || "intermediate",
      theme,
      moduleId,
      durationMin,
      courseId: course.id,
      targetLang: course.targetLang,
      targetLangLabel: course.targetLangLabel,
      isFirstLesson: !courseProfile.placementExamCompleted,
    });
  } catch (e) {
    const detail = e.response?.data || e.message;
    logger.error("tutorCreateSession failed", {error: detail});
    res.status(500).json({error: "Failed to create tutor session", detail: String(detail).slice(0, 500)});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fallback insight extractor â€” runs after lesson save if corrections/vocab are empty
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function extractInsightsFromTranscript(transcript) {
  if (!OPENAI_API_KEY || !transcript?.length) return {corrections: [], vocabulary: []};
  const convo = transcript.slice(-60)
    .map((m) => `${m.role === "tutor" ? "TUTOR" : "STUDENT"}: ${m.content}`)
    .join("\n");
  const prompt = `You are an analyzer. From this English lesson transcript, extract:
1. Any corrections the TUTOR made to the STUDENT's grammar, vocabulary, or phrasing.
2. Any new vocabulary words the TUTOR introduced.

Output STRICT JSON only:
{
  "corrections": [{"studentSaid":"","correct":"","explanation":"","category":"grammar|vocabulary|pronunciation|phrasing"}],
  "vocabulary":  [{"word":"","definition":"","example":""}]
}

Transcript:
${convo}`;

  try {
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{role: "user", content: prompt}],
        response_format: {type: "json_object"},
        temperature: 0.2,
      },
      {headers: {"Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json"}, timeout: 15000},
    );
    const parsed = JSON.parse(r.data.choices[0].message.content);
    return {
      corrections: (parsed.corrections || []).slice(0, 20),
      vocabulary: (parsed.vocabulary || []).slice(0, 20),
    };
  } catch (e) {
    logger.warn("extractInsightsFromTranscript failed", {error: e.message});
    return {corrections: [], vocabulary: []};
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Send a friendly HTML lesson summary via SendGrid.
// Best-effort â€” never throws to the caller.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendLessonSummaryEmail({uid, lessonId, lesson, profile}) {
  if (!process.env.SENDGRID_API_KEY) {
    logger.warn("SENDGRID_API_KEY not set, skipping lesson summary email");
    return;
  }
  // Resolve recipients
  const recipients = new Set();
  try {
    if (profile?.summaryEmailEnabled !== false) {
      // Default: send to the registered user's email
      const u = await admin.auth().getUser(uid).catch(() => null);
      if (u?.email) recipients.add(u.email);
    }
    if (profile?.summaryEmailExtra && /\S+@\S+\.\S+/.test(profile.summaryEmailExtra)) {
      recipients.add(profile.summaryEmailExtra.trim());
    }
  } catch (e) {
    logger.warn("Could not resolve email recipients", {error: e.message});
  }
  if (recipients.size === 0) return;

  const {getCourse} = require("./courses");
  const course = getCourse(lesson.courseId || "en-general");
  const themeInfo = (course.themes || []).find((t) => t.id === lesson.theme) || null;
  const moduleInfo = themeInfo?.modules?.find((m) => m.id === lesson.moduleId) || null;
  const themeLabel = lesson.mode === "placement" ? "Placement chat" : (themeInfo?.label || "Free conversation");
  const themeEmoji = lesson.mode === "placement" ? "ðŸŽ¯" : (themeInfo?.emoji || "ðŸ—¨ï¸");
  const minutes = Math.max(1, Math.round(lesson.durationSec / 60));
  const detailUrl = `https://voiceflow-ai-202509231639.web.app/learn/detail?id=${encodeURIComponent(lessonId)}`;

  const corrItems = (lesson.corrections || []).slice(0, 8).map((c) => `
    <li style="margin-bottom:10px;">
      <span style="text-decoration:line-through;color:#dc2626;">${escape(c.studentSaid)}</span>
      &nbsp;â†’&nbsp; <strong style="color:#059669;">${escape(c.correct)}</strong>
      ${c.explanation ? `<div style="font-size:12px;color:#737373;margin-top:2px;font-style:italic;">${escape(c.explanation)}</div>` : ""}
    </li>`).join("");

  const vocabItems = (lesson.vocabulary || []).slice(0, 10).map((v) => `
    <li style="margin-bottom:8px;">
      <strong style="color:#92400e;">ðŸ“š ${escape(v.word)}</strong>
      &nbsp;â€” ${escape(v.definition)}
      ${v.example ? `<div style="font-size:12px;color:#737373;font-style:italic;margin-top:2px;">"${escape(v.example)}"</div>` : ""}
    </li>`).join("");

  const drillItems = (lesson.pronunciationDrills || []).slice(0, 8).map((d) => `
    <li style="margin-bottom:8px;">
      <strong style="color:#9d174d;">ðŸ—£ï¸ ${escape(d.word)}</strong> â€” ${escape(d.targetSound)}
      ${d.tip ? `<div style="font-size:12px;color:#737373;margin-top:2px;">ðŸ’¡ ${escape(d.tip)}</div>` : ""}
    </li>`).join("");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FBF9F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <!-- Hero -->
    <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);color:white;padding:32px 24px;border-radius:24px;margin-bottom:24px;">
      <div style="font-size:48px;">${themeEmoji}</div>
      <h1 style="margin:8px 0 4px 0;font-size:24px;">${escape(themeLabel)}</h1>
      ${moduleInfo ? `<p style="margin:0;color:#ddd6fe;font-size:14px;">${escape(moduleInfo.title)}</p>` : ""}
      <p style="margin:12px 0 0 0;font-size:14px;color:#ddd6fe;">
        ${minutes} min Â· ${(lesson.corrections || []).length} corrections Â· ${(lesson.vocabulary || []).length} new words
      </p>
    </div>

    ${corrItems ? `
    <div style="background:white;border:1px solid #d1fae5;border-radius:16px;padding:16px 20px;margin-bottom:16px;">
      <h2 style="margin:0 0 12px 0;font-size:14px;color:#047857;text-transform:uppercase;letter-spacing:0.05em;">âœ“ Corrections (${(lesson.corrections || []).length})</h2>
      <ul style="margin:0;padding:0 0 0 18px;font-size:14px;">${corrItems}</ul>
    </div>` : ""}

    ${drillItems ? `
    <div style="background:white;border:1px solid #fbcfe8;border-radius:16px;padding:16px 20px;margin-bottom:16px;">
      <h2 style="margin:0 0 12px 0;font-size:14px;color:#9d174d;text-transform:uppercase;letter-spacing:0.05em;">ðŸ—£ï¸ Pronunciation drills (${(lesson.pronunciationDrills || []).length})</h2>
      <ul style="margin:0;padding:0 0 0 18px;font-size:14px;">${drillItems}</ul>
    </div>` : ""}

    ${vocabItems ? `
    <div style="background:white;border:1px solid #fde68a;border-radius:16px;padding:16px 20px;margin-bottom:16px;">
      <h2 style="margin:0 0 12px 0;font-size:14px;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;">ðŸ“š New vocabulary (${(lesson.vocabulary || []).length})</h2>
      <ul style="margin:0;padding:0 0 0 18px;font-size:14px;">${vocabItems}</ul>
    </div>` : ""}

    <!-- CTA -->
    <div style="text-align:center;margin:24px 0;">
      <a href="${detailUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:white;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:16px;font-size:14px;">
        View full lesson â†’
      </a>
    </div>

    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">
      Coach â€” your ${escape(course.targetLangLabel)} tutor.<br>
      Don't want these emails? Toggle them off in your profile settings.
    </p>
  </div>
</body></html>`;

  const fromAddress = process.env.SENDGRID_FROM_EMAIL || "noreply@voiceflowai.app";
  const subject = `ðŸ“š Your ${themeLabel} lesson â€” ${(lesson.corrections || []).length + (lesson.vocabulary || []).length + ((lesson.pronunciationDrills || []).length)} new things to remember`;

  for (const to of recipients) {
    try {
      await sgMail.send({to, from: {email: fromAddress, name: `Coach â€” ${course.targetLangLabel} Tutor`}, subject, html});
      logger.info("Sent lesson summary email", {to, lessonId});
    } catch (e) {
      logger.warn("Failed to send lesson summary email", {to, error: e.message});
    }
  }
}

function escape(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// lessonsSave â€” persist lesson + update student profile
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.lessonsSave = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const db = getFirestore();
    const now = FieldValue.serverTimestamp();

    // Cost calc
    const rc = await db.collection("config").doc("rateCard").get();
    const rt = (rc.exists && rc.data().openaiRealtime) || {costPerMinuteInput: 0.06, costPerMinuteOutput: 0.24};
    const inMin = (body.realtimeInputSec || 0) / 60;
    const outMin = (body.realtimeOutputSec || 0) / 60;
    const cost = +((inMin * rt.costPerMinuteInput) + (outMin * rt.costPerMinuteOutput)).toFixed(6);

    let corrections = Array.isArray(body.corrections) ? body.corrections.slice(0, 200) : [];
    let vocabulary = Array.isArray(body.vocabulary) ? body.vocabulary.slice(0, 200) : [];
    const pronunciationDrills = Array.isArray(body.pronunciationDrills) ? body.pronunciationDrills.slice(0, 100) : [];
    const transcript = Array.isArray(body.transcript) ? body.transcript.slice(0, 500) : [];

    // Fallback extraction if tool calls didn't fire
    if ((corrections.length === 0 || vocabulary.length === 0) && transcript.length > 2) {
      const extracted = await extractInsightsFromTranscript(transcript);
      if (corrections.length === 0) corrections = extracted.corrections;
      if (vocabulary.length === 0) vocabulary = extracted.vocabulary;
    }

    // Course resolution for this save. Backward compatible â€” old clients
    // that don't send `courseId` default to English.
    const {getCourse} = require("./courses");
    const courseId = body.courseId || "en-general";
    const course = getCourse(courseId);

    const doc = {
      ownerId: uid,
      courseId: course.id,
      language: body.language || course.targetLang || "en",
      targetLangLabel: course.targetLangLabel,
      level: body.level || null,
      theme: body.theme || null,
      moduleId: body.moduleId || null,
      topic: body.topic || null,
      voice: body.voice || null,
      durationSec: Math.round(body.durationSec || 0),
      durationPlannedMin: body.durationPlannedMin || null,
      mode: body.mode || "lesson",
      transcript,
      corrections,
      vocabulary,
      pronunciationDrills,
      summary: body.summary || null,
      realtimeInputSec: Math.round(body.realtimeInputSec || 0),
      realtimeOutputSec: Math.round(body.realtimeOutputSec || 0),
      cost,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await db.collection("lessons").add(doc);

    // Update student profile â€” per-course progress is kept under
    // courseProgress[courseId]. Global counters (totalLessonsCount/
    // totalMinutes) stay at the top level since they span all courses.
    const profRef = db.collection("tutor_students").doc(uid);
    const profSnap = await profRef.get();
    const profile = profSnap.exists ? profSnap.data() : {};

    // Legacy fallback: if this is the English course and there's no
    // courseProgress.en-general yet, fold the flat fields into the view
    // so we don't lose existing per-user state.
    const existingCp = (profile.courseProgress && profile.courseProgress[course.id]) || null;
    const isLegacyEnglish = !existingCp && course.id === "en-general";
    const cpBase = existingCp || (isLegacyEnglish ? {
      vocabularyIntroduced: profile.vocabularyIntroduced || [],
      vocabularyMastered: profile.vocabularyMastered || [],
      recurringMistakes: profile.recurringMistakes || [],
      completedModules: profile.completedModules || {},
      placementExamCompleted: !!profile.placementExamCompleted,
      level: profile.level || null,
      strengths: profile.strengths || [],
      weaknesses: profile.weaknesses || [],
      preferredThemes: profile.preferredThemes || [],
    } : {
      vocabularyIntroduced: [], vocabularyMastered: [],
      recurringMistakes: [], completedModules: {},
      placementExamCompleted: false, level: null,
      strengths: [], weaknesses: [], preferredThemes: [],
    });

    const newVocab = vocabulary.map((v) => v.word).filter(Boolean);
    const introduced = Array.from(new Set([...(cpBase.vocabularyIntroduced || []), ...newVocab])).slice(-200);

    const existingMistakes = (cpBase.recurringMistakes || []).slice();
    for (const c of corrections) {
      const pattern = c.category || "other";
      const existing = existingMistakes.find((m) => m.pattern === pattern);
      if (existing) existing.count = (existing.count || 1) + 1;
      else existingMistakes.push({pattern, count: 1});
    }

    const completedModules = {...(cpBase.completedModules || {})};
    if (body.theme && body.moduleId) {
      completedModules[body.theme] = Array.from(new Set([...(completedModules[body.theme] || []), body.moduleId]));
    }

    // Build a dotted-path update that scopes these deltas under the right
    // course â€” safer than reading/writing the whole nested object.
    const cpPrefix = `courseProgress.${course.id}`;
    const profileUpdate = {
      uid,
      totalLessonsCount: (profile.totalLessonsCount || 0) + 1,
      totalMinutes: (profile.totalMinutes || 0) + Math.round(doc.durationSec / 60),
      currentCourseId: profile.currentCourseId || course.id,
      [`${cpPrefix}.vocabularyIntroduced`]: introduced,
      [`${cpPrefix}.recurringMistakes`]: existingMistakes.slice(0, 30),
      [`${cpPrefix}.completedModules`]: completedModules,
      [`${cpPrefix}.vocabularyMastered`]: cpBase.vocabularyMastered || [],
      [`${cpPrefix}.level`]: cpBase.level || null,
      [`${cpPrefix}.strengths`]: cpBase.strengths || [],
      [`${cpPrefix}.weaknesses`]: cpBase.weaknesses || [],
      [`${cpPrefix}.preferredThemes`]: cpBase.preferredThemes || [],
      // A completed placement session always unlocks the course, even if the
      // AI didn't call complete_placement (safety net) and even if there's a
      // race where tutorUpdateStudentProfile hadn't committed before this read.
      [`${cpPrefix}.placementExamCompleted`]: !!cpBase.placementExamCompleted || doc.mode === "placement",
      updatedAt: now,
      ...(profSnap.exists ? {} : {createdAt: now, placementExamCompleted: false, strengths: [], weaknesses: [], vocabularyMastered: [], preferredThemes: []}),
    };
    await profRef.set(profileUpdate, {merge: true});

    // Fire-and-forget summary email (best-effort, doesn't block the response)
    sendLessonSummaryEmail({uid, lessonId: ref.id, lesson: doc, profile}).catch((e) =>
      logger.warn("sendLessonSummaryEmail failed", {error: e.message}),
    );

    res.status(200).json({id: ref.id, cost, correctionsCount: corrections.length, vocabularyCount: vocabulary.length});
  } catch (e) {
    logger.error("lessonsSave failed", e);
    res.status(500).json({error: "Failed to save lesson"});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// lessonsList
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.lessonsList = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }

  try {
    const db = getFirestore();
    let snap;
    try {
      snap = await db.collection("lessons")
        .where("ownerId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    } catch (indexErr) {
      // FAILED_PRECONDITION (code 9) means the composite index is still building.
      // Fall back to an unordered query and sort in JS so the endpoint stays usable.
      if (indexErr?.code === 9) {
        logger.warn("lessonsList: composite index not ready, falling back to unordered query", {uid});
        const fallback = await db.collection("lessons")
          .where("ownerId", "==", uid)
          .limit(50)
          .get();
        // Sort newest-first in JS
        const sorted = fallback.docs.slice().sort((a, b) => {
          const ta = a.data().createdAt?.toMillis?.() || 0;
          const tb = b.data().createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        snap = {docs: sorted};
      } else {
        throw indexErr;
      }
    }
    const lessons = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        level: data.level,
        theme: data.theme,
        moduleId: data.moduleId,
        topic: data.topic,
        durationSec: data.durationSec,
        correctionsCount: (data.corrections || []).length,
        vocabularyCount: (data.vocabulary || []).length,
        summary: data.summary,
        cost: data.cost,
        mode: data.mode || "lesson",
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    res.status(200).json({lessons});
  } catch (e) {
    logger.error("lessonsList failed", e);
    res.status(500).json({error: "Failed to list lessons"});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// lessonsGet
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.lessonsGet = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const id = req.query.id || req.query.lessonId;
    if (!id) { res.status(400).json({error: "id required"}); return; }
    const db = getFirestore();
    const doc = await db.collection("lessons").doc(String(id)).get();
    if (!doc.exists) { res.status(404).json({error: "Not found"}); return; }
    const data = doc.data();
    if (data.ownerId !== uid) { res.status(403).json({error: "Forbidden"}); return; }
    res.status(200).json({
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    });
  } catch (e) {
    logger.error("lessonsGet failed", e);
    res.status(500).json({error: "Failed to fetch lesson"});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// tutorGetStudentProfile
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.tutorGetStudentProfile = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const db = getFirestore();
    const ref = db.collection("tutor_students").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const fresh = {
        uid, level: null, placementExamCompleted: false,
        totalLessonsCount: 0, totalMinutes: 0,
        strengths: [], weaknesses: [], vocabularyMastered: [],
        vocabularyIntroduced: [], recurringMistakes: [], preferredThemes: [],
        completedModules: {},
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      };
      await ref.set(fresh);
      res.status(200).json({...fresh, createdAt: null, updatedAt: null});
      return;
    }
    const data = snap.data();
    res.status(200).json({
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    });
  } catch (e) {
    logger.error("tutorGetStudentProfile failed", e);
    res.status(500).json({error: "Failed"});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// tutorUpdateStudentProfile â€” used when placement-exam finishes, or for manual edits
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.tutorUpdateStudentProfile = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const db = getFirestore();
    const ref = db.collection("tutor_students").doc(uid);
    const updates = {updatedAt: FieldValue.serverTimestamp()};

    // Top-level fields (backward-compatible, shared across all courses)
    const topLevel = ["nativeLanguage", "summaryEmailEnabled", "summaryEmailExtra", "currentCourseId"];
    for (const k of topLevel) if (body[k] !== undefined) updates[k] = body[k];

    // Per-course fields â€” if `courseId` is provided, scope to
    // courseProgress.{courseId}.{field}. Otherwise fall back to legacy
    // top-level writes so pre-existing clients still work.
    const perCourse = ["level", "placementExamCompleted", "placementExamResult",
      "strengths", "weaknesses", "preferredThemes",
      "vocabularyMastered", "vocabularyIntroduced"];
    const courseId = body.courseId || null;
    for (const k of perCourse) {
      if (body[k] === undefined) continue;
      if (courseId) updates[`courseProgress.${courseId}.${k}`] = body[k];
      else updates[k] = body[k]; // legacy path
    }

    await ref.set(updates, {merge: true});
    res.status(200).json({status: "ok"});
  } catch (e) {
    logger.error("tutorUpdateStudentProfile failed", e);
    res.status(500).json({error: "Failed"});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// tutorKnowledgeProcessText â€” store a student's reference text
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.tutorKnowledgeProcessText = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const title = (body.title || "Reference").toString().slice(0, 120);
    const text = (body.text || "").toString();
    if (!text.trim()) { res.status(400).json({error: "text required"}); return; }

    const db = getFirestore();
    // Delete prior chunks with the same title (idempotent)
    const old = await db.collection("tutor_knowledge_chunks")
      .where("studentUid", "==", uid).where("title", "==", title).get();
    const delBatch = db.batch();
    old.forEach((d) => delBatch.delete(d.ref));
    if (!old.empty) await delBatch.commit();

    // Simple character chunking (no embeddings â€” we pack the whole thing in the prompt)
    const CHUNK = 1500;
    const now = FieldValue.serverTimestamp();
    let idx = 0;
    for (let i = 0; i < text.length; i += CHUNK) {
      await db.collection("tutor_knowledge_chunks").add({
        studentUid: uid,
        title,
        content: text.slice(i, i + CHUNK),
        chunkIndex: idx++,
        sourceType: "text",
        createdAt: now,
      });
    }
    res.status(200).json({ok: true, chunks: idx, title});
  } catch (e) {
    logger.error("tutorKnowledgeProcessText failed", e);
    res.status(500).json({error: "Failed"});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// tutorKnowledgeList
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.tutorKnowledgeList = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const db = getFirestore();
    const snap = await db.collection("tutor_knowledge_chunks")
      .where("studentUid", "==", uid).get();
    const byTitle = {};
    snap.forEach((d) => {
      const data = d.data();
      if (!byTitle[data.title]) byTitle[data.title] = {title: data.title, sourceType: data.sourceType, chunks: 0};
      byTitle[data.title].chunks++;
    });
    res.status(200).json({sources: Object.values(byTitle)});
  } catch (e) {
    logger.error("tutorKnowledgeList failed", e);
    res.status(500).json({error: "Failed"});
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SCHEDULED LESSONS â€” book a future lesson, cancel, list upcoming/past.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

exports.scheduledLessonsCreate = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const scheduledAt = new Date(body.scheduledAt);
    if (!scheduledAt || isNaN(+scheduledAt)) { res.status(400).json({error: "scheduledAt required"}); return; }
    if (+scheduledAt < Date.now() - 60_000) { res.status(400).json({error: "Cannot schedule in the past"}); return; }
    const durationMin = [5, 10, 15, 30].includes(+body.durationMin) ? +body.durationMin : 15;
    const theme = body.theme || null;
    const moduleId = body.moduleId || null;
    const voice = body.voice || "coral";
    const notes = (body.notes || "").toString().slice(0, 500);

    const db = getFirestore();
    const ref = await db.collection("scheduled_lessons").add({
      ownerId: uid,
      scheduledAt, durationMin,
      theme, moduleId, voice, notes,
      status: "scheduled",
      reminderSent: false,
      reminder24hSent: false,
      reminder15mSent: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Fire-and-forget initial invite email with ICS attachment. Feature-gated.
    (async () => {
      try {
        const {featureEnabledForUser} = require("./feature_gate");
        const canSendInvites = await featureEnabledForUser(uid, "cap.calendarInvites");
        if (!canSendInvites) return;
        const u = await admin.auth().getUser(uid).catch(() => null);
        if (!u || !u.email) return;
        const endAt = new Date(+scheduledAt + durationMin * 60 * 1000);
        const title = `English practice${theme ? ` â€” ${theme}` : ""} (${durationMin} min)`;
        const description = notes || "Your scheduled English practice session on VoiceFlow AI.";
        const {buildIcs, renderInviteHtml, sendInviteEmail} = require("./calendar_invites");
        const ics = buildIcs({
          uid: `lesson-${ref.id}@voiceflow-ai`,
          title,
          description,
          startAt: scheduledAt,
          endAt,
          organizerEmail: process.env.SENDGRID_FROM_EMAIL,
          attendeeEmail: u.email,
        });
        const html = renderInviteHtml({
          title,
          description,
          startAt: scheduledAt,
          endAt,
          ctaUrl: "https://voiceflow-ai-202509231639.web.app/learn/schedule",
        });
        await sendInviteEmail({
          to: u.email,
          subject: `Lesson scheduled â€” ${new Date(scheduledAt).toLocaleString()}`,
          htmlBody: html,
          icsText: ics,
        });
      } catch (err) {
        logger.warn("Invite email failed for lesson", ref.id, err?.message);
      }
    })();

    res.status(200).json({id: ref.id, scheduledAt: scheduledAt.toISOString()});
  } catch (e) {
    logger.error("scheduledLessonsCreate failed", e);
    res.status(500).json({error: "Failed"});
  }
});

exports.scheduledLessonsList = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const db = getFirestore();
    // No orderBy here â€” keeps the query index-free. We sort client-side.
    const snap = await db.collection("scheduled_lessons")
      .where("ownerId", "==", uid)
      .limit(200)
      .get();
    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        scheduledAt: data.scheduledAt?.toDate?.()?.toISOString() || data.scheduledAt,
        durationMin: data.durationMin,
        theme: data.theme,
        moduleId: data.moduleId,
        voice: data.voice,
        notes: data.notes || "",
        status: data.status || "scheduled",
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    items.sort((a, b) => String(b.scheduledAt).localeCompare(String(a.scheduledAt)));
    res.status(200).json({items});
  } catch (e) {
    logger.error("scheduledLessonsList failed", e);
    res.status(500).json({error: "Failed", detail: e.message});
  }
});

exports.scheduledLessonsCancel = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const id = body.id;
    if (!id) { res.status(400).json({error: "id required"}); return; }
    const db = getFirestore();
    const ref = db.collection("scheduled_lessons").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) { res.status(404).json({error: "Not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({error: "Forbidden"}); return; }
    await ref.set({status: "cancelled", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    res.status(200).json({ok: true});
  } catch (e) {
    logger.error("scheduledLessonsCancel failed", e);
    res.status(500).json({error: "Failed"});
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADMIN: tutor students + per-student lesson listings
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function requireSuperAdmin(req, res) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return null; }
  const db = getFirestore();
  const u = await db.collection("users").doc(uid).get();
  const role = u.exists ? u.data().role : null;
  // The /admin layout gates on (admin || super_admin), so functions accessed
  // from there should match — previously we required super_admin only, which
  // caused 403s for plain admin users that the browser surfaced as
  // "Failed to fetch" (because error responses didn't carry CORS headers).
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({error: "Forbidden"});
    return null;
  }
  return uid;
}

exports.adminListTutorStudents = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await requireSuperAdmin(req, res))) return;
  try {
    const db = getFirestore();

    // Read all tutor_students profiles
    const profilesSnap = await db.collection("tutor_students").get();
    const profiles = {};
    profilesSnap.forEach((d) => { profiles[d.id] = d.data(); });

    // Aggregate lessons
    const lessonsSnap = await db.collection("lessons").get();
    const byStudent = {};
    lessonsSnap.forEach((d) => {
      const data = d.data();
      const uid = data.ownerId || "unknown";
      if (!byStudent[uid]) byStudent[uid] = {uid, lessons: 0, minutes: 0, cost: 0, lastAt: null};
      byStudent[uid].lessons += 1;
      byStudent[uid].minutes += Math.round((data.durationSec || 0) / 60);
      byStudent[uid].cost += data.cost || 0;
      const at = data.createdAt?.toDate?.()?.toISOString() || null;
      if (at && (!byStudent[uid].lastAt || at > byStudent[uid].lastAt)) byStudent[uid].lastAt = at;
    });

    // Merge with profiles + resolve auth emails
    const ids = new Set([...Object.keys(byStudent), ...Object.keys(profiles)]);
    const rows = [];
    for (const uid of ids) {
      let email = uid;
      try { const u = await admin.auth().getUser(uid); email = u.email || uid; } catch {}
      const p = profiles[uid] || {};
      const s = byStudent[uid] || {lessons: 0, minutes: 0, cost: 0, lastAt: null};
      rows.push({
        uid,
        email,
        level: p.level || null,
        placementDone: !!p.placementExamCompleted,
        lessons: s.lessons,
        minutes: s.minutes,
        cost: +s.cost.toFixed(4),
        lastAt: s.lastAt,
        vocabularyCount: (p.vocabularyIntroduced || []).length,
      });
    }
    rows.sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""));

    res.status(200).json({students: rows});
  } catch (e) {
    logger.error("adminListTutorStudents failed", e);
    res.status(500).json({error: "Failed"});
  }
});

exports.adminListStudentLessons = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await requireSuperAdmin(req, res))) return;
  try {
    const studentUid = req.query.studentUid || req.query.uid;
    if (!studentUid) { res.status(400).json({error: "studentUid required"}); return; }
    const db = getFirestore();
    const snap = await db.collection("lessons")
      .where("ownerId", "==", String(studentUid))
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        level: data.level,
        theme: data.theme,
        moduleId: data.moduleId,
        topic: data.topic,
        mode: data.mode || "lesson",
        durationSec: data.durationSec,
        correctionsCount: (data.corrections || []).length,
        vocabularyCount: (data.vocabulary || []).length,
        drillsCount: (data.pronunciationDrills || []).length,
        cost: data.cost || 0,
        realtimeInputSec: data.realtimeInputSec || 0,
        realtimeOutputSec: data.realtimeOutputSec || 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    res.status(200).json({lessons: items});
  } catch (e) {
    logger.error("adminListStudentLessons failed", e);
    res.status(500).json({error: "Failed"});
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// tutorKnowledgeDelete
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.tutorKnowledgeDelete = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const title = (body.title || "").toString();
    if (!title) { res.status(400).json({error: "title required"}); return; }
    const db = getFirestore();
    const snap = await db.collection("tutor_knowledge_chunks")
      .where("studentUid", "==", uid).where("title", "==", title).get();
    const batch = db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
    res.status(200).json({ok: true, deleted: snap.size});
  } catch (e) {
    logger.error("tutorKnowledgeDelete failed", e);
    res.status(500).json({error: "Failed"});
  }
});
