const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const _NLPEARL_TOKEN_SECRET = defineSecret("NLPEARL_API_TOKEN");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");

const {
  safeJsonParse,
  buildSuccessResponse,
  buildNotFoundResponse,
  generateId,
} = require("./workflow_utils");

const {
  sanitizeObject,
  applyRateLimit,
  handleCorsSafe,
  setCorsHeadersSafe,
  isValidPhone,
  validateRequired,
  extractUidFromRequest,
  getUserDoc,
} = require("./security_utils");

const axios = require("axios");
const {logActivity} = require("./audit_service");
const {logAnomaly} = require("./anomaly_service");
const {captureError} = require("./observability.js");   // no-op unless SENTRY_DSN set
const toolExec = require("./tool_executor.js");          // sandbox: execute custom API tools
const {checkPlanLimit} = require("./subscription_service");
const asteriskService    = require("./asterisk_service");
const voximplantService  = require("./voximplant_service");
const scenarioEngine = require("./scenario_engine");
const llmService = require("./llm_service");
const deepgramService = require("./deepgram_service");

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const {getKnowledgeContext} = require("./knowledge_service");

const REGION = "us-central1";
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

// CORS configuration for Firebase Functions v2
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// CORS configuration (for manual handling in webhooks)
const ALLOWED_ORIGINS = [
  "https://voiceflow-ai-202509231639.web.app",
  "https://voiceflow-ai-202509231639.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5000",
];

function setCorsHeaders(req, res) {
  // Delegate to hardened CORS handler from security_utils
  // No wildcard fallback â€“ unknown origins are blocked
  return setCorsHeadersSafe(req, res);
}

// Multi-language messages support
const MESSAGES = {
  "he-IL": {
    defaultGreeting: "××”×œ×Ÿ! ×ž×” × ×©×ž×¢? ××™×š ××¤×©×¨ ×œ×¢×–×•×¨?",
    askAvailability: "× ×•×— ×œ×“×‘×¨ ×¢×›×©×™×•?",
    didNotHear: "×œ× ×©×ž×¢×ª×™, ××¤×©×¨ ×œ×—×–×•×¨ ×¢×œ ×–×”?",
    noResponse: "××™×Ÿ ×‘×¢×™×”, × ×™×¦×•×¨ ×§×©×¨ ×‘×–×ž×Ÿ ××—×¨. ×™×•× ×˜×•×‘!",
    positiveResponse: "×ž×¢×•×œ×”! × ×—×–×•×¨ ××œ×™×š ×‘×”×§×“×. ×™×•× ×˜×•×‘!",
    negativeResponse: "×”×‘× ×ª×™, ××™×Ÿ ×‘×¢×™×”. ××¤×©×¨ ×œ×™×¦×•×¨ ×§×©×¨ ×ž×ª×™ ×©× ×•×—. ×™×•× ×˜×•×‘!",
    unclearResponse: "××•×§×™×™, × ×—×–×•×¨ ××œ×™×š ×‘×§×¨×•×‘. ×™×•× ×˜×•×‘!",
    thankYouGoodbye: "×ª×•×“×”, ×™×•× ×˜×•×‘!",
    errorOccurred: "×¨×’×¢, ×ž×©×”×• ×”×©×ª×‘×©. ××¤×©×¨ ×œ× ×¡×•×ª ×©×•×‘ ××—×¨ ×›×š.",
    sessionNotFound: "×œ× ×ž×¦××ª×™ ××ª ×”×©×™×—×”. ×œ×”×ª×¨××•×ª.",
    scenarioNotFound: "×ž×©×”×• ×œ× ×¢×‘×“. ×œ×”×ª×¨××•×ª.",
    flowError: "×”×™×™×ª×” ×ª×§×œ×”. ×œ×”×ª×¨××•×ª.",
    contactSupport: "××”×œ×Ÿ, ×œ× ×”×¦×œ×—×ª×™ ×œ×ž×¦×•× ××ª ×¤×¨×˜×™ ×”×©×™×—×”. ×›×“××™ ×œ×™×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.",
    assistantNotFound: "××”×œ×Ÿ, ×œ× ×”×¦×œ×—×ª×™ ×œ×˜×¢×•×Ÿ ××ª ×”×ž×™×“×¢. ×œ×”×ª×¨××•×ª.",
    willBeInTouch: "×ª×•×“×”! × ×™×¦×•×¨ ×§×©×¨ ×‘×§×¨×•×‘. ×™×•× ×˜×•×‘!",
  },
  "he": {
    defaultGreeting: "××”×œ×Ÿ! ×ž×” × ×©×ž×¢? ××™×š ××¤×©×¨ ×œ×¢×–×•×¨?",
    askAvailability: "× ×•×— ×œ×“×‘×¨ ×¢×›×©×™×•?",
    didNotHear: "×œ× ×©×ž×¢×ª×™, ××¤×©×¨ ×œ×—×–×•×¨ ×¢×œ ×–×”?",
    noResponse: "××™×Ÿ ×‘×¢×™×”, × ×™×¦×•×¨ ×§×©×¨ ×‘×–×ž×Ÿ ××—×¨. ×™×•× ×˜×•×‘!",
    positiveResponse: "×ž×¢×•×œ×”! × ×—×–×•×¨ ××œ×™×š ×‘×”×§×“×. ×™×•× ×˜×•×‘!",
    negativeResponse: "×”×‘× ×ª×™, ××™×Ÿ ×‘×¢×™×”. ××¤×©×¨ ×œ×™×¦×•×¨ ×§×©×¨ ×ž×ª×™ ×©× ×•×—. ×™×•× ×˜×•×‘!",
    unclearResponse: "××•×§×™×™, × ×—×–×•×¨ ××œ×™×š ×‘×§×¨×•×‘. ×™×•× ×˜×•×‘!",
    thankYouGoodbye: "×ª×•×“×”, ×™×•× ×˜×•×‘!",
    errorOccurred: "×¨×’×¢, ×ž×©×”×• ×”×©×ª×‘×©. ××¤×©×¨ ×œ× ×¡×•×ª ×©×•×‘ ××—×¨ ×›×š.",
    sessionNotFound: "×œ× ×ž×¦××ª×™ ××ª ×”×©×™×—×”. ×œ×”×ª×¨××•×ª.",
    scenarioNotFound: "×ž×©×”×• ×œ× ×¢×‘×“. ×œ×”×ª×¨××•×ª.",
    flowError: "×”×™×™×ª×” ×ª×§×œ×”. ×œ×”×ª×¨××•×ª.",
    contactSupport: "××”×œ×Ÿ, ×œ× ×”×¦×œ×—×ª×™ ×œ×ž×¦×•× ××ª ×¤×¨×˜×™ ×”×©×™×—×”. ×›×“××™ ×œ×™×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.",
    assistantNotFound: "××”×œ×Ÿ, ×œ× ×”×¦×œ×—×ª×™ ×œ×˜×¢×•×Ÿ ××ª ×”×ž×™×“×¢. ×œ×”×ª×¨××•×ª.",
    willBeInTouch: "×ª×•×“×”! × ×™×¦×•×¨ ×§×©×¨ ×‘×§×¨×•×‘. ×™×•× ×˜×•×‘!",
  },
  "en-US": {
    defaultGreeting: "Hey there! Thanks for calling. How can I help you today?",
    askAvailability: "Hey, is this a good time to chat for a minute?",
    didNotHear: "Sorry, I didn't quite catch that â€” could you say it again?",
    noResponse: "No worries at all! We'll reach out again soon. Have a great day!",
    positiveResponse: "Awesome! One of our team members will give you a call shortly. Have a great day!",
    negativeResponse: "Totally understand. Thanks for your time â€” feel free to reach out whenever you're ready!",
    unclearResponse: "Got it, thanks! We'll have someone follow up with you soon.",
    thankYouGoodbye: "Thanks so much. Take care!",
    errorOccurred: "Hmm, something went wrong on our end. Please try again in a bit.",
    sessionNotFound: "Hmm, we couldn't find your session. Goodbye.",
    scenarioNotFound: "Something went wrong with the call flow. Goodbye.",
    flowError: "We ran into an issue. Goodbye.",
    contactSupport: "Hey, we had trouble pulling up your call. Please reach out to our support team.",
    assistantNotFound: "Hey, we couldn't load the right assistant for this call. Goodbye.",
    willBeInTouch: "Great talking with you! We'll be in touch soon.",
  },
  "en": {
    defaultGreeting: "Hey there! Thanks for calling. How can I help you today?",
    askAvailability: "Hey, is this a good time to chat for a minute?",
    didNotHear: "Sorry, I didn't quite catch that â€” could you say it again?",
    noResponse: "No worries at all! We'll reach out again soon. Have a great day!",
    positiveResponse: "Awesome! One of our team members will give you a call shortly. Have a great day!",
    negativeResponse: "Totally understand. Thanks for your time â€” feel free to reach out whenever you're ready!",
    unclearResponse: "Thank you for your response. We will have someone reach out to you soon. Have a great day!",
    thankYouGoodbye: "Thank you for your time. Goodbye.",
    errorOccurred: "An error occurred. Please try again later.",
    sessionNotFound: "Session not found. Goodbye.",
    scenarioNotFound: "Scenario not found. Goodbye.",
    flowError: "Flow error. Goodbye.",
    contactSupport: "Hello. We could not locate your call session. Please contact support.",
    assistantNotFound: "Hello. We could not locate your assistant information. Goodbye.",
    willBeInTouch: "Thank you for your time. We will be in touch. Goodbye.",
  },
  "ar": {
    defaultGreeting: "Ù…Ø±Ø­Ø¨Ø§Ù‹ØŒ Ù‡Ø°Ø§ Ù‡Ùˆ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ. Ø´ÙƒØ±Ø§Ù‹ Ù„Ø±Ø¯Ùƒ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙƒØ§Ù„Ù…Ø©.",
    askAvailability: "Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ§Ø­ Ù„Ù„ØªØ­Ø¯Ø« Ù…Ø¹Ù†Ø§ØŸ ÙŠØ±Ø¬Ù‰ Ù‚ÙˆÙ„ Ù†Ø¹Ù… Ø£Ùˆ Ù„Ø§.",
    didNotHear: "Ø¹Ø°Ø±Ø§Ù‹ØŒ Ù„Ù… Ø£Ø³Ù…Ø¹Ùƒ. Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„ØªÙƒØ±Ø§Ø± Ù…Ù† ÙØ¶Ù„ÙƒØŸ",
    noResponse: "Ù„Ø§ Ù…Ø´ÙƒÙ„Ø©. Ø³Ù†ØªÙˆØ§ØµÙ„ Ù…Ø¹Ùƒ Ù‚Ø±ÙŠØ¨Ø§Ù‹. ÙŠÙˆÙ… Ø³Ø¹ÙŠØ¯!",
    positiveResponse: "Ø±Ø§Ø¦Ø¹! Ø´ÙƒØ±Ø§Ù‹ Ù„Ø§Ù‡ØªÙ…Ø§Ù…Ùƒ. Ø£Ø­Ø¯ Ø£Ø¹Ø¶Ø§Ø¡ ÙØ±ÙŠÙ‚Ù†Ø§ Ø³ÙŠØªØµÙ„ Ø¨Ùƒ Ù‚Ø±ÙŠØ¨Ø§Ù‹ Ù„Ù…Ø³Ø§Ø¹Ø¯ØªÙƒ Ø£ÙƒØ«Ø±. ÙŠÙˆÙ… Ø±Ø§Ø¦Ø¹!",
    negativeResponse: "Ø£ÙÙ‡Ù…. Ø´ÙƒØ±Ø§Ù‹ Ù„ÙˆÙ‚ØªÙƒ. Ø¥Ø°Ø§ ØºÙŠØ±Øª Ø±Ø£ÙŠÙƒØŒ Ù„Ø§ ØªØªØ±Ø¯Ø¯ ÙÙŠ Ø§Ù„ØªÙˆØ§ØµÙ„ Ù…Ø¹Ù†Ø§. ÙŠÙˆÙ… Ø³Ø¹ÙŠØ¯!",
    unclearResponse: "Ø´ÙƒØ±Ø§Ù‹ Ù„Ø±Ø¯Ùƒ. Ø³ÙŠØªÙˆØ§ØµÙ„ Ù…Ø¹Ùƒ Ø£Ø­Ø¯ Ù…Ù† ÙØ±ÙŠÙ‚Ù†Ø§ Ù‚Ø±ÙŠØ¨Ø§Ù‹. ÙŠÙˆÙ… Ø³Ø¹ÙŠØ¯!",
    thankYouGoodbye: "Ø´ÙƒØ±Ø§Ù‹ Ù„ÙˆÙ‚ØªÙƒ. ÙˆØ¯Ø§Ø¹Ø§Ù‹.",
    errorOccurred: "Ø­Ø¯Ø« Ø®Ø·Ø£. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ù„Ø§Ø­Ù‚Ø§Ù‹.",
    sessionNotFound: "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø¬Ù„Ø³Ø© Ø§Ù„Ù…ÙƒØ§Ù„Ù…Ø©. ÙˆØ¯Ø§Ø¹Ø§Ù‹.",
    scenarioNotFound: "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ. ÙˆØ¯Ø§Ø¹Ø§Ù‹.",
    flowError: "Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ. ÙˆØ¯Ø§Ø¹Ø§Ù‹.",
    contactSupport: "Ù…Ø±Ø­Ø¨Ø§Ù‹. Ù„Ù… Ù†ØªÙ…ÙƒÙ† Ù…Ù† ØªØ­Ø¯ÙŠØ¯ Ù…ÙƒØ§Ù„Ù…ØªÙƒ. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø¯Ø¹Ù….",
    assistantNotFound: "Ù…Ø±Ø­Ø¨Ø§Ù‹. Ù„Ù… Ù†ØªÙ…ÙƒÙ† Ù…Ù† ØªØ­Ø¯ÙŠØ¯ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯. ÙˆØ¯Ø§Ø¹Ø§Ù‹.",
    willBeInTouch: "Ø´ÙƒØ±Ø§Ù‹ Ù„ÙˆÙ‚ØªÙƒ. Ø³Ù†ØªÙˆØ§ØµÙ„ Ù…Ø¹Ùƒ Ù‚Ø±ÙŠØ¨Ø§Ù‹. ÙˆØ¯Ø§Ø¹Ø§Ù‹.",
  },
  "el-GR": {
    defaultGreeting: "Î“ÎµÎ¹Î± ÏƒÎ±Ï‚! Î ÏŽÏ‚ Î¼Ï€Î¿ÏÏŽ Î½Î± ÏƒÎ±Ï‚ Î²Î¿Î·Î¸Î®ÏƒÏ‰;",
    askAvailability: "Î•Î¯Î½Î±Î¹ ÎºÎ±Î»Î® ÏƒÏ„Î¹Î³Î¼Î® Î³Î¹Î± Î½Î± Î¼Î¹Î»Î®ÏƒÎ¿Ï…Î¼Îµ;",
    didNotHear: "Î£Ï…Î³Î³Î½ÏŽÎ¼Î·, Î´ÎµÎ½ ÏƒÎ±Ï‚ Î¬ÎºÎ¿Ï…ÏƒÎ±. ÎœÏ€Î¿ÏÎµÎ¯Ï„Îµ Î½Î± Ï„Î¿ ÎµÏ€Î±Î½Î±Î»Î¬Î²ÎµÏ„Îµ;",
    noResponse: "ÎšÎ±Î½Î­Î½Î± Ï€ÏÏŒÎ²Î»Î·Î¼Î±! Î˜Î± ÎµÏ€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÎ¿Ï…Î¼Îµ Î¼Î±Î¶Î¯ ÏƒÎ±Ï‚ ÏƒÏÎ½Ï„Î¿Î¼Î±. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    positiveResponse: "Î¥Ï€Î­ÏÎ¿Ï‡Î±! ÎˆÎ½Î± Î¼Î­Î»Î¿Ï‚ Ï„Î·Ï‚ Î¿Î¼Î¬Î´Î±Ï‚ Î¼Î±Ï‚ Î¸Î± ÏƒÎ±Ï‚ ÎºÎ±Î»Î­ÏƒÎµÎ¹ ÏƒÏÎ½Ï„Î¿Î¼Î±. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    negativeResponse: "ÎšÎ±Ï„Î±Î»Î±Î²Î±Î¯Î½Ï‰. Î•Ï€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÏ„Îµ Î¼Î±Î¶Î¯ Î¼Î±Ï‚ ÏŒÏ€Î¿Ï„Îµ Î¸Î­Î»ÎµÏ„Îµ. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    unclearResponse: "Î•Ï…Ï‡Î±ÏÎ¹ÏƒÏ„ÏŽ! Î˜Î± ÎµÏ€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÎ¿Ï…Î¼Îµ Î¼Î±Î¶Î¯ ÏƒÎ±Ï‚ ÏƒÏÎ½Ï„Î¿Î¼Î±.",
    thankYouGoodbye: "Î•Ï…Ï‡Î±ÏÎ¹ÏƒÏ„ÏŽ. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    errorOccurred: "ÎšÎ¬Ï„Î¹ Ï€Î®Î³Îµ ÏƒÏ„ÏÎ±Î²Î¬. Î Î±ÏÎ±ÎºÎ±Î»ÏŽ Î´Î¿ÎºÎ¹Î¼Î¬ÏƒÏ„Îµ Î¾Î±Î½Î¬ Î±ÏÎ³ÏŒÏ„ÎµÏÎ±.",
    sessionNotFound: "Î— ÏƒÏ…Î½ÎµÎ´ÏÎ¯Î± Î´Îµ Î²ÏÎ­Î¸Î·ÎºÎµ. Î‘Î½Ï„Î¯Î¿.",
    scenarioNotFound: "ÎšÎ¬Ï„Î¹ Ï€Î®Î³Îµ Î»Î¬Î¸Î¿Ï‚ Î¼Îµ Ï„Î· ÏÎ¿Î®. Î‘Î½Ï„Î¯Î¿.",
    flowError: "Î Î±ÏÎ¿Ï…ÏƒÎ¹Î¬ÏƒÏ„Î·ÎºÎµ ÏƒÏ†Î¬Î»Î¼Î±. Î‘Î½Ï„Î¯Î¿.",
    contactSupport: "Î“ÎµÎ¹Î± ÏƒÎ±Ï‚. Î”Îµ Î¼Ï€Î¿ÏÎ­ÏƒÎ±Î¼Îµ Î½Î± ÎµÎ½Ï„Î¿Ï€Î¯ÏƒÎ¿Ï…Î¼Îµ Ï„Î·Î½ ÎºÎ»Î®ÏƒÎ· ÏƒÎ±Ï‚. Î•Ï€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÏ„Îµ Î¼Îµ Ï„Î·Î½ Ï…Ï€Î¿ÏƒÏ„Î®ÏÎ¹Î¾Î·.",
    assistantNotFound: "Î“ÎµÎ¹Î± ÏƒÎ±Ï‚. Î”Îµ Î¼Ï€Î¿ÏÎ­ÏƒÎ±Î¼Îµ Î½Î± Ï†Î¿ÏÏ„ÏŽÏƒÎ¿Ï…Î¼Îµ Ï„Î¿Î½ Î²Î¿Î·Î¸ÏŒ. Î‘Î½Ï„Î¯Î¿.",
    willBeInTouch: "Î•Ï…Ï‡Î±ÏÎ¹ÏƒÏ„ÏŽ! Î˜Î± ÎµÏ€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÎ¿Ï…Î¼Îµ Î¼Î±Î¶Î¯ ÏƒÎ±Ï‚ ÏƒÏÎ½Ï„Î¿Î¼Î±. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
  },
  "el": {
    defaultGreeting: "Î“ÎµÎ¹Î± ÏƒÎ±Ï‚! Î ÏŽÏ‚ Î¼Ï€Î¿ÏÏŽ Î½Î± ÏƒÎ±Ï‚ Î²Î¿Î·Î¸Î®ÏƒÏ‰;",
    askAvailability: "Î•Î¯Î½Î±Î¹ ÎºÎ±Î»Î® ÏƒÏ„Î¹Î³Î¼Î® Î³Î¹Î± Î½Î± Î¼Î¹Î»Î®ÏƒÎ¿Ï…Î¼Îµ;",
    didNotHear: "Î£Ï…Î³Î³Î½ÏŽÎ¼Î·, Î´ÎµÎ½ ÏƒÎ±Ï‚ Î¬ÎºÎ¿Ï…ÏƒÎ±. ÎœÏ€Î¿ÏÎµÎ¯Ï„Îµ Î½Î± Ï„Î¿ ÎµÏ€Î±Î½Î±Î»Î¬Î²ÎµÏ„Îµ;",
    noResponse: "ÎšÎ±Î½Î­Î½Î± Ï€ÏÏŒÎ²Î»Î·Î¼Î±! Î˜Î± ÎµÏ€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÎ¿Ï…Î¼Îµ Î¼Î±Î¶Î¯ ÏƒÎ±Ï‚ ÏƒÏÎ½Ï„Î¿Î¼Î±. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    positiveResponse: "Î¥Ï€Î­ÏÎ¿Ï‡Î±! ÎˆÎ½Î± Î¼Î­Î»Î¿Ï‚ Ï„Î·Ï‚ Î¿Î¼Î¬Î´Î±Ï‚ Î¼Î±Ï‚ Î¸Î± ÏƒÎ±Ï‚ ÎºÎ±Î»Î­ÏƒÎµÎ¹ ÏƒÏÎ½Ï„Î¿Î¼Î±. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    negativeResponse: "ÎšÎ±Ï„Î±Î»Î±Î²Î±Î¯Î½Ï‰. Î•Ï€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÏ„Îµ Î¼Î±Î¶Î¯ Î¼Î±Ï‚ ÏŒÏ€Î¿Ï„Îµ Î¸Î­Î»ÎµÏ„Îµ. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    unclearResponse: "Î•Ï…Ï‡Î±ÏÎ¹ÏƒÏ„ÏŽ! Î˜Î± ÎµÏ€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÎ¿Ï…Î¼Îµ Î¼Î±Î¶Î¯ ÏƒÎ±Ï‚ ÏƒÏÎ½Ï„Î¿Î¼Î±.",
    thankYouGoodbye: "Î•Ï…Ï‡Î±ÏÎ¹ÏƒÏ„ÏŽ. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
    errorOccurred: "ÎšÎ¬Ï„Î¹ Ï€Î®Î³Îµ ÏƒÏ„ÏÎ±Î²Î¬. Î Î±ÏÎ±ÎºÎ±Î»ÏŽ Î´Î¿ÎºÎ¹Î¼Î¬ÏƒÏ„Îµ Î¾Î±Î½Î¬ Î±ÏÎ³ÏŒÏ„ÎµÏÎ±.",
    sessionNotFound: "Î— ÏƒÏ…Î½ÎµÎ´ÏÎ¯Î± Î´Îµ Î²ÏÎ­Î¸Î·ÎºÎµ. Î‘Î½Ï„Î¯Î¿.",
    scenarioNotFound: "ÎšÎ¬Ï„Î¹ Ï€Î®Î³Îµ Î»Î¬Î¸Î¿Ï‚ Î¼Îµ Ï„Î· ÏÎ¿Î®. Î‘Î½Ï„Î¯Î¿.",
    flowError: "Î Î±ÏÎ¿Ï…ÏƒÎ¹Î¬ÏƒÏ„Î·ÎºÎµ ÏƒÏ†Î¬Î»Î¼Î±. Î‘Î½Ï„Î¯Î¿.",
    contactSupport: "Î“ÎµÎ¹Î± ÏƒÎ±Ï‚. Î”Îµ Î¼Ï€Î¿ÏÎ­ÏƒÎ±Î¼Îµ Î½Î± ÎµÎ½Ï„Î¿Ï€Î¯ÏƒÎ¿Ï…Î¼Îµ Ï„Î·Î½ ÎºÎ»Î®ÏƒÎ· ÏƒÎ±Ï‚. Î•Ï€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÏ„Îµ Î¼Îµ Ï„Î·Î½ Ï…Ï€Î¿ÏƒÏ„Î®ÏÎ¹Î¾Î·.",
    assistantNotFound: "Î“ÎµÎ¹Î± ÏƒÎ±Ï‚. Î”Îµ Î¼Ï€Î¿ÏÎ­ÏƒÎ±Î¼Îµ Î½Î± Ï†Î¿ÏÏ„ÏŽÏƒÎ¿Ï…Î¼Îµ Ï„Î¿Î½ Î²Î¿Î·Î¸ÏŒ. Î‘Î½Ï„Î¯Î¿.",
    willBeInTouch: "Î•Ï…Ï‡Î±ÏÎ¹ÏƒÏ„ÏŽ! Î˜Î± ÎµÏ€Î¹ÎºÎ¿Î¹Î½Ï‰Î½Î®ÏƒÎ¿Ï…Î¼Îµ Î¼Î±Î¶Î¯ ÏƒÎ±Ï‚ ÏƒÏÎ½Ï„Î¿Î¼Î±. ÎšÎ±Î»Î® Î¼Î­ÏÎ±!",
  },
  "zu-ZA": {
    defaultGreeting: "Sawubona! Ngingakusiza kanjani?",
    askAvailability: "Ingabe isikhathi esihle manje ukukhuluma?",
    didNotHear: "Uxolo, angizwanga. Ungakuphinda lokho?",
    noResponse: "Kulungile! Sizoxhumana nawe maduze. Sala kahle!",
    positiveResponse: "Kuhle kakhulu! Umuntu wethu uzokushayela maduze. Sala kahle!",
    negativeResponse: "Ngiyakuqonda. Siyabonga isikhathi sakho. Sala kahle!",
    unclearResponse: "Siyabonga! Sizoxhumana nawe maduze.",
    thankYouGoodbye: "Siyabonga. Sala kahle!",
    errorOccurred: "Kukhona iphutha. Sicela uzame futhi kamuva.",
    sessionNotFound: "Asitholanga iseshini yakho. Sala kahle.",
    scenarioNotFound: "Kukhona inkinga enkathini. Sala kahle.",
    flowError: "Kukhona iphutha. Sala kahle.",
    contactSupport: "Sawubona. Asikwazanga ukuthola imininingwane yakho. Xhumana nensizakalo.",
    assistantNotFound: "Sawubona. Asikwazanga ukulayisha umsizi. Sala kahle.",
    willBeInTouch: "Siyabonga! Sizoxhumana nawe maduze. Sala kahle!",
  },
  "af-ZA": {
    defaultGreeting: "Hallo! Hoe kan ek jou help?",
    askAvailability: "Is dit 'n goeie tyd om te praat?",
    didNotHear: "Jammer, ek het dit nie gehoor nie. Kan jy dit herhaal?",
    noResponse: "Geen probleem! Ons sal gou weer kontak maak. Totsiens!",
    positiveResponse: "Uitstekend! Een van ons spanlede sal jou binnekort skakel. Totsiens!",
    negativeResponse: "Ek verstaan. Dankie vir jou tyd. Voel vry om te kontak wanneer jy gereed is. Totsiens!",
    unclearResponse: "Dankie! Ons sal binnekort iemand stuur om op te volg.",
    thankYouGoodbye: "Baie dankie. Totsiens!",
    errorOccurred: "Iets het verkeerd gegaan. Probeer asseblief later weer.",
    sessionNotFound: "Sessie nie gevind nie. Totsiens.",
    scenarioNotFound: "Iets het verkeerd gegaan met die vloei. Totsiens.",
    flowError: "Daar was 'n fout. Totsiens.",
    contactSupport: "Hallo. Ons kon nie jou oproep vind nie. Kontak asseblief ondersteuning.",
    assistantNotFound: "Hallo. Ons kon nie die assistent laai nie. Totsiens.",
    willBeInTouch: "Dankie! Ons sal binnekort kontak maak. Totsiens!",
  },
};

// Default voices by language (Google Cloud TTS via Twilio)
// Neural2 NOT available for Hebrew on Twilio â€” causes APPLICATION ERROR.
// Using WaveNet which is the best available. Hebrew male: B, D
const DEFAULT_VOICES = {
  "he": "Google.he-IL-Wavenet-D",
  "he-IL": "Google.he-IL-Wavenet-D",
  "en": "Google.en-US-Neural2-F",
  "en-US": "Google.en-US-Neural2-F",
  "en-GB": "Google.en-GB-Neural2-A",
  "en-AU": "Google.en-AU-Neural2-A",
  "en-ZA": "Google.en-ZA-Standard-A",
  "ar": "Google.ar-XA-Wavenet-A",
  "ar-XA": "Google.ar-XA-Wavenet-A",
  "el": "Google.el-GR-Wavenet-A",
  "el-GR": "Google.el-GR-Wavenet-A",
  // Afrikaans â€” Google has native af-ZA voices (Twilio supports af-ZA tag)
  "af": "Google.af-ZA-Standard-B",
  "af-ZA": "Google.af-ZA-Standard-B",
  // isiZulu â€” no native Google/Polly Twilio voice; fall back to SA English TTS
  // (Realtime/V2V mode is strongly recommended for Zulu â€” the OpenAI model speaks Zulu natively)
  "zu": "Google.en-ZA-Standard-A",
  "zu-ZA": "Google.en-ZA-Standard-A",
};

// Default Hebrew voice (male WaveNet-D â€” best available on Twilio for Hebrew)
const DEFAULT_HEBREW_VOICE = "Google.he-IL-Wavenet-D";
// Default English voice â€” Neural2-F (female, most natural, available on Twilio for English)
const DEFAULT_ENGLISH_VOICE = "Google.en-US-Neural2-F";

/**
 * Strip nikud (Hebrew diacritical marks) from text.
 * Google WaveNet is trained on non-vocalized Hebrew â€” nikud confuses it.
 * Also strips SSML tags if present from previous versions.
 * @param {string} text - Text that may contain nikud
 * @returns {string} Clean text without nikud
 */
function cleanHebrewText(text) {
  if (!text) return text;
  // Strip Hebrew nikud Unicode range (U+0591â€“U+05C7)
  return text.replace(/[\u0591-\u05C7]/g, "");
}

// SSML removed â€” made TTS worse. Plain text sounds more natural with WaveNet.
function wrapSSML(text, language) {
  if (!text) return text;
  // Clean nikud from Hebrew text (WaveNet doesn't need it)
  if (language && language.startsWith("he")) {
    return cleanHebrewText(text);
  }
  return text;
}

/**
 * Escape XML special characters for use inside SSML tags.
 */
function escapeXml(str) {
  if (!str) return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Wrap text with SSML prosody tag for speech speed control.
 * @param {string} text - The text to speak
 * @param {number} speed - Speech speed multiplier (1.0 = normal, 1.1 = 110%)
 * @param {string} language - Language code for wrapSSML processing
 * @returns {string} Text optionally wrapped with prosody tag
 */
function applySpeed(text, speed, language) {
  const processed = wrapSSML(text, language);
  if (!speed || speed === 1.0) return processed;
  const rate = Math.round(speed * 100) + "%";
  return `<prosody rate="${rate}">${escapeXml(processed)}</prosody>`;
}

/**
 * Resolve the best TTS voice for the given language.
 *
 * Twilio <Say> only supports two voice families:
 *   â€¢ Amazon Polly  â€“ prefix "Polly."
 *   â€¢ Google Cloud TTS â€“ prefix "Google."
 *
 * Any other voice ID (e.g. OpenAI "alloy", ElevenLabs "rachel", Deepgram
 * "aura-asteria-en", etc.) is NOT a valid Twilio voice and must be replaced
 * with the best available Twilio-compatible voice for the target language.
 *
 * For Hebrew the best quality is Google WaveNet (he-IL-Wavenet-D = male).
 * Polly has NO Hebrew voices, so Polly voices are also swapped when Hebrew.
 *
 * @param {string} voiceId - The voice ID from the assistant definition
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "ar")
 * @returns {string} Twilio-compatible voice ID
 */
function resolveVoiceForLanguage(voiceId, language) {
  if (!language) {
    language = "en-US"; // Default to English
  }

  const lang = language.toLowerCase();
  const isTwilioVoice =
    voiceId && (voiceId.startsWith("Polly.") || voiceId.startsWith("Google."));

  // Check if we have a default voice for this language
  const defaultVoice = DEFAULT_VOICES[lang] || DEFAULT_VOICES[language] || null;

  // If it's a valid Twilio voice and matches the language, keep it
  if (isTwilioVoice) {
    // For Hebrew: only keep Google.he-* voices
    if (lang.startsWith("he") && voiceId.startsWith("Google.") && voiceId.includes("he-IL")) {
      return voiceId;
    }
    // For English: keep Polly or Google.en-* voices
    if (lang.startsWith("en") && (voiceId.startsWith("Polly.") || (voiceId.startsWith("Google.") && voiceId.includes("en-")))) {
      return voiceId;
    }
    // For Arabic: keep Google.ar-* voices
    if (lang.startsWith("ar") && voiceId.startsWith("Google.") && voiceId.includes("ar-")) {
      return voiceId;
    }
    // For Greek: keep Google.el-* voices
    if (lang.startsWith("el") && voiceId.startsWith("Google.") && voiceId.includes("el-")) {
      return voiceId;
    }
    // For Afrikaans: keep Google.af-* voices
    if (lang.startsWith("af") && voiceId.startsWith("Google.") && voiceId.includes("af-")) {
      return voiceId;
    }
    // For SA English: keep Google.en-ZA-* voices
    if (lang === "en-za" && voiceId.startsWith("Google.") && voiceId.includes("en-ZA")) {
      return voiceId;
    }
    // For isiZulu: no native Twilio voice â€” fall through to default (SA English TTS)
    // For other languages, if it's a valid Twilio voice, keep it
    if (!lang.startsWith("he") && !lang.startsWith("en") && !lang.startsWith("ar") && !lang.startsWith("el") && !lang.startsWith("af") && !lang.startsWith("zu")) {
      return voiceId;
    }
  }

  // Use default voice for the language, or fallback
  if (defaultVoice) {
    return defaultVoice;
  }

  // Fallback based on language
  if (lang.startsWith("he")) {
    return DEFAULT_HEBREW_VOICE;
  } else if (lang.startsWith("en")) {
    return DEFAULT_ENGLISH_VOICE;
  } else if (lang.startsWith("ar")) {
    return DEFAULT_VOICES["ar"] || DEFAULT_VOICES["ar-XA"] || DEFAULT_ENGLISH_VOICE;
  }

  // Ultimate fallback to English
  return DEFAULT_ENGLISH_VOICE;
}

// Get message based on language (defaults to English)
function getMessage(key, language = "en-US") {
  if (!language) {
    language = "en-US"; // Default to English
  }

  const lang = language.toLowerCase();
  
  // Try exact match first
  if (MESSAGES[language] && MESSAGES[language][key]) {
    return MESSAGES[language][key];
  }
  
  // Try base language code
  if (lang.startsWith("he")) {
    return MESSAGES["he-IL"]?.[key] || MESSAGES["he"]?.[key] || "";
  } else if (lang.startsWith("en")) {
    return MESSAGES["en-US"]?.[key] || MESSAGES["en"]?.[key] || "";
  } else if (lang.startsWith("ar")) {
    return MESSAGES["ar"]?.[key] || "";
  } else if (lang.startsWith("el")) {
    return MESSAGES["el-GR"]?.[key] || MESSAGES["el"]?.[key] || "";
  }

  // Fallback to English, then Hebrew
  return MESSAGES["en-US"]?.[key] || MESSAGES["he-IL"]?.[key] || "";
}

// Get positive/negative keywords based on language
function getKeywords(language = "en-US") {
  if (!language) {
    language = "en-US"; // Default to English
  }

  const lang = language.toLowerCase();
  
  if (lang.startsWith("he")) {
    return {
      positive: ["×›×Ÿ", "×‘×˜×—", "×ž×¢×•× ×™×™×Ÿ", "×ž×¢×•× ×™×™× ×ª", "×–×ž×™×Ÿ", "×–×ž×™× ×”", "×‘×¡×“×¨", "××•×§×™×™", "yes", "yeah", "sure", "ok", "okay", "available", "interested"],
      negative: ["×œ×", "×¢×¡×•×§", "×¢×¡×•×§×”", "××—×¨ ×›×š", "×œ× ×ž×¢×•× ×™×™×Ÿ", "×œ× ×ž×¢×•× ×™×™× ×ª", "no", "nope", "not", "busy", "later"],
    };
  } else if (lang.startsWith("en")) {
    return {
      positive: ["yes", "yeah", "sure", "ok", "okay", "available", "interested", "absolutely", "definitely", "of course"],
      negative: ["no", "nope", "not", "busy", "later", "not interested", "not available"],
    };
  } else if (lang.startsWith("ar")) {
    return {
      positive: ["Ù†Ø¹Ù…", "Ø¨Ø§Ù„ØªØ£ÙƒÙŠØ¯", "Ù…Ù…ÙƒÙ†", "Ù…ØªØ§Ø­", "Ù…Ù‡ØªÙ…", "Ø­Ø³Ù†Ø§Ù‹", "Ù…ÙˆØ§ÙÙ‚"],
      negative: ["Ù„Ø§", "Ù…Ø´ØºÙˆÙ„", "Ù„Ø§Ø­Ù‚Ø§Ù‹", "ØºÙŠØ± Ù…Ù‡ØªÙ…", "ØºÙŠØ± Ù…ØªØ§Ø­"],
    };
  }
  
  // Default to English
  return {
    positive: ["yes", "yeah", "sure", "ok", "okay", "available", "interested"],
    negative: ["no", "nope", "not", "busy", "later"],
  };
}

function handleCors(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_DEFAULT_FROM = process.env.TWILIO_DEFAULT_FROM;
const TWILIO_VOICE_WEBHOOK =
  process.env.TWILIO_VOICE_WEBHOOK_URL ||
  `${BASE_FUNCTION_URL}/twilioVoiceWebhook`;
const TWILIO_STATUS_WEBHOOK =
  process.env.TWILIO_STATUS_WEBHOOK_URL ||
  `${BASE_FUNCTION_URL}/twilioStatusCallback`;

// ── SIP Bridge (replaces Twilio REST API for call control) ───────────────────
// Set SIP_BRIDGE_URL env var to point at your bridge server (e.g. http://1.2.3.4:3000)
// When set, SIP bridge is tried first; on any failure Twilio is used as fallback.
const SIP_BRIDGE_URL    = process.env.SIP_BRIDGE_URL    || "";
const SIP_BRIDGE_SECRET = process.env.SIP_BRIDGE_SECRET || "";

// Simple in-memory bridge health cache (5-minute TTL) to avoid hammering a dead bridge
let _bridgeHealthy    = true;
let _bridgeCheckedAt  = 0;
const BRIDGE_HEALTH_TTL = 5 * 60 * 1000; // 5 min

async function checkBridgeHealth() {
  const now = Date.now();
  if (now - _bridgeCheckedAt < BRIDGE_HEALTH_TTL) return _bridgeHealthy;
  try {
    const axios = require("axios");
    const r = await axios.get(`${SIP_BRIDGE_URL}/health`, { timeout: 3000 });
    _bridgeHealthy   = r.data?.status === "ok";
    _bridgeCheckedAt = now;
  } catch (_) {
    _bridgeHealthy   = false;
    _bridgeCheckedAt = now;
  }
  if (!_bridgeHealthy) logger.warn("[Bridge] Health check failed — routing via Twilio");
  return _bridgeHealthy;
}

/**
 * Update a live call — replaces twilioClient.calls(callSid).update({twiml/status}).
 * 1. Tries SIP bridge (when SIP_BRIDGE_URL is set and bridge is healthy)
 * 2. Falls back to Twilio on any bridge error
 */
async function updateCall(callSid, params, twilioClientOverride) {
  if (SIP_BRIDGE_URL) {
    // Skip bridge immediately if last health check was bad
    const healthy = await checkBridgeHealth();
    if (healthy) {
      try {
        const axios = require("axios");
        await axios.post(`${SIP_BRIDGE_URL}/calls/${callSid}/update`, params, {
          headers: { "x-bridge-secret": SIP_BRIDGE_SECRET },
          timeout: 10000,
        });
        return; // ✅ bridge handled it
      } catch (bridgeErr) {
        // Mark bridge unhealthy so next call skips straight to Twilio for 5 min
        _bridgeHealthy   = false;
        _bridgeCheckedAt = Date.now();
        logger.warn(`[Bridge] updateCall failed (${bridgeErr.message}) — falling back to Twilio`);
      }
    }
  }
  // Twilio fallback
  const client = twilioClientOverride || twilioClient;
  if (client) {
    await client.calls(callSid).update(params);
    logger.info(`[Twilio] updateCall fallback used for ${callSid}`);
  }
}

const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

function getJsonBody(req) {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    return safeJsonParse(req.body);
  }
  return req.body;
}

/**
 * Replace {{placeholder}} tokens in a message with actual values
 * Supports: {{clientName}}, {{leadName}}, {{name}}, {{assistantName}}, {{companyName}}
 */
function replacePlaceholders(message, data) {
  if (!message || typeof message !== "string") {
    return message || "";
  }
  
  const leadName = data.leadName || data.clientName || data.name || "valued customer";
  const assistantName = data.assistantName || data.assistant?.name || "your assistant";
  const companyName = data.companyName || data.company || "our company";
  
  return message
    .replace(/\{\{clientName\}\}/gi, leadName)
    .replace(/\{\{leadName\}\}/gi, leadName)
    .replace(/\{\{name\}\}/gi, leadName)
    .replace(/\{\{assistantName\}\}/gi, assistantName)
    .replace(/\{\{companyName\}\}/gi, companyName)
    .replace(/\{\{company\}\}/gi, companyName);
}

function requireTwilio(res) {
  if (!twilioClient) {
    res.status(500).json({
      status: "error",
      message:
        "Twilio configuration missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.",
    });
    return false;
  }
  return true;
}

/**
 * Resolve Twilio credentials for a call with 3-tier fallback:
 *  1. Per-company credentials stored on the Company Firestore doc
 *  2. System-level env vars (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)
 *
 * Throws if billing config requires basic users to use own keys and
 * the caller is on the basic plan without company credentials.
 */
async function getEffectiveTwilioCredentials(companyId, uid) {
  const db = getFirestore();

  // 1. Per-company credentials
  if (companyId) {
    try {
      const companyDoc = await db.collection("Company").doc(String(companyId)).get();
      const company = companyDoc.exists ? companyDoc.data() : null;
      if (company?.twilioAccountSid && company?.twilioAuthToken) {
        return {
          sid:   company.twilioAccountSid,
          token: company.twilioAuthToken,
          from:  company.twilioDefaultFrom || TWILIO_DEFAULT_FROM,
          isOwn: true,
        };
      }
    } catch (e) {
      logger.warn("Could not fetch company Twilio credentials", {companyId, error: e.message});
    }
  }

  // 2. Check if billing config requires basic plan users to have own keys
  if (uid) {
    try {
      const [billingSnap, userSnap] = await Promise.all([
        db.collection("config").doc("billing").get(),
        db.collection("users").doc(uid).get(),
      ]);
      const billing = billingSnap.exists ? (billingSnap.data() || {}) : {};
      const plan = userSnap.exists ? (userSnap.data()?.plan || "basic") : "basic";
      if (billing.basicRequiresOwnKeys && plan === "basic") {
        const err = new Error(
          "Basic plan requires your own Twilio API keys. Please add them in Settings â†’ Integrations.",
        );
        err.code = "REQUIRES_OWN_KEYS";
        throw err;
      }
    } catch (e) {
      if (e.code === "REQUIRES_OWN_KEYS") throw e;
      logger.warn("Could not check billing key-requirement config", {uid, error: e.message});
    }
  }

  // 3. Fall back to system-level env vars
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    const err = new Error(
      "Twilio configuration missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.",
    );
    err.code = "TWILIO_NOT_CONFIGURED";
    throw err;
  }
  return {
    sid:   TWILIO_ACCOUNT_SID,
    token: TWILIO_AUTH_TOKEN,
    from:  TWILIO_DEFAULT_FROM,
    isOwn: false,
  };
}

function collectPhoneNumbers(raw) {
  const numbers = new Set();
  const visit = (value) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        numbers.add(trimmed);
      }
    }
  };
  visit(raw);
  return numbers;
}

function flattenPhoneEntries(raw) {
  const entries = [];
  const visit = (value) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      entries.push(value);
    }
  };
  visit(raw);
  return entries;
}

function buildEntryKey(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (entry.id) {
    return `id:${entry.id}`;
  }
  if (entry.phoneNumber) {
    return `phone:${entry.phoneNumber}`;
  }
  return null;
}

function normalizePhoneEntries(rawEntries) {
  const map = new Map();
  const existing = flattenPhoneEntries(rawEntries);
  existing.forEach((entry) => {
    const key = buildEntryKey(entry);
    if (!key) {
      return;
    }
    const current = map.get(key) || {};
    map.set(key, {...current, ...entry});
  });
  return map;
}

function upsertPhoneEntry(rawEntries, incomingEntry) {
  const map = normalizePhoneEntries(rawEntries);
  const key = buildEntryKey(incomingEntry);
  if (key) {
    const current = map.get(key) || {};
    map.set(key, {...current, ...incomingEntry});
  }
  return Array.from(map.values());
}

function removePhoneEntry(rawEntries, {sid, phoneNumber}) {
  const map = normalizePhoneEntries(rawEntries);
  if (sid) {
    map.delete(`id:${sid}`);
  }
  if (phoneNumber) {
    map.delete(`phone:${phoneNumber}`);
  }
  return Array.from(map.values());
}

exports.searchPhoneNumbers = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  // ── Voximplant branch ──────────────────────────────────────────────────
  // When the request asks for Voximplant, search its inventory via the
  // Management API instead of Twilio. Done before requireTwilio so a missing
  // Twilio config doesn't block Voximplant.
  {
    const peek = getJsonBody(req);
    if ((peek.provider || "").toLowerCase() === "voximplant") {
      try {
        const resolved = await voximplantService.resolveVoxConfig(peek.companyId);
        if (!resolved) {
          res.status(400).json({ status: "error", message: "Voximplant is not configured (missing voxAccountId/voxApiKey on the Company doc)." });
          return;
        }
        const { numbers, category, note } = await voximplantService.searchVoxNumbers(resolved.config, {
          country: peek.country || "US",
          category: peek.category,
          regionId: peek.regionId,
          count: typeof peek.limit === "number" ? Math.min(peek.limit, 30) : 20,
        });
        const formatted = numbers.map((n) => ({
          friendlyName: n.phoneNumber,
          phoneNumber: n.phoneNumber,
          phoneId: n.phoneId,
          locality: n.region,
          region: n.region,
          regionId: n.regionId,
          category: n.category,
          isoCountry: n.country,
          monthlyPrice: n.monthlyPrice ? `$${n.monthlyPrice}` : undefined,
          setupPrice: n.setupPrice,
          provider: "voximplant",
        }));
        res.status(200).json({ numbers: formatted, category: category || null, note: note || null });
        return;
      } catch (e) {
        logger.error("Failed to search Voximplant numbers", { message: e.message });
        res.status(500).json({ status: "error", message: e.message || "Failed to search Voximplant numbers" });
        return;
      }
    }
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const country = (payload.country || "US").toUpperCase();
    const limit =
      typeof payload.limit === "number" && payload.limit > 0
        ? Math.min(payload.limit, 20)
        : 10;

    const baseParams = { limit };

    // areaCode is only meaningful for US and CA â€” strip it for all other countries
    // to avoid Twilio rejecting the request with an invalid parameter error.
    const areaCodeCountries = ["US", "CA"];
    if (payload.areaCode && areaCodeCountries.includes(country)) {
      baseParams.areaCode = String(payload.areaCode);
    }

    if (payload.contains) {
      baseParams.contains = String(payload.contains);
    }

    // Try each number type in order until we get results.
    // Different countries expose numbers under different types:
    //   - US/GB/AU: local
    //   - IL/GR/CY: mobile or national
    //   - Some countries: tollFree only
    const numberTypes = ["local", "mobile", "national", "tollFree"];
    let numbers = [];

    for (const type of numberTypes) {
      if (numbers.length > 0) break;
      try {
        numbers = await twilioClient
          .availablePhoneNumbers(country)
          [type].list(baseParams);
      } catch (typeErr) {
        // This type is not supported for the country â€” try the next one
        logger.info(`Number type "${type}" not available for ${country}: ${typeErr.message}`);
      }
    }

    const formatted = numbers.map((number) => ({
      friendlyName: number.friendlyName,
      phoneNumber: number.phoneNumber,
      locality: number.locality,
      region: number.region,
      postalCode: number.postalCode,
      isoCountry: number.isoCountry,
      monthlyPrice: number.beta ? null : undefined,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    logger.error("Failed to search Twilio numbers", {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
    });
    captureError(error, {fn: "searchPhoneNumbers"});
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to search phone numbers",
      twilioCode: error.code || null,
    });
  }
});

exports.purchasePhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  // ── Voximplant branch ──────────────────────────────────────────────────
  {
    const peek = getJsonBody(req);
    if ((peek.provider || "").toLowerCase() === "voximplant") {
      try {
        const resolved = await voximplantService.resolveVoxConfig(peek.companyId);
        if (!resolved) {
          res.status(400).json({ status: "error", message: "Voximplant is not configured (missing voxAccountId/voxApiKey on the Company doc)." });
          return;
        }
        const bought = await voximplantService.buyVoxNumber(resolved.config, {
          phoneNumber: peek.phoneNumber || peek.number,
          phoneId: peek.phoneId,
          country: peek.country,
          category: peek.category,
          regionId: peek.regionId,
        });
        const companyId = peek.companyId || resolved.companyId;
        const assistantId = peek.assistantId || null;
        const friendlyName = peek.friendlyName || "VoiceFlow AI (Voximplant)";

        // Map into the company's phoneNumberMap so inbound DID→assistant routing
        // works (resolveByDid reads this), mirroring the Twilio purchase path.
        if (companyId) {
          const db = getFirestore();
          const companyRef = db.collection("Company").doc(String(companyId));
          try {
            await db.runTransaction(async (trx) => {
              const snapshot = await trx.get(companyRef);
              const data = snapshot.exists ? snapshot.data() : {};
              const currentNumbers = collectPhoneNumbers(data?.companyPhoneNumbers);
              currentNumbers.add(bought.phoneNumber);
              const phoneEntry = {
                id: bought.phoneId || bought.phoneNumber,
                label: "inbound_outbound",
                phoneNumber: bought.phoneNumber,
                provider: "voximplant",
                friendlyName,
              };
              if (assistantId) phoneEntry.assistantId = assistantId;
              const nextEntries = upsertPhoneEntry(data?.phoneNumberMap, phoneEntry);
              trx.set(companyRef, { companyPhoneNumbers: Array.from(currentNumbers), phoneNumberMap: nextEntries }, { merge: true });
            });
          } catch (updateError) {
            logger.error(`Failed to update company phoneNumberMap (Voximplant) for ${companyId}`, updateError);
          }
        }

        // Also write the phone_numbers Firestore doc the Numbers page reads.
        try {
          const db = getFirestore();
          await db.collection("phone_numbers").doc(bought.phoneNumber).set({
            phoneNumber: bought.phoneNumber,
            friendlyName,
            provider: "voximplant",
            voxPhoneId: bought.phoneId || null,
            assistantId: assistantId || null,
            bound: bought.bound,
            sid: null,
          }, { merge: true });
        } catch (e) { logger.warn(`phone_numbers doc write failed: ${e.message}`); }

        res.status(201).json({
          status: "success",
          provider: "voximplant",
          phoneNumber: bought.phoneNumber,
          phoneId: bought.phoneId || null,
          bound: bought.bound,
          note: bought.note || null,
        });
        logActivity({ userId: null, action: "phone.purchase", category: "phone", resourceType: "phone_number", details: { phoneNumber: bought.phoneNumber, provider: "voximplant" } }).catch(() => {});
        return;
      } catch (e) {
        logger.error("Failed to purchase Voximplant number", { message: e.message });
        res.status(500).json({ status: "error", message: e.message || "Failed to purchase Voximplant number" });
        return;
      }
    }
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const phoneNumber = payload.phoneNumber || payload.number;
    if (!phoneNumber) {
      res.status(400).json({
        status: "error",
        message: "phoneNumber is required.",
      });
      return;
    }

    const friendlyName = payload.friendlyName || "VoiceFlow AI";
    const companyId = payload.companyId;
    // FIX (Issue 2 â€” newly purchased number not connected to bot):
    // The purchase flow previously created the Twilio number AND wrote a DB entry
    // for the company's phoneNumberMap, but NEVER stored the assistantId in that
    // entry.  When an inbound call arrives on this number, the matchedEntry has no
    // assistantId, so specificAssistant is always null and the call falls through
    // to company defaults (wrong assistant, wrong language, wrong voice).
    // Accept assistantId in the payload and persist it so inbound routing works
    // as soon as the number is purchased.
    const assistantId = payload.assistantId || null;

    const purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName,
      voiceUrl: TWILIO_VOICE_WEBHOOK,
      voiceMethod: "POST",
      statusCallback: TWILIO_STATUS_WEBHOOK,
      statusCallbackMethod: "POST",
      smsUrl: TWILIO_VOICE_WEBHOOK,
      smsMethod: "POST",
    });

    if (companyId) {
      const db = getFirestore();
      const companyRef = db.collection("Company").doc(String(companyId));
      try {
        await db.runTransaction(async (trx) => {
          const snapshot = await trx.get(companyRef);
          const data = snapshot.exists ? snapshot.data() : {};
          const currentNumbers = collectPhoneNumbers(data?.companyPhoneNumbers);
          currentNumbers.add(purchased.phoneNumber);

          const phoneEntry = {
            id: purchased.sid,
            label: "inbound_outbound",
            phoneNumber: purchased.phoneNumber,
          };
          if (friendlyName) {
            phoneEntry.friendlyName = friendlyName;
          }
          // FIX (Issue 2): persist the assistant mapping so inbound calls are
          // immediately routed to the correct bot.
          if (assistantId) {
            phoneEntry.assistantId = assistantId;
            logger.info(`Linking purchased number ${purchased.phoneNumber} to assistant ${assistantId}`);
          }

          const nextEntries = upsertPhoneEntry(data?.phoneNumberMap, phoneEntry);

          trx.set(
            companyRef,
            {
              companyPhoneNumbers: Array.from(currentNumbers),
              phoneNumberMap: nextEntries,
            },
            {merge: true},
          );
        });
      } catch (updateError) {
        logger.error(
          `Failed to update company phone numbers for company ${companyId}`,
          updateError,
        );
      }
    }

    res.status(201).json({
      status: "success",
      sid: purchased.sid,
      phoneNumber: purchased.phoneNumber,
      friendlyName: purchased.friendlyName,
    });
    logActivity({ userId: null, action: "phone.purchase", category: "phone", resourceType: "phone_number", details: {phoneNumber: purchased.phoneNumber} }).catch(() => {});
  } catch (error) {
    logger.error("Failed to purchase Twilio number", error);
    captureError(error, {fn: "purchasePhoneNumber"});
    res.status(500).json({
      status: "error",
      message: "Failed to purchase phone number",
    });
  }
});

// ── Voximplant credentials config (admin) ───────────────────────────────────
// Stores the Voximplant Management API credentials on the caller's Company doc
// so the buy/search flow (and outbound routing) can use them. Without this
// there is no UI to enter voxAccountId/voxApiKey/voxRuleId, so the buy path
// would always report "not configured".

async function resolveCompanyIdForUid(uid) {
  if (!uid) return null;
  try {
    const db = getFirestore();
    const uSnap = await db.collection("users").doc(uid).get();
    if (uSnap.exists) {
      const ud = uSnap.data();
      return ud.companyId || ud.uid || uid;
    }
  } catch { /* fall through */ }
  return uid;
}

const VOX_CFG_FIELDS = ["voxAccountId", "voxApiKey", "voxRuleId", "voxAppName", "voxApplicationId", "voxCallerId"];

exports.voximplantConfigGet = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({ status: "error", message: "Unauthorized" }); return; }
  try {
    const companyId = await resolveCompanyIdForUid(uid);
    const db = getFirestore();
    const snap = await db.collection("Company").doc(String(companyId)).get();
    const d = snap.exists ? snap.data() : {};
    // Never return the raw API key — only whether it's set + a short suffix.
    res.status(200).json({
      companyId,
      configured: !!(d.voxAccountId && d.voxApiKey && d.voxRuleId),
      voxAccountId: d.voxAccountId || "",
      voxRuleId: d.voxRuleId || "",
      voxAppName: d.voxAppName || "",
      voxApplicationId: d.voxApplicationId || "",
      voxCallerId: d.voxCallerId || "",
      apiKeySet: !!d.voxApiKey,
      apiKeyHint: d.voxApiKey ? `••••${String(d.voxApiKey).slice(-4)}` : "",
    });
  } catch (e) {
    logger.error("voximplantConfigGet failed", e);
    res.status(500).json({ status: "error", message: e.message || "Failed to read config" });
  }
});

exports.voximplantConfigSet = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ status: "error", message: "Method not allowed" }); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({ status: "error", message: "Unauthorized" }); return; }
  try {
    const payload = getJsonBody(req);
    const companyId = payload.companyId || await resolveCompanyIdForUid(uid);
    const update = {};
    for (const f of VOX_CFG_FIELDS) {
      // Only write fields that were sent. Empty apiKey is ignored so a save
      // that leaves the masked field blank doesn't wipe an existing key.
      if (payload[f] !== undefined && payload[f] !== null && String(payload[f]).trim() !== "") {
        update[f] = String(payload[f]).trim();
      }
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ status: "error", message: "No config fields provided." });
      return;
    }
    const db = getFirestore();
    await db.collection("Company").doc(String(companyId)).set(update, { merge: true });
    logActivity({ userId: uid, action: "voximplant.config", category: "settings", resourceType: "company", resourceId: String(companyId), details: { fields: Object.keys(update) } }).catch(() => {});
    res.status(200).json({ status: "success", companyId, updated: Object.keys(update) });
  } catch (e) {
    logger.error("voximplantConfigSet failed", e);
    res.status(500).json({ status: "error", message: e.message || "Failed to save config" });
  }
});

exports.assistantsCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  // Rate limit: 30 creates per minute per IP
  if (!applyRateLimit(req, res, {maxRequests: 30, windowMs: 60000})) {
    return;
  }

  try {
    // Extract authenticated user
    const uid = await extractUidFromRequest(req);

    // Sanitize all input to prevent XSS
    const rawPayload = getJsonBody(req);
    const payload = sanitizeObject(rawPayload);
    const db = getFirestore();
    const docRef = db.collection("assistants").doc();
    const now = FieldValue.serverTimestamp();

    const definition = payload.assistant || payload;
    // Always use token UID if available; fall back to payload for legacy/internal calls
    const ownerId = uid ||
      payload.userId ||
      payload.metadata?.userId ||
      payload.ownerId ||
      payload.metadata?.ownerId ||
      null;
    const companyId =
      payload.companyId || payload.metadata?.companyId || payload.metadata?.orgId || null;

    // Check plan limit
    if (ownerId) {
      const planCheck = await checkPlanLimit(ownerId, "assistants");
      if (!planCheck.allowed) {
        res.status(403).json({
          status: "error",
          code: "plan_limit_reached",
          message: `Assistant limit reached (${planCheck.current}/${planCheck.limit} on ${planCheck.plan} plan). Upgrade to create more.`,
        });
        return;
      }
    }

    const record = {
      id: docRef.id,
      name: payload.name || definition?.name || "Assistant",
      assistantName: payload.assistantName || payload.name || "Assistant",
      companyName: payload.companyName || "",
      firstMessage: payload.firstMessage || definition?.firstMessage || "",
      language:
        payload.language ||
        definition?.transcriber?.language ||
        definition?.model?.language ||
        "en-US",
      voice: payload.voice || null,
      systemPrompt: payload.systemPrompt || payload.instructions || "",
      // Realtime (V2V) fields â€” must be saved at creation or the mode never activates
      realtimeEnabled:      payload.realtimeEnabled     || false,
      realtimeVoice:        payload.realtimeVoice       || null,
      realtimeVadMode:      payload.realtimeVadMode      || "semantic",
      realtimeVadSensitivity: payload.realtimeVadSensitivity || "medium",
      // Voice provider selection: "openai-realtime" (V2V via OpenAI Realtime),
      // "nlpearl" (managed platform), or "classic" (Deepgram + LLM + TTS).
      voiceProvider:         payload.voiceProvider         || (payload.realtimeEnabled ? "openai-realtime" : "classic"),
      // Telephony carrier (twilio | sip | voximplant). Was omitted here — new
      // assistants always persisted the default and the editor's choice was lost.
      telephonyProvider:     payload.telephonyProvider     || "twilio",
      nlpearlPearlId:        payload.nlpearlPearlId        || null,
      nlpearlPhoneNumberId:  payload.nlpearlPhoneNumberId  || null,
      // Personality/style fields
      assistantVibe:        payload.assistantVibe       || "friendly",
      callerGender:         payload.callerGender        || "neutral",
      voiceAccent:          payload.voiceAccent         || "default",
      definition,
      ownerId,
      companyId,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(record);

    res.status(201).json({
      id: docRef.id,
      name: record.name,
      assistantName: record.assistantName,
      companyName: record.companyName,
      firstMessage: record.firstMessage,
      language: record.language,
      voice: record.voice,
      systemPrompt: record.systemPrompt,
      assistant: definition,
      metadata: { ownerId, companyId },
    });
    logActivity({ userId: uid, action: "assistant.create", category: "assistant", resourceType: "assistant", resourceId: docRef.id, details: {name: record.name} }).catch(() => {});
  } catch (error) {
    logger.error("Failed to create assistant", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create assistant",
    });
  }
});

exports.assistantsUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" && req.method !== "PATCH") {
    res.set("Allow", "POST, PATCH");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST or PATCH.",
    });
    return;
  }

  // Rate limit: 30 updates per minute per IP
  if (!applyRateLimit(req, res, {maxRequests: 30, windowMs: 60000})) {
    return;
  }

  try {
    const uid = await extractUidFromRequest(req);
    const payload = sanitizeObject(getJsonBody(req));
    const assistantId = payload.id || payload.assistantId;
    if (!assistantId) {
      res.status(400).json({ status: "error", message: "Assistant id is required." });
      return;
    }

    const db = getFirestore();
    const docRef = db.collection("assistants").doc(assistantId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      res.status(404).json(buildNotFoundResponse("Assistant not found", {assistantId}));
      return;
    }

    // Ownership check: if caller is authenticated and not the owner, reject
    // Super admin can edit any assistant.
    const existing = snapshot.data();
    let callerIsSuperAdmin = false;
    if (uid) {
      const userDoc = await getUserDoc(getFirestore(), uid);
      callerIsSuperAdmin = userDoc.exists && userDoc.data().role === "super_admin";
    }
    if (uid && existing.ownerId && existing.ownerId !== uid && !callerIsSuperAdmin) {
      res.status(403).json({ status: "error", message: "Forbidden." });
      return;
    }

    const definition = existing.definition || {};
    const newDefinition = payload.assistant || payload.definition;

    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.assistantName !== undefined) updates.assistantName = payload.assistantName;
    if (payload.companyName !== undefined) updates.companyName = payload.companyName;
    if (payload.firstMessage !== undefined) updates.firstMessage = payload.firstMessage;
    if (payload.language !== undefined) updates.language = payload.language;
    if (payload.voice !== undefined) updates.voice = payload.voice;
    if (payload.systemPrompt !== undefined) updates.systemPrompt = payload.systemPrompt;
    if (payload.instructions !== undefined) updates.systemPrompt = payload.instructions;
    if (payload.llmModel !== undefined) updates.llmModel = payload.llmModel;
    if (payload.temperature !== undefined) updates.temperature = payload.temperature;
    if (payload.maxTokens !== undefined) updates.maxTokens = payload.maxTokens;
    if (payload.sttModel !== undefined) updates.sttModel = payload.sttModel;
    if (payload.speechSpeed !== undefined) updates.speechSpeed = payload.speechSpeed;
    if (payload.voiceStability !== undefined) updates.voiceStability = payload.voiceStability;
    if (payload.feedbackCallEnabled !== undefined) updates.feedbackCallEnabled = payload.feedbackCallEnabled;
    if (payload.realtimeEnabled !== undefined) updates.realtimeEnabled = payload.realtimeEnabled;
    if (payload.realtimeVoice !== undefined) updates.realtimeVoice = payload.realtimeVoice;
    if (payload.realtimeVadMode !== undefined) updates.realtimeVadMode = payload.realtimeVadMode;
    if (payload.realtimeVadSensitivity !== undefined) updates.realtimeVadSensitivity = payload.realtimeVadSensitivity;
    if (payload.voiceProvider !== undefined) updates.voiceProvider = payload.voiceProvider;
    // Telephony carrier — was missing from the whitelist, so the editor's
    // "SIP Trunk"/"Voximplant" selection was silently dropped on save.
    if (payload.telephonyProvider !== undefined) updates.telephonyProvider = payload.telephonyProvider;
    if (payload.nlpearlPearlId !== undefined) updates.nlpearlPearlId = payload.nlpearlPearlId || null;
    if (payload.nlpearlPhoneNumberId !== undefined) updates.nlpearlPhoneNumberId = payload.nlpearlPhoneNumberId || null;
    if (payload.realtimeScenarioId !== undefined) updates.realtimeScenarioId = payload.realtimeScenarioId || null;
    if (payload.voiceAccent !== undefined) updates.voiceAccent = payload.voiceAccent;
    if (payload.assistantVibe !== undefined) updates.assistantVibe = payload.assistantVibe;
    if (payload.callerGender !== undefined) updates.callerGender = payload.callerGender;
    if (payload.customTools !== undefined) updates.customTools = payload.customTools;
    if (payload.conversationFlow !== undefined) updates.conversationFlow = payload.conversationFlow;
    if (newDefinition) updates.definition = newDefinition;

    await docRef.set(updates, {merge: true});

    const result = await docRef.get();
    const d = result.data();
    res.status(200).json({
      id: result.id,
      name: d.name,
      assistantName: d.assistantName,
      companyName: d.companyName,
      firstMessage: d.firstMessage,
      language: d.language,
      voice: d.voice,
      systemPrompt: d.systemPrompt,
      definition: d.definition || definition,
      ownerId: d.ownerId,
      llmModel: d.llmModel,
      temperature: d.temperature,
      maxTokens: d.maxTokens,
      speechSpeed: d.speechSpeed,
      voiceStability: d.voiceStability,
      feedbackCallEnabled: d.feedbackCallEnabled,
      realtimeEnabled: d.realtimeEnabled,
      realtimeVoice: d.realtimeVoice,
      realtimeVadMode: d.realtimeVadMode,
      realtimeVadSensitivity: d.realtimeVadSensitivity,
      realtimeScenarioId: d.realtimeScenarioId || null,
      voiceProvider: d.voiceProvider || (d.realtimeEnabled ? "openai-realtime" : "classic"),
      telephonyProvider: d.telephonyProvider || "twilio",
      nlpearlPearlId: d.nlpearlPearlId || null,
      nlpearlPhoneNumberId: d.nlpearlPhoneNumberId || null,
      voiceAccent: d.voiceAccent || "default",
      assistantVibe: d.assistantVibe || null,
      callerGender: d.callerGender || null,
      sttModel: d.sttModel || null,
      customTools: d.customTools || [],
    });
    logActivity({ userId: uid, action: "assistant.update", category: "assistant", resourceType: "assistant", resourceId: assistantId }).catch(() => {});
  } catch (error) {
    logger.error("Failed to update assistant", error);
    res.status(500).json({ status: "error", message: "Failed to update assistant" });
  }
});

/**
 * In-browser assistant test chat â€” no Twilio, no phone, zero telephony cost.
 * POST /assistantTestChat
 * Body: { assistantId, message, history: [{role, content}], override?: {systemPrompt, assistantVibe, callerGender, language} }
 * Returns: { reply: string }
 *
 * The `override` fields let the frontend test unsaved draft settings.
 * KB chunks are always fetched live from Firestore for the saved assistantId.
 */
exports.assistantTestChat = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({ status: "error", message: "Method not allowed." });
    return;
  }
  if (!applyRateLimit(req, res, {maxRequests: 60, windowMs: 60000})) return;

  try {
    const uid = await extractUidFromRequest(req);
    const payload = sanitizeObject(getJsonBody(req));
    const assistantId = payload.assistantId;
    const userMessage = (payload.message || "").trim();
    const history = Array.isArray(payload.history) ? payload.history : [];
    const override = payload.override || {};

    if (!assistantId) {
      res.status(400).json({ status: "error", message: "assistantId is required." });
      return;
    }
    if (!userMessage) {
      res.status(400).json({ status: "error", message: "message is required." });
      return;
    }

    const db = getFirestore();
    const docSnap = await db.collection("assistants").doc(String(assistantId)).get();
    if (!docSnap.exists) {
      res.status(404).json({ status: "error", message: "Assistant not found." });
      return;
    }
    const data = docSnap.data();
    if (uid && data.ownerId && data.ownerId !== uid) {
      res.status(403).json({ status: "error", message: "Forbidden." });
      return;
    }

    // Merge saved assistant with any unsaved overrides from the editor
    const assistant = {
      ...data,
      id: docSnap.id,
      ...(override.systemPrompt !== undefined ? { systemPrompt: override.systemPrompt } : {}),
      ...(override.assistantVibe  !== undefined ? { assistantVibe: override.assistantVibe } : {}),
      ...(override.callerGender   !== undefined ? { callerGender:  override.callerGender }  : {}),
      ...(override.language       !== undefined ? { language:      override.language }       : {}),
      ...(override.voiceAccent    !== undefined ? { voiceAccent:   override.voiceAccent }    : {}),
      ...(override.conversationFlow !== undefined ? { conversationFlow: override.conversationFlow } : {}),
    };

    const language = assistant.language || "en-US";
    const isHebrew = language.startsWith("he");
    const isArabic = language.startsWith("ar");

    // Build system prompt (same logic as live calls)
    let systemPrompt;
    if (assistant.systemPrompt) {
      const vibe = assistant.assistantVibe || "friendly";
      const callerGender = assistant.callerGender || "neutral";
      const langKey = isHebrew ? "he" : isArabic ? "ar" : "en";
      const vibeSnippet = llmService.getVibeSnippet(langKey, vibe);
      const genderSnippet = isHebrew ? llmService.hebrewGenderInstruction(callerGender)
        : isArabic ? llmService.arabicGenderInstruction(callerGender) : "";
      const accentSnippet = llmService.getAccentInstruction(langKey, assistant.voiceAccent);
      const styleSection = [vibeSnippet, genderSnippet, accentSnippet].filter(Boolean).join("\n");
      const identity = `You are ${assistant.name || "an AI assistant"}${assistant.companyName ? ` from ${assistant.companyName}` : ""}.`;
      systemPrompt = [
        identity,
        "",
        "## Your goal",
        assistant.systemPrompt,
        "",
        ...(styleSection ? ["## Communication style", styleSection, ""] : []),
        "## Context",
        "You are being tested via a text chat simulation in the assistant settings panel. Behave exactly as you would on a real phone call, but respond in text.",
      ].join("\n");
    } else {
      systemPrompt = llmService.buildSystemPrompt(assistant, {}, language) +
        "\n\n## Context\nYou are being tested via a text chat simulation. Behave exactly as you would on a real phone call, but respond in text.";
    }

    // Conversation flow / playbook (same as live calls).
    if (assistant.conversationFlow && String(assistant.conversationFlow).trim()) {
      systemPrompt += "\n\n## Conversation flow (playbook)\nFollow the matching flow for the caller's use case; adapt naturally, never read it aloud:\n" + String(assistant.conversationFlow).trim();
    }

    // Inject KB context if available
    try {
      const kbSnap = await db.collection("knowledge_chunks")
        .where("assistantId", "==", assistantId)
        .limit(10)
        .get();
      if (!kbSnap.empty) {
        const MAX_KB_CHARS = 10000;
        let kbText = "";
        for (const doc of kbSnap.docs) {
          const c = doc.data().content || "";
          if ((kbText.length + c.length + 4) > MAX_KB_CHARS) break;
          kbText += (kbText ? "\n---\n" : "") + c;
        }
        if (kbText) {
          systemPrompt += "\n\n## Reference Information\nUse the following knowledge to answer questions accurately:\n\n" + kbText;
        }
      }
    } catch (kbErr) {
      logger.warn("assistantTestChat KB fetch failed (non-fatal)", kbErr.message);
    }

    // Sanitise history â€” only pass role/content, max last 20 turns
    const llmHistory = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map((m) => ({ role: m.role, content: String(m.content || "") }));

    // ── Tool sandbox ──────────────────────────────────────────────────
    // If the assistant has custom API tools (saved, or unsaved ones passed from
    // the editor via override.customTools), expose them to the model and run a
    // bounded function-calling loop so the chat actually FIRES the tools — this
    // is how you verify a tool works end-to-end before trusting it on a call.
    // NOTE: tools hit their REAL endpoints (side effects happen). The UI warns.
    const customTools = Array.isArray(override.customTools) ? override.customTools
      : (Array.isArray(assistant.customTools) ? assistant.customTools : []);
    const openAiTools = customTools.map(toolExec.toOpenAiTool).filter(Boolean);

    const llmOpts = {
      model: assistant.llmModel || "gpt-4o-mini",
      maxTokens: Math.min(assistant.maxTokens || 200, 500),
      temperature: assistant.temperature ?? 0.7,
      timeout: 20000,
      ...(openAiTools.length ? { tools: openAiTools } : {}),
    };

    let llmResult = await llmService.getLLMResponse(systemPrompt, userMessage, llmHistory, llmOpts);

    const toolCallLog = [];
    if (openAiTools.length) {
      const convo = [...llmHistory, { role: "user", content: userMessage }];
      let rounds = 0;
      const MAX_ROUNDS = 3;
      while (llmResult.toolCalls && llmResult.toolCalls.length && rounds < MAX_ROUNDS) {
        rounds++;
        convo.push({ role: "assistant", content: llmResult.text || null, tool_calls: llmResult.toolCalls });
        for (const tc of llmResult.toolCalls) {
          const fnName = tc.function?.name;
          let args = {};
          try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* leave {} */ }
          const tool = customTools.find((t) => toolExec.toolFnName(t.name) === fnName && t.url);
          const exec = tool
            ? await toolExec.executeCustomApiTool(tool, args)
            : { ok: false, status: 0, ms: 0, result: `(no such tool: ${fnName})` };
          toolCallLog.push({ name: fnName, args, ok: exec.ok, status: exec.status, ms: exec.ms, result: exec.result, url: exec.url });
          convo.push({ role: "tool", tool_call_id: tc.id, content: String(exec.result ?? "") });
        }
        // Continuation pass (empty userMessage → not re-added; falsy-safe).
        llmResult = await llmService.getLLMResponse(systemPrompt, "", convo, llmOpts);
      }
    }

    res.status(200).json({ reply: llmResult.text || "", toolCalls: toolCallLog });
  } catch (error) {
    logger.error("assistantTestChat failed", error);
    res.status(500).json({ status: "error", message: "Failed to generate reply" });
  }
});

exports.assistantsDelete = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    res.set("Allow", "POST, DELETE");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST or DELETE.",
    });
    return;
  }

  try {
    const uid = await extractUidFromRequest(req);
    const payload = getJsonBody(req);
    const assistantId = payload.id || payload.assistantId;
    if (!assistantId) {
      res.status(400).json({ status: "error", message: "Assistant id is required." });
      return;
    }

    const db = getFirestore();

    // Super admins can delete any assistant in the system
    let isSuperAdmin = false;
    if (uid) {
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists && userDoc.data().role === "super_admin") {
        isSuperAdmin = true;
      }
    }

    const docRef = db.collection("assistants").doc(assistantId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      res.status(404).json({ status: "error", message: "Assistant not found." });
      return;
    }

    // Ownership check â€” super_admin bypasses this
    if (!isSuperAdmin) {
      const docOwnerId = snapshot.data().ownerId || snapshot.data().metadata?.ownerId || null;
      if (uid && docOwnerId && docOwnerId !== uid) {
        res.status(403).json({ status: "error", message: "Forbidden." });
        return;
      }
    }

    await docRef.delete();
    res.status(200).json(buildSuccessResponse({assistantId}));
    logActivity({ userId: uid, action: "assistant.delete", category: "assistant", resourceType: "assistant", resourceId: assistantId }).catch(() => {});
  } catch (error) {
    logger.error("Failed to delete assistant", error);
    res.status(500).json({ status: "error", message: "Failed to delete assistant" });
  }
});

/**
 * Duplicate an existing assistant.
 * POST /assistantsDuplicate  { id, name? }
 */
exports.assistantsDuplicate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    const payload = getJsonBody(req);
    const sourceId = payload.id;

    if (!sourceId) {
      res.status(400).json({status: "error", message: "id is required"});
      return;
    }

    const db = getFirestore();
    const sourceDoc = await db.collection("assistants").doc(sourceId).get();

    if (!sourceDoc.exists) {
      res.status(404).json({status: "error", message: "Assistant not found"});
      return;
    }

    const sourceData = sourceDoc.data();

    // Verify ownership (unless admin)
    if (uid && sourceData.ownerId && sourceData.ownerId !== uid) {
      // Check if caller is admin
      const userDoc = await db.collection("users").doc(uid).get();
      const role = userDoc.exists ? userDoc.data().role : null;
      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({status: "error", message: "Not authorized to duplicate this assistant"});
        return;
      }
    }

    // Clone the assistant
    const newName = payload.name || `${sourceData.name || sourceData.assistantName || "Assistant"} (Copy)`;
    const newDoc = db.collection("assistants").doc();

    const cloneData = {
      ...sourceData,
      id: newDoc.id,
      name: newName,
      assistantName: newName,
      ownerId: uid || sourceData.ownerId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Don't copy phone assignments
    delete cloneData.phoneNumber;
    delete cloneData.assignedPhoneNumbers;

    await newDoc.set(cloneData);

    // Audit log
    const {logActivity} = require("./audit_service");
    logActivity({ userId: uid, action: "assistant.duplicate", category: "assistant", resourceType: "assistant", resourceId: newDoc.id, details: {sourceId, name: newName} }).catch(() => {});

    res.status(201).json({
      id: newDoc.id,
      name: newName,
      status: "success",
    });
  } catch (error) {
    logger.error("assistantsDuplicate failed", error);
    res.status(500).json({status: "error", message: "Failed to duplicate assistant"});
  }
});

exports.assistantsList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.set("Allow", "GET");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected GET.",
    });
    return;
  }

  try {
    const uid = await extractUidFromRequest(req);
    const db = getFirestore();

    // Check if caller is super_admin â€” if so, show ALL assistants
    let isSuperAdmin = false;
    if (uid) {
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists && userDoc.data().role === "super_admin") {
        isSuperAdmin = true;
      }
    }

    // Fetch assistants for this user. Two ownership patterns exist:
    //   1. Top-level `ownerId` (standard â€” assistantsCreate)
    //   2. Nested `metadata.ownerId` (legacy â€” elAlSeedAssistant v1)
    // We run both queries and deduplicate. The metadata query has NO orderBy
    // to avoid requiring a composite index on a nested field (unsupported by
    // Firestore automatic indexing). Sorting happens in-memory after merge.
    let allDocs;
    if (uid && !isSuperAdmin) {
      const snap1Promise = db.collection("assistants")
        .where("ownerId", "in", [uid, null])
        .orderBy("createdAt", "desc")
        .get();
      // No orderBy here â€” nested fields need explicit composite indexes.
      // Wrapped in try/catch so a missing index never breaks the main list.
      const snap2Promise = db.collection("assistants")
        .where("metadata.ownerId", "==", uid)
        .get()
        .catch(() => ({docs: []})); // silent fallback if index doesn't exist yet

      const [snap1, snap2] = await Promise.all([snap1Promise, snap2Promise]);

      const seen = new Set();
      allDocs = [];
      for (const doc of [...snap1.docs, ...snap2.docs]) {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          allDocs.push(doc);
        }
      }
      allDocs.sort((a, b) =>
        (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0),
      );
    } else {
      const snapshot = await db.collection("assistants").orderBy("createdAt", "desc").get();
      allDocs = snapshot.docs;
    }

    // Load phone number â†’ assistant assignments for ALL users
    let phoneAssignments = {};
    try {
      const phoneDocs = await db.collection("phone_numbers").get();
      phoneDocs.forEach((d) => {
        const pd = d.data();
        if (pd.assistantId) {
          if (!phoneAssignments[pd.assistantId]) phoneAssignments[pd.assistantId] = [];
          phoneAssignments[pd.assistantId].push(pd.phoneNumber || d.id);
        }
      });
    } catch (phoneErr) {
      logger.warn("Could not load phone assignments:", phoneErr.message);
    }

    const assistants = allDocs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || data.assistantName,
        assistantName: data.assistantName || data.name,
        companyName: data.companyName || "",
        firstMessage: data.firstMessage,
        language: data.language,
        voice: data.voice || null,
        systemPrompt: data.systemPrompt || "",
        assistant: data.definition,
        metadata: {
          ownerId: data.ownerId || null,
          companyId: data.companyId || null,
        },
        assignedPhoneNumbers: phoneAssignments[doc.id] || [],
      };
    });

    res.status(200).json(assistants);
  } catch (error) {
    logger.error("Failed to list assistants", error);
    res.status(500).json({ status: "error", message: "Failed to list assistants" });
  }
});

exports.assistantsGet = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.set("Allow", "GET");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected GET.",
    });
    return;
  }

  try {
    const assistantId = req.query.assistantId || req.query.id;
    if (!assistantId) {
      res.status(400).json({
        status: "error",
        message: "assistantId query parameter is required.",
      });
      return;
    }

    const db = getFirestore();
    const doc = await db.collection("assistants").doc(String(assistantId)).get();
    if (!doc.exists) {
      res
        .status(404)
        .json(buildNotFoundResponse("Assistant not found", {assistantId}));
      return;
    }

    const data = doc.data();
    res.status(200).json({
      id: doc.id,
      name: data.name || data.assistantName,
      assistantName: data.assistantName || data.name,
      companyName: data.companyName || "",
      firstMessage: data.firstMessage,
      language: data.language,
      voice: data.voice || null,
      systemPrompt: data.systemPrompt || "",
      assistant: data.definition,
      // Advanced AI & voice settings
      llmModel: data.llmModel || null,
      temperature: data.temperature ?? null,
      maxTokens: data.maxTokens ?? null,
      sttModel: data.sttModel || null,
      speechSpeed: data.speechSpeed ?? null,
      voiceStability: data.voiceStability ?? null,
      feedbackCallEnabled: data.feedbackCallEnabled || false,
      realtimeEnabled: data.realtimeEnabled || false,
      realtimeVoice: data.realtimeVoice || null,
      realtimeVadMode: data.realtimeVadMode || null,
      realtimeVadSensitivity: data.realtimeVadSensitivity || null,
      voiceProvider: data.voiceProvider || (data.realtimeEnabled ? "openai-realtime" : "classic"),
      telephonyProvider: data.telephonyProvider || "twilio",
      nlpearlPearlId: data.nlpearlPearlId || null,
      nlpearlPhoneNumberId: data.nlpearlPhoneNumberId || null,
      voiceAccent: data.voiceAccent || "default",
      assistantVibe: data.assistantVibe || null,
      callerGender: data.callerGender || null,
      realtimeScenarioId: data.realtimeScenarioId || null,
      customTools: data.customTools || [],
      conversationFlow: data.conversationFlow || "",
      metadata: {
        ownerId: data.ownerId || null,
        companyId: data.companyId || null,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch assistant", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch assistant",
    });
  }
});

exports.configurePhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const rawNumber = payload.number || payload.phoneNumber;
    if (!rawNumber) {
      res.status(400).json({
        status: "error",
        message: "number is required.",
      });
      return;
    }

    const friendlyName = payload.name || payload.friendlyName || "VoiceFlow AI";
    const phoneNumber = rawNumber.trim();
    const companyId = payload.companyId || null;
    const assistantId = payload.assistantId || null;

    // Build the inbound webhook URL, embedding the assistantId so the call
    // handler knows which bot to use without a Firestore lookup on every ring.
    const voiceUrl = assistantId
      ? `${TWILIO_VOICE_WEBHOOK}?assistantId=${encodeURIComponent(assistantId)}`
      : TWILIO_VOICE_WEBHOOK;

    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber,
      limit: 1,
    });

    if (!numbers || numbers.length === 0) {
      res.status(404).json(
        buildNotFoundResponse("Twilio number not found", {
          phoneNumber,
        }),
      );
      return;
    }

    const target = numbers[0];
    await target.update({
      friendlyName,
      voiceUrl,
      voiceMethod: "POST",
      statusCallback: TWILIO_STATUS_WEBHOOK,
      statusCallbackMethod: "POST",
      smsUrl: TWILIO_VOICE_WEBHOOK,
      smsMethod: "POST",
    });

    // If companyId provided, ensure the number is added to the company
    if (companyId) {
      const db = getFirestore();
      const companyRef = db.collection("Company").doc(String(companyId));
      try {
        await db.runTransaction(async (trx) => {
          const snapshot = await trx.get(companyRef);
          if (!snapshot.exists) {
            logger.warn(`Company ${companyId} not found, skipping phone number addition`);
            return;
          }
          
          const data = snapshot.data() || {};
          const currentNumbers = collectPhoneNumbers(data?.companyPhoneNumbers || []);
          currentNumbers.add(target.phoneNumber);

          const phoneEntry = {
            id: target.sid,
            label: "inbound_outbound",
            phoneNumber: target.phoneNumber,
          };
          if (friendlyName) {
            phoneEntry.friendlyName = friendlyName;
          }
          // FIX: persist assistantId so inbound routing can load the right bot
          if (assistantId) {
            phoneEntry.assistantId = assistantId;
          }

          const nextEntries = upsertPhoneEntry(data?.phoneNumberMap || [], phoneEntry);

          trx.set(
            companyRef,
            {
              companyPhoneNumbers: Array.from(currentNumbers),
              phoneNumberMap: nextEntries,
            },
            {merge: true},
          );
          
          logger.info(`Added phone number ${target.phoneNumber} to company ${companyId}`);
        });
      } catch (updateError) {
        logger.error(
          `Failed to add phone number to company ${companyId}`,
          updateError,
        );
        // Don't fail the request if company update fails
      }
    }

    res.status(201).json({
      id: target.sid,
      number: target.phoneNumber,
      status: "configured",
      voiceUrl,
      assistantId: assistantId || null,
      companyId: companyId || null,
    });
  } catch (error) {
    logger.error("Failed to configure phone number", error);
    res.status(500).json({
      status: "error",
      message: "Failed to configure phone number",
    });
  }
});

// ── Assign a number to an assistant (provider-agnostic, server-side) ─────────
// Replaces the old browser-side Firestore writes, which silently failed:
//   • Firestore rules block cross-company/non-admin Company writes (caught as
//     "sync skipped"), so routing never updated.
//   • The client loop only PATCHED existing phoneNumberMap entries — a number
//     with no entry yet could never be assigned.
// This endpoint uses the Admin SDK (bypasses rules) and UPSERTS the entry into
// the right Company doc (suffix-match across companies; falls back to the
// caller's company), so inbound routing (which reads Company.phoneNumberMap)
// always reflects the assignment — for Twilio, Voximplant, and SIP alike.
exports.assignPhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ status: "error", message: "Method not allowed" }); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({ status: "error", message: "Unauthorized" }); return; }
  try {
    const payload = getJsonBody(req);
    const phoneNumber = String(payload.phoneNumber || payload.number || "").trim();
    const assistantId = payload.assistantId ? String(payload.assistantId) : "";
    if (!phoneNumber) { res.status(400).json({ status: "error", message: "phoneNumber is required" }); return; }

    const db = getFirestore();

    // Resolve assistant display name (best-effort).
    let assistantName = "";
    if (assistantId) {
      try {
        const aSnap = await db.collection("assistants").doc(assistantId).get();
        if (aSnap.exists) { const d = aSnap.data(); assistantName = d.name || d.assistantName || ""; }
      } catch (_) { /* name is cosmetic */ }
    }

    // Suffix-match on digits (UI may carry +country code while the routing map
    // stores the bare DID, or vice-versa). Min 7 digits avoids false matches.
    const cfgDigits = phoneNumber.replace(/\D/g, "");
    const digitsMatch = (a) => {
      const da = String(a || "").replace(/\D/g, "");
      if (!da || !cfgDigits) return false;
      if (da === cfgDigits) return true;
      const short = da.length <= cfgDigits.length ? da : cfgDigits;
      const long  = da.length <= cfgDigits.length ? cfgDigits : da;
      return short.length >= 7 && long.endsWith(short);
    };

    // Update every Company doc that already maps this number.
    let matched = 0;
    const companiesSnap = await db.collection("Company").get();
    for (const companyDoc of companiesSnap.docs) {
      const data = companyDoc.data() || {};
      const map = Array.isArray(data.phoneNumberMap) ? data.phoneNumberMap : [];
      const idx = map.findIndex((e) => e && e.phoneNumber && digitsMatch(e.phoneNumber));
      if (idx >= 0) {
        const updated = [...map];
        updated[idx] = { ...updated[idx], assistantId, assistantName };
        await companyDoc.ref.set({ phoneNumberMap: updated }, { merge: true });
        matched++;
      }
    }

    // No existing entry anywhere → create one in the caller's company so inbound
    // routing has something to resolve.
    if (matched === 0) {
      const companyId = await resolveCompanyIdForUid(uid);
      const companyRef = db.collection("Company").doc(String(companyId));
      await db.runTransaction(async (trx) => {
        const snap = await trx.get(companyRef);
        const data = snap.exists ? snap.data() : {};
        const map = Array.isArray(data.phoneNumberMap) ? data.phoneNumberMap : [];
        map.push({ id: phoneNumber, label: "inbound_outbound", phoneNumber, assistantId, assistantName });
        const nums = collectPhoneNumbers(data?.companyPhoneNumbers || []);
        nums.add(phoneNumber);
        trx.set(companyRef, { phoneNumberMap: map, companyPhoneNumbers: Array.from(nums) }, { merge: true });
      });
      matched = 1;
    }

    // Mirror onto the phone_numbers doc the Numbers page reads.
    try {
      await db.collection("phone_numbers").doc(phoneNumber).set({ assistantId, assistantName }, { merge: true });
    } catch (e) { logger.warn(`assignPhoneNumber: phone_numbers doc update failed: ${e.message}`); }

    logActivity({ userId: uid, action: "phone.assign", category: "phone", resourceType: "phone_number", resourceId: phoneNumber, details: { assistantId } }).catch(() => {});
    res.status(200).json({ status: "success", phoneNumber, assistantId, assistantName, companiesUpdated: matched });
  } catch (error) {
    logger.error("assignPhoneNumber failed", error);
    res.status(500).json({ status: "error", message: error.message || "Failed to assign number" });
  }
});

exports.releasePhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    res.set("Allow", "POST, DELETE");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST or DELETE.",
    });
    return;
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const sid = payload.sid || payload.phoneSid || payload.numberSid;
    if (!sid) {
      res.status(400).json({
        status: "error",
        message: "sid is required.",
      });
      return;
    }

    await twilioClient.incomingPhoneNumbers(sid).remove();

    const companyId = payload.companyId;
    const phoneNumber = payload.phoneNumber;
    const friendlyName = payload.friendlyName || null;
    if (companyId) {
      const db = getFirestore();
      const companyRef = db.collection("Company").doc(String(companyId));
      try {
        await db.runTransaction(async (trx) => {
          const snapshot = await trx.get(companyRef);
          if (!snapshot.exists) {
            return;
          }
          const data = snapshot.data() || {};
          const currentNumbers = collectPhoneNumbers(data.companyPhoneNumbers);
          let resolvedNumber = typeof phoneNumber === "string" ? phoneNumber.trim() : null;

          if (!resolvedNumber) {
            const entries = normalizePhoneEntries(data.phoneNumberMap);
            const byId = entries.get(`id:${sid}`);
            if (byId && byId.phoneNumber) {
              resolvedNumber = byId.phoneNumber;
            }
          }

          if (resolvedNumber) {
            currentNumbers.delete(resolvedNumber);
          }

          const nextEntries = removePhoneEntry(data.phoneNumberMap, {
            sid,
            phoneNumber: resolvedNumber,
          }).map((entry) => {
            if (!entry) {
              return entry;
            }
            if (entry.id === sid && friendlyName === null) {
              const cloned = {...entry};
              delete cloned.friendlyName;
              return cloned;
            }
            if (entry.id === sid && friendlyName) {
              return {...entry, friendlyName};
            }
            return entry;
          });

          trx.set(
            companyRef,
            {
              companyPhoneNumbers: Array.from(currentNumbers),
              phoneNumberMap: nextEntries,
            },
            {merge: true},
          );
        });
      } catch (updateError) {
        logger.error(
          `Failed to remove phone number from company ${companyId}`,
          updateError,
        );
      }
    }

    res.status(200).json({
      status: "success",
      sid,
      phoneNumber: phoneNumber || null,
    });
    logActivity({ userId: null, action: "phone.release", category: "phone", resourceType: "phone_number", details: {phoneNumber: phoneNumber || sid} }).catch(() => {});
  } catch (error) {
    logger.error("Failed to release phone number", error);
    res.status(500).json({
      status: "error",
      message: "Failed to release phone number",
    });
  }
});

exports.listPhoneNumbers = onRequest({...corsOptions, secrets: [_NLPEARL_TOKEN_SECRET]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.set("Allow", "GET, OPTIONS");
    res.status(405).json({status: "error", message: "Method not allowed. Expected GET."});
    return;
  }
  try {
    // Twilio numbers
    let twilioNumbers = [];
    if (twilioClient) {
      try {
        const numbers = await twilioClient.incomingPhoneNumbers.list({limit: 100});
        twilioNumbers = numbers.map((n) => ({
          id:           n.sid,
          sid:          n.sid,
          phoneNumber:  n.phoneNumber,
          friendlyName: n.friendlyName,
          country:      n.isoCountry || "US",
          provider:     "twilio",
        }));
      } catch (twErr) {
        logger.warn("Twilio list failed", twErr.message);
      }
    }

    // NLPearl numbers (merge in if token configured)
    let nlpearlNumbers = [];
    const nlpToken = process.env.NLPEARL_API_TOKEN;
    if (nlpToken) {
      try {
        const nlp = require("./nlpearl_service.js").internal;
        const [phones, pearls] = await Promise.all([nlp.listPhoneNumbers(nlpToken), nlp.listPearls(nlpToken)]);
        const phoneList = Array.isArray(phones.body) ? phones.body : [];
        // Settings lookup is heavy; for the list endpoint we just include phone metadata.
        nlpearlNumbers = phoneList.map((n) => ({
          id:          n.id,
          phoneNumber: n.number,
          friendlyName: "",
          country:     (n.number || "").startsWith("+972") ? "IL" : "",
          provider:    "nlpearl",
          direction:   n.direction,
        }));
      } catch (nlpErr) {
        logger.warn("NLPearl list failed", nlpErr.message);
      }
    }

    res.json([...twilioNumbers, ...nlpearlNumbers]);
  } catch (error) {
    logger.error("Failed to list phone numbers", error);
    res.status(500).json({status: "error", message: "Failed to list phone numbers"});
  }
});

exports.placeCall = onRequest({...corsOptions, minInstances: 1, memory: "512MiB", secrets: [_NLPEARL_TOKEN_SECRET]}, async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  try {
    const payload = getJsonBody(req);
    const callerUid = await extractUidFromRequest(req);

    const leadNumber = payload.number || payload.leadPhone;
    if (!leadNumber) {
      res.status(400).json({
        status: "error",
        message: "Lead phone number is required.",
      });
      return;
    }

    // Resolve companyId: explicit payload → authenticated user's company →
    // the user's own uid (self-tenant). The frontend doesn't send companyId,
    // so without this fallback every call defaulted to companyId=null, which
    // made getVoxConfig(null) return null and silently routed Voximplant
    // tenants through Twilio instead.
    let companyId = payload.companyId || null;
    if (!companyId && callerUid) {
      try {
        const udb = getFirestore();
        const uSnap = await udb.collection("users").doc(callerUid).get();
        if (uSnap.exists) {
          const ud = uSnap.data();
          companyId = ud.companyId || ud.uid || callerUid;
        } else {
          companyId = callerUid;
        }
      } catch (e) {
        logger.warn("placeCall: companyId resolution failed", { callerUid, error: e.message });
        companyId = callerUid;
      }
    }
    logger.info("placeCall companyId resolved", { companyId, fromPayload: !!payload.companyId });
    const assistantId = payload.assistantId || payload.assistant?.id || null;
    let rawAssistantDefinition = payload.assistantJson || payload.assistant || {};

    // If only assistantId was supplied (no definition), load from Firestore
    if (assistantId && Object.keys(rawAssistantDefinition).length === 0) {
      try {
        const db2 = getFirestore();
        const aDoc = await db2.collection("assistants").doc(assistantId).get();
        if (aDoc.exists) {
          rawAssistantDefinition = { id: assistantId, ...aDoc.data() };
        }
      } catch (loadErr) {
        logger.warn("Could not load assistant definition", { assistantId, error: loadErr.message });
      }
    }

    // ── NLPearl → Gemini Live migration ──────────────────────────────────────
    // NLPearl is being phased out. Any assistant still tagged with
    // voiceProvider === "nlpearl" is silently rerouted to Gemini Live so the
    // call still works while the migration job catches up rewriting docs.
    if (rawAssistantDefinition?.voiceProvider === "nlpearl") {
      logger.info("NLPearl assistant auto-routed to Gemini Live", { leadNumber, pearlId: rawAssistantDefinition.nlpearlPearlId });
      rawAssistantDefinition.voiceProvider = "gemini-live";
    }

    // Fallthrough below — Twilio / Asterisk / VoxImplant path (existing code)

    // Check which telephony provider to use: Asterisk → VoxImplant → Twilio.
    //
    // VoxImplant routing is STRICTLY per-assistant opt-in:
    //   assistant.telephonyProvider === "voximplant"
    //
    // The company-level Company.telephonyProvider flag is deliberately NOT a
    // trigger for Voximplant. A company-wide flag silently reroutes EVERY
    // assistant on the tenant — which put production assistants (El Al,
    // Clalit, etc.) onto the unvalidated Voximplant bridge during testing.
    // Routing now requires an explicit per-assistant flag, so a single test
    // assistant can use Voximplant while every other assistant stays on
    // Twilio + its own voice config, regardless of the company doc's state.
    // Vox credentials still live on the Company doc; only the decision is
    // per-assistant. (Mirrors the Asterisk/SIP pattern from tasks #30/#31.)
    const asteriskConfig = await asteriskService.getAsteriskConfig(companyId);
    const useAsterisk    = asteriskConfig !== null;

    // GLOBAL TELEPHONY OVERRIDE (admin master switch, default off). When set to
    // "voximplant", every Twilio-assigned (or unset) assistant routes OUTBOUND
    // via Voximplant. Explicit per-assistant sip/voximplant are untouched. This
    // is the deliberate "move the whole platform off Twilio" lever — distinct
    // from the per-company flag we intentionally do NOT honor (see note above).
    let globalTelephonyOverride = "none";
    try {
      const polSnap = await getFirestore().doc("system_policies/global").get();
      if (polSnap.exists) globalTelephonyOverride = polSnap.data().globalTelephonyOverride || "none";
    } catch (e) {
      logger.warn("placeCall: could not read globalTelephonyOverride", { error: e.message });
    }
    const assistantProvider = rawAssistantDefinition?.telephonyProvider || "twilio";
    const overrideToVox = globalTelephonyOverride === "voximplant" && assistantProvider === "twilio";

    const assistantWantsVox = assistantProvider === "voximplant" || overrideToVox;
    const voxConfig = (!useAsterisk && assistantWantsVox)
      ? await voximplantService.getVoxConfig(companyId, { requireProviderFlag: false })
      : null;
    const useVoxImplant  = !useAsterisk && voxConfig !== null;
    const useThirdParty  = useAsterisk || useVoxImplant;
    logger.info("placeCall provider decision", {
      companyId,
      assistantProvider: rawAssistantDefinition?.telephonyProvider || null,
      globalTelephonyOverride, overrideToVox,
      useAsterisk, useVoxImplant,
    });

    // Resolve Twilio credentials (per-company → system fallback)
    let effectiveTwilioClient = null;
    if (!useThirdParty) {
      let effectiveCreds;
      try {
        effectiveCreds = await getEffectiveTwilioCredentials(companyId, callerUid);
      } catch (credErr) {
        const httpStatus = credErr.code === "REQUIRES_OWN_KEYS" ? 403 : 500;
        res.status(httpStatus).json({
          status: "error",
          code: credErr.code || "twilio_config_error",
          message: credErr.message,
        });
        return;
      }
      effectiveTwilioClient = twilio(effectiveCreds.sid, effectiveCreds.token);
    }

    // Credit balance check for authenticated users on basic plan
    if (callerUid && !useThirdParty) {
      try {
        const cdb = getFirestore();
        const userSnap = await cdb.collection("users").doc(callerUid).get();
        if (userSnap.exists) {
          const u = userSnap.data();
          if (u.creditGranted) {
            const balance = typeof u.creditBalance === "number" ? u.creditBalance : 0;
            if (balance <= 0) {
              res.status(402).json({
                status: "error",
                code: "credit_exhausted",
                message: "Credit balance exhausted. Upgrade to Pro to continue making calls.",
              });
              return;
            }
            if (u.creditExpiresAt) {
              const expiresAt = u.creditExpiresAt.toDate
                ? u.creditExpiresAt.toDate()
                : new Date(u.creditExpiresAt);
              if (expiresAt < new Date()) {
                res.status(402).json({
                  status: "error",
                  code: "credit_expired",
                  message: "Trial credit has expired. Upgrade to Pro to continue making calls.",
                });
                return;
              }
            }
          }
        }
      } catch (creditErr) {
        logger.warn("Credit check failed (non-fatal)", {callerUid, error: creditErr.message});
      }
    }
    
    const companyPhone =
      payload.companyPhone ||
      payload.companyPhoneNumber ||
      (useAsterisk ? asteriskConfig.defaultCallerId : TWILIO_DEFAULT_FROM);

    if (!companyPhone) {
      res.status(400).json({
        status: "error",
        message: "Company phone number is required.",
      });
      return;
    }

    // Extract data for placeholder replacement
    const leadName = payload.name || payload.leadName || rawAssistantDefinition.leadName || "";
    const assistantName = rawAssistantDefinition.name || rawAssistantDefinition.assistantName || 
                          payload.metadata?.assistantName || "your assistant";
    const companyName = rawAssistantDefinition.companyName || 
                        payload.metadata?.company || "our company";
    
    // Replace placeholders in firstMessage
    const placeholderData = {
      leadName,
      assistantName,
      companyName,
    };
    
    const processedFirstMessage = replacePlaceholders(
      rawAssistantDefinition.firstMessage || "",
      placeholderData
    );
    
    // Create processed assistant definition with replaced placeholders
    // Apply V2V defaults here so outbound calls are consistent with inbound.
    const assistantDefinition = {
      ...rawAssistantDefinition,
      firstMessage: processedFirstMessage,
      originalFirstMessage: rawAssistantDefinition.firstMessage,
      realtimeVoice:  rawAssistantDefinition.realtimeVoice  || "alloy",
      voiceAccent:    rawAssistantDefinition.voiceAccent    || "default",
      assistantVibe:  rawAssistantDefinition.assistantVibe  || "friendly",
      callerGender:   rawAssistantDefinition.callerGender   || "neutral",
    };

    // Check for scenario-based call
    const scenarioId = payload.scenarioId || null;
    
    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc();
    const sessionId = sessionRef.id;

    // Build session data
    const sessionData = {
      id: sessionId,
      ownerId: callerUid || null, // CRITICAL: must be set for ownership-based queries
      assistantId,
      assistantDefinition,
      leadName,
      leadNumber,
      companyId,
      companyPhone,
      companyName,
      assistantName,
      telephonyProvider: useAsterisk ? "asterisk" : useVoxImplant ? "voximplant" : "twilio",
      status: "initiated",
      metadata: payload.metadata || {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // If scenario is specified, initialize scenario context
    if (scenarioId) {
      const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
      if (scenarioDoc.exists) {
        const scenario = scenarioDoc.data();
        const startNode = scenarioEngine.getStartNode({nodes: scenario.nodes});
        
        sessionData.scenarioId = scenarioId;
        sessionData.currentNodeId = startNode?.id || null;
        sessionData.scenarioContext = {
          variables: {},
          defaultVoice: scenario.settings?.defaultVoice || DEFAULT_HEBREW_VOICE,
          defaultLanguage: scenario.settings?.defaultLanguage || "he-IL",
          leadName,
          companyName,
          assistantName,
        };
        
        logger.info(`Using scenario ${scenarioId} for call session ${sessionId}`);
      }
    }

    await sessionRef.set(sessionData);

    // Route to appropriate provider
    if (useAsterisk) {
      // ── Try Asterisk Bridge first ──────────────────────────────────────────
      logger.info(`Placing call via Asterisk for company ${companyId}`);
      let asteriskResult = null;
      let asteriskError  = null;

      try {
        asteriskResult = await asteriskService.placeCallViaAsterisk(asteriskConfig, {
          leadNumber, leadName, companyName, assistantName,
          greeting: processedFirstMessage, companyPhone,
          callSessionId: sessionId, metadata: payload.metadata || {},
        });
      } catch (err) {
        asteriskError = err.message;
        logger.warn(`[Asterisk] placeCall threw: ${err.message} — will try Twilio fallback`);
      }

      if (asteriskResult?.success) {
        await sessionRef.set(
          { asteriskCallId: asteriskResult.callId, asteriskChannelId: asteriskResult.channelId, status: "dialing" },
          { merge: true },
        );
        res.status(201).json({ status: "initiated", callId: asteriskResult.callId, callSessionId: sessionId, provider: "asterisk" });
        logActivity({ userId: callerUid, action: "call.place", category: "call", resourceType: "call_session", resourceId: sessionId, details: {to: leadNumber, from: companyPhone, scenarioId: scenarioId || null, assistantId: assistantId || null, provider: "asterisk"} }).catch(() => {});
        return; // ✅ done
      }

      // ── Asterisk failed → fall back below ────────────────────────────────
      const reason = asteriskError || asteriskResult?.error || "Asterisk call failed";
      logger.warn(`[Asterisk] Failed (${reason}) — trying next provider`);
      await sessionRef.set({ telephonyProvider: "twilio (asterisk-fallback)", asteriskError: reason }, { merge: true });
      // fall through
    }

    // ── VoxImplant ────────────────────────────────────────────────────────────
    if (useVoxImplant) {
      logger.info(`[VoxImplant] Placing call for company ${companyId}`);
      const BASE_FUNCTION_URL_LOCAL = process.env.FIREBASE_URL ||
        `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net`;

      const voxResult = await voximplantService.placeCallViaVoxImplant(voxConfig, {
        leadNumber,
        leadName,
        companyName,
        assistantName,
        greeting:       processedFirstMessage,
        companyPhone:   voxConfig.callerId || companyPhone,
        callSessionId:  sessionId,
        webhookUrl:     `${BASE_FUNCTION_URL_LOCAL}/voxImplantWebhook`,
        // CLOUD_RUN_URL may not propagate from .env via Firebase CLI (known
        // issue) — without a fallback the scenario dies with
        // missing_cloudRunUrl. Same guard as the Twilio path below.
        cloudRunUrl:    process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-myg46khq7q-uc.a.run.app",
        metadata:       payload.metadata || {},
      });

      if (voxResult.success) {
        await sessionRef.set(
          { voxCallId: voxResult.callId, status: "dialing" },
          { merge: true },
        );
        res.status(201).json({
          status: "initiated",
          callId: voxResult.callId,
          callSessionId: sessionId,
          provider: "voximplant",
        });
        logActivity({ userId: callerUid, action: "call.place", category: "call", resourceType: "call_session", resourceId: sessionId, details: { to: leadNumber, provider: "voximplant" } }).catch(() => {});
        return; // ✅ done
      }

      // VoxImplant failed → fall back to Twilio
      logger.warn(`[VoxImplant] Failed (${voxResult.error}) — falling back to Twilio`);
      await sessionRef.set({ telephonyProvider: "twilio (voximplant-fallback)", voxError: voxResult.error }, { merge: true });
    }

    // ── SIP bridge outbound (per-assistant opt-in) ───────────────────────────
    // If the assistant is configured for telephonyProvider === "sip" and we
    // have a bridge URL set with a healthy bridge, originate the call via
    // Asterisk ARI through your SIP trunk. Falls back to Twilio on any error.
    const wantsSip = (rawAssistantDefinition?.telephonyProvider || "twilio") === "sip";
    if (wantsSip && SIP_BRIDGE_URL) {
      const healthy = await checkBridgeHealth().catch(() => false);
      if (healthy) {
        try {
          const webhookUrl = scenarioId
            ? `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${sessionId}`
            : `${TWILIO_VOICE_WEBHOOK}?callSessionId=${sessionId}`;
          const statusCallbackUrl = `${TWILIO_STATUS_WEBHOOK}?callSessionId=${sessionId}`;
          const bridgeResp = await axios.post(
            `${SIP_BRIDGE_URL}/calls`,
            {
              to: leadNumber,
              from: companyPhone,
              url: webhookUrl,
              statusCallback: statusCallbackUrl,
            },
            {
              headers: { "x-bridge-secret": SIP_BRIDGE_SECRET, "Content-Type": "application/json" },
              timeout: 15000,
            },
          );
          const bridgeCallSid = bridgeResp.data?.callSid;
          if (!bridgeCallSid) throw new Error("SIP bridge did not return a callSid");

          // Stamp provenance on the session so Cloud Run can route updateCall
          // to the bridge and cost attribution can use SIP carrier rates.
          await sessionRef.set({
            telephonyProvider: "sip",
            sipBridgeCallSid:  bridgeCallSid,
            sipTrunk:          bridgeResp.data?.trunk || null,
            twilioSid:         bridgeCallSid,   // keep field name for legacy code that reads it
            status:            "dialing",
          }, { merge: true });

          logger.info(`[SIP] Outbound call placed via bridge`, { callSid: bridgeCallSid, to: leadNumber, trunk: bridgeResp.data?.trunk });
          logActivity({ userId: callerUid, action: "call.place_sip", category: "call", resourceType: "call_session", resourceId: sessionId, details: { to: leadNumber, provider: "sip" } }).catch(() => {});
          res.status(201).json({
            status: "initiated",
            callSid: bridgeCallSid,
            sessionId,
            provider: "sip",
            trunk: bridgeResp.data?.trunk || null,
          });
          return; // ✅ done — Twilio path skipped
        } catch (sipErr) {
          // Mark bridge unhealthy briefly so we don't keep retrying for this call.
          _bridgeHealthy   = false;
          _bridgeCheckedAt = Date.now();
          logger.warn(`[SIP] Outbound via bridge failed (${sipErr.message}) — falling back to Twilio`);
          await sessionRef.set({ telephonyProvider: "twilio (sip-fallback)", sipError: sipErr.message }, { merge: true });
        }
      } else {
        logger.warn(`[SIP] Bridge unhealthy — using Twilio for this call`);
        await sessionRef.set({ telephonyProvider: "twilio (sip-unhealthy)" }, { merge: true });
      }
    }

    if (!useThirdParty || true) { // always reached when no third-party provider or all failed
      // Use Twilio
      logger.info(`Placing call via Twilio for company ${companyId}`);
      
      // Use scenario flow URL if scenario is configured, otherwise use default webhook
      const webhookUrl = scenarioId 
        ? `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${sessionId}`
        : `${TWILIO_VOICE_WEBHOOK}?callSessionId=${sessionId}`;
      
      const twilioCall = await effectiveTwilioClient.calls.create({
        to: leadNumber,
        from: companyPhone,
        url: webhookUrl,
        record: true,
        recordingStatusCallback: `${BASE_FUNCTION_URL}/twilioRecordingCallback?callSessionId=${sessionId}`,
        recordingStatusCallbackMethod: "POST",
        statusCallback: `${TWILIO_STATUS_WEBHOOK}?callSessionId=${sessionId}`,
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      });

      await sessionRef.set(
        {
          twilioSid:         twilioCall.sid,
          telephonyProvider: "twilio",
          status:            "dialing",
        },
        {merge: true},
      );

      res.status(201).json({
        status: "initiated",
        callSid: twilioCall.sid,
        callSessionId: sessionId,
        provider: "twilio",
      });
      logActivity({ userId: callerUid, action: "call.place", category: "call", resourceType: "call_session", resourceId: sessionId, details: {to: leadNumber, from: companyPhone, scenarioId: scenarioId || null, assistantId: assistantId || null, provider: "twilio"} }).catch(() => {});
    }
  } catch (error) {
    logger.error("Failed to place call", { message: error.message, stack: error.stack, code: error.code });
    logAnomaly({
      severity: "error",
      category: "http",
      code: "TWILIO_CREATE_CALL_FAIL",
      message: `Outbound placeCall failed: ${error.message}`,
      details: {
        twilioCode: error.code || null,
        status: error.status || null,
        moreInfo: error.moreInfo || null,
      },
    });
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to place call",
      code: error.code || undefined,
    });
  }
});

/**
 * Internal helper: place an outbound call programmatically (used by campaignStart).
 * Mirrors the placeCall HTTP handler but takes a plain object instead of req/res.
 */
exports._placeCallInternal = async function(payload, ownerUid) {
  const {number, companyPhone, assistantId, metadata} = payload;
  if (!number || !companyPhone || !assistantId) {
    throw new Error("number, companyPhone, and assistantId are required");
  }
  const db = getFirestore();

  // Load assistant definition
  const astSnap = await db.collection("assistants").doc(assistantId).get();
  if (!astSnap.exists) throw new Error(`Assistant ${assistantId} not found`);
  const astData = astSnap.data();

  // Resolve company info
  const companyId = astData.companyId || ownerUid;
  const sessionId = db.collection("call_sessions").doc().id;
  const sessionRef = db.collection("call_sessions").doc(sessionId);

  // Credit check for campaign caller
  if (ownerUid) {
    const userSnap = await db.collection("users").doc(ownerUid).get();
    if (userSnap.exists) {
      const u = userSnap.data();
      if (u.creditGranted) {
        const balance = typeof u.creditBalance === "number" ? u.creditBalance : 0;
        if (balance <= 0) {
          throw new Error("Credit balance exhausted. Upgrade to Pro to continue making calls.");
        }
        if (u.creditExpiresAt) {
          const expiresAt = u.creditExpiresAt.toDate
            ? u.creditExpiresAt.toDate()
            : new Date(u.creditExpiresAt);
          if (expiresAt < new Date()) {
            throw new Error("Trial credit has expired. Upgrade to Pro to continue making calls.");
          }
        }
      }
    }
  }

  // Resolve per-company Twilio credentials (3-tier fallback)
  const effectiveCreds = await getEffectiveTwilioCredentials(companyId, ownerUid);
  const campaignTwilioClient = twilio(effectiveCreds.sid, effectiveCreds.token);

  await sessionRef.set({
    id: sessionId,
    assistantId,
    assistantDefinition: astData,
    assistantName: astData.name || astData.assistantName || "",
    companyId,
    companyName: astData.companyName || "",
    companyPhone,
    leadNumber: number,
    leadName: metadata?.leadName || "",
    status: "initiated",
    metadata: metadata || {},
    ownerId: ownerUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const twilioCall = await campaignTwilioClient.calls.create({
    to: number,
    from: companyPhone,
    url: `${TWILIO_VOICE_WEBHOOK}?callSessionId=${sessionId}`,
    record: true,
    recordingStatusCallback: `${BASE_FUNCTION_URL}/twilioRecordingCallback?callSessionId=${sessionId}`,
    recordingStatusCallbackMethod: "POST",
    statusCallback: `${TWILIO_STATUS_WEBHOOK}?callSessionId=${sessionId}`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });

  await sessionRef.set({twilioSid: twilioCall.sid, status: "dialing"}, {merge: true});
  return {callSid: twilioCall.sid, callSessionId: sessionId};
};

exports.twilioVoiceWebhook = onRequest(
  {minInstances: 1, timeoutSeconds: 120, memory: "512MiB"},
  async (req, res) => {
  // CRITICAL: Log immediately using multiple methods to ensure visibility
  const logData = {
    method: req.method,
    query: req.query,
    bodyKeys: Object.keys(req.body || {}),
    headers: {
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
    },
  };
  
  // Use console.log FIRST (most reliable for Cloud Logging)
  console.log("=== twilioVoiceWebhook CALLED ===");
  console.log(JSON.stringify(logData, null, 2));
  console.log("Request body:", JSON.stringify(req.body || {}, null, 2));
  console.log("Request query:", JSON.stringify(req.query || {}, null, 2));
  
  // Also try logger
  try {
    logger.info("twilioVoiceWebhook called", logData);
  } catch (logError) {
    console.error("Logger failed:", logError);
  }
  
  try {
    // Check if twilio and twilio.twiml are available
    if (!twilio || !twilio.twiml) {
      const errorMsg = "Twilio module not available";
      logger.error(errorMsg, {
        twilioAvailable: !!twilio,
        twimlAvailable: !!(twilio && twilio.twiml),
      });
      console.error(`[twilioVoiceWebhook] ${errorMsg}`, {twilioAvailable: !!twilio, twimlAvailable: !!(twilio && twilio.twiml)});
      
      try {
        const response = new (require("twilio").twiml.VoiceResponse)();
        response.say(
          {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
          "×©×œ×•×. ×”×ž×¢×¨×›×ª ×œ× ×ž×•×’×“×¨×ª ×›×¨××•×™. ×× × ×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.",
        );
        response.hangup();
        res.set("Content-Type", "text/xml");
        res.status(200).send(response.toString());
        return;
      } catch (twilioError) {
        console.error("[twilioVoiceWebhook] Failed to create Twilio response", twilioError);
        res.set("Content-Type", "text/xml");
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">×©×œ×•×. ×”×ž×¢×¨×›×ª ×œ× ×ž×•×’×“×¨×ª ×›×¨××•×™. ×× × ×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.</Say><Hangup/></Response>');
        return;
      }
    }
    
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    console.log("[twilioVoiceWebhook] callSessionId:", callSessionId);
    
    let response;
    try {
      response = new twilio.twiml.VoiceResponse();
      console.log("[twilioVoiceWebhook] Twilio response created successfully");
    } catch (twimlError) {
      logger.error("Failed to create Twilio TwiML response", {
        error: twimlError.message,
        stack: twimlError.stack,
      });
      console.error("[twilioVoiceWebhook] Failed to create TwiML response", twimlError);
      res.set("Content-Type", "text/xml");
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">×©×œ×•×. ×”×ž×¢×¨×›×ª ×œ× ×ž×•×’×“×¨×ª ×›×¨××•×™. ×× × ×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.</Say><Hangup/></Response>');
      return;
    }
    
    const db = getFirestore();
    console.log("[twilioVoiceWebhook] Firestore initialized:", !!db);
    
    if (!db) {
      logger.error("Firestore not available");
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        "×©×œ×•×. ×”×ž×¢×¨×›×ª ×œ× ×ž×•×’×“×¨×ª ×›×¨××•×™. ×× × ×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.",
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    let snapshot = null;
    let sessionId = callSessionId;
    
    // Get callSid early - needed for both inbound and outbound calls
    const callSid = req.body?.CallSid || req.query?.CallSid || "";
    
    // If no callSessionId, this is an incoming call - create session from phone number
    if (!callSessionId) {
      try {
        // Get incoming phone number from Twilio request
        const incomingNumber = req.body?.Called || req.body?.To || req.query?.To || "";
        const callerNumber = req.body?.From || req.body?.Caller || req.query?.From || "";
        
        if (!incomingNumber) {
          logger.warn("Incoming call but no phone number found in request", {body: req.body, query: req.query});
          response.say(
            {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
            getMessage("contactSupport", "he-IL"),
          );
          response.hangup();
          res.set("Content-Type", "text/xml");
          res.status(200).send(response.toString());
          return;
        }
        
        // Find company by phone number
        // Normalize incoming number - try multiple formats
        const normalizePhone = (num) => {
          if (!num) return "";
          let normalized = String(num).replace(/\s+/g, "").replace(/-/g, "").replace(/\(/g, "").replace(/\)/g, "");
          // Keep + prefix for E.164 format matching
          return normalized;
        };
        
        // Create all possible variations of the incoming number
        const normalizedIncoming = normalizePhone(incomingNumber);
        const variations = [
          normalizedIncoming, // Original: +19179243285
          normalizedIncoming.replace(/^\+/, ""), // Without +: 19179243285
          normalizedIncoming.replace(/^\+1/, ""), // Without +1: 9179243285
          normalizedIncoming.replace(/^\+1/, "1"), // With 1 but no +: 19179243285
          incomingNumber, // Original from Twilio
        ];
        
        // Also add variations with/without leading 1
        if (normalizedIncoming.startsWith("+1")) {
          variations.push(normalizedIncoming.substring(2)); // 9179243285
          variations.push(`1${normalizedIncoming.substring(2)}`); // 19179243285
        }
        if (normalizedIncoming.startsWith("1") && !normalizedIncoming.startsWith("+")) {
          variations.push(`+${normalizedIncoming}`); // +19179243285
          variations.push(normalizedIncoming.substring(1)); // 9179243285
        }
        
        logger.info(`Searching for company with incoming number: ${incomingNumber} (normalized: ${normalizedIncoming})`);

        let companyDoc = null;

        // FAST PATH: Try phone_numbers collection first (indexed, O(1) lookup)
        try {
          const phoneDoc = await db.collection("phone_numbers").doc(normalizedIncoming).get();
          if (phoneDoc.exists && phoneDoc.data().assistantId) {
            // Found direct phoneâ†’assistant mapping â€” load the assistant's company
            const pd = phoneDoc.data();
            const astDoc = pd.assistantId ? await db.collection("assistants").doc(pd.assistantId).get() : null;
            if (astDoc && astDoc.exists) {
              const astData = astDoc.data();
              const compId = astData.companyId || pd.companyId;
              if (compId) {
                const cd = await db.collection("Company").doc(compId).get();
                if (cd.exists) {
                  companyDoc = {id: cd.id, ...cd.data()};
                  console.log(`[twilioVoiceWebhook] FAST PATH: Found company ${companyDoc.name} via phone_numbers collection`);
                }
              }
            }
          }
        } catch (fastErr) {
          console.log(`[twilioVoiceWebhook] Fast path failed, falling back to company scan:`, fastErr.message);
        }

        // SLOW PATH: Search all companies if fast path didn't find it
        if (!companyDoc) {
        console.log("[twilioVoiceWebhook] Fetching all companies from Firestore...");
        let allCompanies;
        try {
          allCompanies = await db.collection("Company").get();
          console.log(`[twilioVoiceWebhook] Found ${allCompanies.size} companies`);
        } catch (firestoreError) {
          logger.error("Failed to fetch companies from Firestore", {
            error: firestoreError.message,
            stack: firestoreError.stack,
          });
          console.error("[twilioVoiceWebhook] Failed to fetch companies", firestoreError);
          throw firestoreError;
        }
        
        for (const company of allCompanies.docs) {
          const companyData = company.data();
          
          // Check phoneNumberMap (array of objects with phoneNumber field)
          const phoneNumberMap = companyData.phoneNumberMap || [];
          const hasNumberInMap = phoneNumberMap.some((entry) => {
            if (!entry || typeof entry !== 'object') return false;
            const entryNumber = entry.phoneNumber || "";
            const normalizedEntry = normalizePhone(entryNumber);
            
            // Check all variations
            return variations.some((variant) => {
              const normalizedVariant = normalizePhone(variant);
              return normalizedEntry === normalizedVariant || 
                     entryNumber === variant ||
                     normalizedEntry === variant ||
                     entryNumber === normalizedVariant;
            });
          });
          
          // Also check companyPhoneNumbers (array of strings)
          const companyPhoneNumbers = companyData.companyPhoneNumbers || [];
          const hasNumberInList = companyPhoneNumbers.some((num) => {
            if (!num) return false;
            const normalizedNum = normalizePhone(num);
            
            // Check all variations
            return variations.some((variant) => {
              const normalizedVariant = normalizePhone(variant);
              return normalizedNum === normalizedVariant || 
                     num === variant ||
                     normalizedNum === variant ||
                     num === normalizedVariant;
            });
          });
          
          if (hasNumberInMap || hasNumberInList) {
            companyDoc = {id: company.id, ...companyData};
            logger.info(`Found company ${company.id} (${companyData.name || 'unnamed'}) for incoming number ${incomingNumber}`);
            break;
          }
        }
        
        if (!companyDoc) {
          logger.warn(`No company found for incoming number: ${incomingNumber} (tried variations: ${variations.join(', ')})`);
          logger.info(`Total companies checked: ${allCompanies.size}`);
          
          // Try to find a company with assistant configuration and auto-assign the number
          let companyToAssign = null;
          for (const company of allCompanies.docs) {
            const companyData = company.data();
            // Check if company has assistant configuration
            if (companyData.inboundmessage || companyData.assistantname) {
              companyToAssign = {id: company.id, ...companyData};
              logger.info(`Auto-assigning number ${incomingNumber} to company ${company.id} (${companyData.name || 'unnamed'})`);
              break;
            }
          }
          
          if (companyToAssign) {
            // Get Twilio SID for this number
            let twilioSid = null;
            if (twilioClient) {
              try {
                const twilioNumbers = await twilioClient.incomingPhoneNumbers.list({
                  phoneNumber: incomingNumber,
                  limit: 1,
                });
                if (twilioNumbers && twilioNumbers.length > 0) {
                  twilioSid = twilioNumbers[0].sid;
                }
              } catch (twilioError) {
                logger.warn(`Could not fetch Twilio SID for ${incomingNumber}:`, twilioError);
              }
            } else {
              logger.warn(`Twilio client not initialized, cannot fetch SID for ${incomingNumber}`);
            }
            
            // Add number to company
            try {
              const companyRef = db.collection("Company").doc(companyToAssign.id);
              await db.runTransaction(async (trx) => {
                const snapshot = await trx.get(companyRef);
                if (!snapshot.exists) {
                  return;
                }
                
                const data = snapshot.data() || {};
                const currentNumbers = collectPhoneNumbers(data?.companyPhoneNumbers || []);
                currentNumbers.add(incomingNumber);
                
                const phoneEntry = {
                  id: twilioSid || `auto-${Date.now()}`,
                  label: "inbound_outbound",
                  phoneNumber: incomingNumber,
                };
                
                const nextEntries = upsertPhoneEntry(data?.phoneNumberMap || [], phoneEntry);
                
                trx.set(
                  companyRef,
                  {
                    companyPhoneNumbers: Array.from(currentNumbers),
                    phoneNumberMap: nextEntries,
                  },
                  {merge: true},
                );
              });
              
              logger.info(`Successfully added number ${incomingNumber} to company ${companyToAssign.id}`);
              companyDoc = companyToAssign;
            } catch (assignError) {
              logger.error(`Failed to auto-assign number ${incomingNumber} to company:`, assignError);
            }
          }
          
          if (!companyDoc) {
            logger.error(`No company found and auto-assignment failed for number: ${incomingNumber}`);
            response.say(
              {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
              "×©×œ×•×. ×”×ž×¡×¤×¨ ×”×–×” ×œ× ×ž×©×•×™×š ×œ×ž×¢×¨×›×ª. ×× × ×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.",
            );
            response.hangup();
            res.set("Content-Type", "text/xml");
            res.status(200).send(response.toString());
            return;
          }
        }
        } // End of SLOW PATH (if !companyDoc from fast path)

        // Verify company has assistant configuration
        if (!companyDoc.inboundmessage && !companyDoc.assistantname) {
          logger.warn(`Company ${companyDoc.id} found but missing assistant configuration`);
          response.say(
            {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
            "×©×œ×•×. ×”×¢×•×–×¨ ×”×•×•×™×¨×˜×•××œ×™ ×œ× ×ž×•×’×“×¨ ×¢×‘×•×¨ ×ž×¡×¤×¨ ×–×”. ×× × ×¦×•×¨ ×§×©×¨ ×¢× ×”×ª×ž×™×›×”.",
          );
          response.hangup();
          res.set("Content-Type", "text/xml");
          res.status(200).send(response.toString());
          return;
        }
        
        // Create new call session for incoming call
        const sessionRef = db.collection("call_sessions").doc();
        sessionId = sessionRef.id;

        // Check if the phoneNumberMap entry has a specific assistantId for this number
        let specificAssistant = null;
        const phoneMap = companyDoc.phoneNumberMap || [];
        const matchedEntry = phoneMap.find((entry) => {
          if (!entry || !entry.phoneNumber) return false;
          return normalizePhone(entry.phoneNumber) === normalizePhone(incomingNumber);
        });
        // Primary: assistantId stored in the phoneNumberMap entry
        const resolvedAssistantId = matchedEntry?.assistantId
          // Fallback: assistantId embedded in the Twilio webhook URL by configurePhoneNumber
          // e.g. .../twilioVoiceWebhook?assistantId=abc123
          || req.query.assistantId
          || null;
        if (resolvedAssistantId) {
          try {
            const astDoc = await db.collection("assistants").doc(resolvedAssistantId).get();
            if (astDoc.exists) {
              specificAssistant = {id: astDoc.id, ...astDoc.data()};
              logger.info(`Using specific assistant ${specificAssistant.name || specificAssistant.assistantName} for number ${incomingNumber} (source: ${matchedEntry?.assistantId ? "phoneMap" : "queryParam"})`);
            }
          } catch (astErr) {
            logger.warn(`Could not load specific assistant ${resolvedAssistantId}:`, astErr.message);
          }
        }

        // Build assistant definition â€” use specific assistant if mapped, else company default
        const assistantName = specificAssistant?.name || specificAssistant?.assistantName || companyDoc.assistantname || "Virtual Assistant";
        // Prefer specific assistant's companyName to avoid mixing with a different company
        const companyName = specificAssistant?.companyName || companyDoc.name || "our team";
        const companyLanguage = specificAssistant?.language || companyDoc.language || "en-US";
        const rawFirstMessage = specificAssistant?.firstMessage || companyDoc.inboundmessage || getMessage("defaultGreeting", companyLanguage);

        // Replace placeholders in firstMessage
        const processedFirstMessage = replacePlaceholders(rawFirstMessage, {
          assistantName: assistantName,
          companyName: companyName,
          leadName: "", // No lead name for inbound calls
        });

        // Get STT provider from company settings
        const sttProvider = companyDoc.transcriber?.provider || companyDoc.sttProvider || "twilio";
        const sttModel = companyDoc.transcriber?.model || companyDoc.sttModel || "nova-2";

        // FIX (Issue 1 â€” Arabic bot silent):
        // Pick a language-appropriate default voice so Cloud Run never receives
        // an English voice for a non-English assistant.  Previously the fallback
        // was always DEFAULT_ENGLISH_VOICE, causing Google TTS to reject Arabic
        // text synthesised with an English voice â†’ TTS failure â†’ silent bot.
        // FIX (Issue 2 â€” wrong-language stored voice):
        // Even when a voice is explicitly stored on the assistant (e.g. "Google.en-US-Neural2-F"
        // for an Arabic assistant), validate it through resolveVoiceForLanguage so a
        // language-mismatched voice is corrected to the right language's default.
        const rawVoice = specificAssistant?.voice
          || companyDoc.voice
          || DEFAULT_VOICES[companyLanguage]   // language-appropriate default
          || DEFAULT_VOICES[companyLanguage.split("-")[0]]  // e.g. "ar" from "ar-XA"
          || DEFAULT_ENGLISH_VOICE;            // last resort
        const resolvedVoice = resolveVoiceForLanguage(rawVoice, companyLanguage);

        // FIX (Issue 1 secondary): use assistant-level sttModel (not company-level)
        // so the per-assistant STT override reaches Cloud Run.
        const resolvedSttModel = specificAssistant?.sttModel || sttModel;

        const assistantDefinition = {
          id: specificAssistant?.id || null,
          name: assistantName,
          assistantName: assistantName,
          companyName: companyName,
          firstMessage: processedFirstMessage,
          // Custom instructions â€” CRITICAL for avoiding company context mix-up
          systemPrompt: specificAssistant?.systemPrompt || "",
          voice: resolvedVoice,
          language: companyLanguage,
          // Advanced AI settings from the specific assistant
          llmModel: specificAssistant?.llmModel || "gpt-4o-mini",
          temperature: specificAssistant?.temperature ?? 0.8,
          maxTokens: specificAssistant?.maxTokens || 150,
          speechSpeed: specificAssistant?.speechSpeed || 1.0,
          voiceStability: specificAssistant?.voiceStability ?? 0.5,
          transcriber: {
            provider: sttProvider,
            model: resolvedSttModel,
            language: companyLanguage,
          },
          sttProvider: sttProvider,
          sttModel: resolvedSttModel,   // was company-level only â€” now assistant-level preferred
          // FIX (Issue 1 secondary): these personality/style fields were missing from
          // the inbound-call assistantDefinition, causing Cloud Run to always use
          // default values (friendly vibe, neutral gender, no accent) regardless of
          // what the user configured in the assistant editor.
          assistantVibe: specificAssistant?.assistantVibe || "friendly",
          callerGender: specificAssistant?.callerGender || "neutral",
          voiceAccent: specificAssistant?.voiceAccent || "default",
          // Voice provider — determines which bridge Cloud Run uses
          voiceProvider: specificAssistant?.voiceProvider || (specificAssistant?.realtimeEnabled ? "openai-realtime" : "classic"),
          // Voice-to-voice settings (OpenAI Realtime + Gemini Live share these)
          // gemini-hybrid MUST be here too: realtimeEnabled decides <Connect><Stream>
          // (bidirectional — bot audio reaches the caller) vs Standard mode
          // (Wavenet <Say> + one-way <Start><Stream>, where Gemini audio is
          // silently discarded). Missing it sent hybrid calls down the Standard
          // path: caller heard Wavenet TTS reading the raw greeting (incl. '<'),
          // never Gemini (calls PuY9mjN2OuFtOWApOAap and earlier).
          realtimeEnabled: (specificAssistant?.realtimeEnabled ||
            ["gemini-live", "gemini-hybrid", "openai-realtime"].includes(specificAssistant?.voiceProvider)) ? true : false,
          realtimeVoice: specificAssistant?.realtimeVoice || "alloy",
          realtimeVadMode: specificAssistant?.realtimeVadMode || null,
          realtimeVadSensitivity: specificAssistant?.realtimeVadSensitivity || null,
          // Scenario that drives the realtime session (only used when realtimeEnabled=true)
          realtimeScenarioId: specificAssistant?.realtimeScenarioId || null,
          customTools: specificAssistant?.customTools || [],
          feedbackCallEnabled: specificAssistant?.feedbackCallEnabled || false,
        };

        // Create session data
        // Resolve ownerId: from specific assistant, or from company creator
        const sessionOwnerId = specificAssistant?.ownerId || companyDoc.createdBy || companyDoc.ownerId || null;
        const sessionData = {
          id: sessionId,
          ownerId: sessionOwnerId, // CRITICAL: must be set for ownership-based queries
          assistantId: specificAssistant?.id || null,
          companyId: companyDoc.id,
          assistantDefinition,
          leadNumber: callerNumber,
          companyPhone: incomingNumber,
          companyName: companyName,  // Must use the resolved companyName (prefers specificAssistant.companyName)
          assistantName: assistantName,  // Must use the resolved assistantName (prefers specificAssistant)
          // Carrier detection: the SIP bridge posts AccountSid = BRIDGE_SECRET,
          // real Twilio posts an "AC..." account SID. Tag the true carrier so
          // cost attribution is right AND in-call updateCall (hangup/transfer)
          // routes to the SIP bridge instead of 404ing against Twilio REST.
          telephonyProvider: String(req.body?.AccountSid || "").startsWith("AC") ? "twilio" : "sip",
          status: "in-progress",
          twilioSid: callSid,
          callType: "inbound",
          conversationHistory: [],
          metadata: {
            callType: "inbound",
            callerNumber: callerNumber,
          },
          // If the assistant is realtime-enabled and has a scenario, pass it through
          // so Cloud Run's RealtimeScenarioRunner can drive the conversation.
          ...(assistantDefinition.realtimeEnabled && assistantDefinition.realtimeScenarioId
            ? { scenarioId: assistantDefinition.realtimeScenarioId }
            : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        
        await sessionRef.set(sessionData);
        logger.info(`Created inbound call session ${sessionId} for company ${companyDoc.id}`);
        
        // Get the session we just created
        snapshot = await sessionRef.get();
      } catch (incomingError) {
        // CRITICAL: Log with maximum detail
        const errorDetails = {
          error: incomingError.message,
          stack: incomingError.stack,
          name: incomingError.name,
          code: incomingError.code,
          errno: incomingError.errno,
          syscall: incomingError.syscall,
          incomingNumber: req.body?.Called || req.body?.To || req.query?.To,
          callerNumber: req.body?.From || req.body?.Caller || req.query?.From,
          callSid: callSid,
          body: req.body,
          query: req.query,
        };
        
        console.error("[twilioVoiceWebhook] INCOMING CALL ERROR:", JSON.stringify(errorDetails, null, 2));
        logger.error("Failed to handle incoming call", errorDetails);
        
        try {
          response.say(
            {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
            "××™×¨×¢×” ×©×’×™××” ×‘×œ×ª×™ ×¦×¤×•×™×”. ×× × × ×¡×” ×©×•×‘ ×ž××•×—×¨ ×™×•×ª×¨.",
          );
          response.hangup();
          res.set("Content-Type", "text/xml");
          res.status(200).send(response.toString());
        } catch (responseError) {
          console.error("[twilioVoiceWebhook] Failed to send error response", responseError);
          // Last resort: send raw XML
          res.set("Content-Type", "text/xml");
          res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">××™×¨×¢×” ×©×’×™××” ×‘×œ×ª×™ ×¦×¤×•×™×”. ×× × × ×¡×” ×©×•×‘ ×ž××•×—×¨ ×™×•×ª×¨.</Say><Hangup/></Response>');
        }
        return;
      }
    } else {
      // Existing session (outbound call)
      snapshot = await db.collection("call_sessions").doc(String(callSessionId)).get();
      
      if (!snapshot.exists) {
        response.say(
          {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
          getMessage("assistantNotFound", "he-IL"),
        );
        response.hangup();
        res.set("Content-Type", "text/xml");
        res.status(200).send(response.toString());
        return;
      }
    }

    const data = snapshot.data();
    
    // Validate that we have session data
    if (!data) {
      console.error("[twilioVoiceWebhook] Session data is null or undefined", {sessionId, callSessionId});
      logger.error("Session data is null or undefined", {sessionId, callSessionId});
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        getMessage("assistantNotFound", "he-IL"),
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    // Check if this session uses a scenario flow
    // IMPORTANT: Inbound calls with realtimeEnabled+scenarioId use WebRTC (Cloud Run),
    // NOT TwiML scenario flow. TwiML scenario flow is only for outbound non-realtime calls.
    const isInboundCall = data.callType === "inbound" || !callSessionId;
    const isRealtimeScenario = data.assistantDefinition?.realtimeEnabled && data.scenarioId;
    if (data.scenarioId && !isInboundCall && !isRealtimeScenario) {
      // Redirect to TwiML scenario flow execution (only for outbound non-realtime calls with scenario)
      console.log("[twilioVoiceWebhook] Using TwiML scenario flow for outbound call", {scenarioId: data.scenarioId, sessionId});
      logger.info("Using TwiML scenario flow for outbound call", {scenarioId: data.scenarioId, sessionId});
      response.redirect(
        `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${sessionId}`
      );
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // For inbound calls (or realtime+scenario calls), use dynamic LLM / WebRTC
    if (isInboundCall || isRealtimeScenario) {
      console.log("[twilioVoiceWebhook] Using dynamic LLM for call", {sessionId, isInboundCall, isRealtimeScenario, hasScenarioId: !!data.scenarioId});
      logger.info("Using dynamic LLM for call", {sessionId, isInboundCall, isRealtimeScenario, hasScenarioId: !!data.scenarioId});
    }
    
    const assistant = data.assistantDefinition || {};
    
    // Validate assistant definition
    if (!assistant || Object.keys(assistant).length === 0) {
      console.error("[twilioVoiceWebhook] Assistant definition is missing or empty", {sessionId, callSessionId, hasData: !!data});
      logger.error("Assistant definition is missing or empty", {sessionId, callSessionId, hasData: !!data});
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        getMessage("assistantNotFound", "he-IL"),
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    // Get voice settings from assistant definition
    const language = assistant.language || "en-US";
    const voiceId = resolveVoiceForLanguage(assistant.voice, language);
    const speechSpeed = assistant.speechSpeed || 1.0;
    
    // Get the processed greeting (placeholders already replaced in placeCall)
    console.log("[twilioVoiceWebhook] Getting greeting...");
    const greeting =
      assistant.firstMessage ||
      assistant.greeting ||
      getMessage("defaultGreeting", language);
    
    // Validate greeting
    if (!greeting || !greeting.trim()) {
      console.error("[twilioVoiceWebhook] Greeting is empty", {sessionId, callSessionId, assistant});
      logger.error("Greeting is empty", {sessionId, callSessionId, assistant});
      // Use default greeting
      const defaultGreeting = getMessage("defaultGreeting", language);
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        defaultGreeting,
      );
    } else {
      console.log("[twilioVoiceWebhook] Greeting:", greeting?.substring(0, 50) + "...");
    }

    // Initialize conversation history if not exists.
    // For Realtime (V2V) mode: do NOT pre-save the firstMessage here.
    // The Cloud Run Realtime bridge generates the greeting via OpenAI and logs it
    // via transcript events â€” pre-saving creates a ghost entry that was never spoken.
    // For Standard mode: pre-save so the LLM sees the greeting as context on the first turn.
    console.log("[twilioVoiceWebhook] Initializing conversation history...");
    const conversationHistory = data.conversationHistory || [];
    if (!assistant.realtimeEnabled && conversationHistory.length === 0) {
      console.log("[twilioVoiceWebhook] Standard mode â€” saving greeting to conversation history...");
      conversationHistory.push({
        role: "assistant",
        content: greeting,
        timestamp: new Date(),
      });
      snapshot.ref.set({
        conversationHistory,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true}).catch((err) => {
        console.error("[twilioVoiceWebhook] Failed to save conversation history:", err.message);
      });
    }

    // FIX (Issue 1 secondary): Twilio <Say> requires a proper BCP-47 locale tag.
    // Previously, Arabic bots got language="ar" (no region) which Twilio may
    // reject or handle inconsistently with Google voices.  Map to Twilio-supported
    // locale codes for all languages handled by this platform.
    const sayLanguage = language.startsWith("he") ? "he-IL"
      : language.startsWith("ar") ? "ar-XA"
      : language.startsWith("el") ? "el-GR"
      : language.startsWith("af") ? "af-ZA"
      : language.startsWith("zu") ? "en-ZA"   // No native Zulu TTS voice; use SA English
      : (language || "en-US");
    console.log("[twilioVoiceWebhook] Saying greeting with voice:", voiceId, "language:", sayLanguage);

    // Use sessionId (which is either callSessionId for outbound or newly created for inbound)
    const finalSessionId = sessionId || callSessionId;

    // â”€â”€ Speech Recognition Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // NOTE: Twilio Media Streams (Deepgram) requires WebSocket (wss://) which
    // Firebase Cloud Functions (onRequest) cannot handle. WebSocket support
    // requires a separate Cloud Run service deployment.
    // Using Twilio Gather as the primary STT provider.
    // Gather with nested <Say> provides automatic barge-in (interruption).
    // Twilio STT uses different locale codes than TTS voices.
    // Arabic TTS uses ar-XA (Google WaveNet), but Twilio Gather STT needs ar-SA.
    const gatherLanguage = language?.startsWith("he") ? "he-IL"
      : language?.startsWith("ar") ? "ar-SA"
      : language?.startsWith("el") ? "el-GR"
      : language?.startsWith("af") ? "af-ZA"
      : language?.startsWith("zu") ? "en-ZA"
      : (language || "en-US");

    // Hebrew speech hints for improved recognition quality
    const hebrewHints = language?.startsWith("he")
      ? "×©×œ×•×,×›×Ÿ,×œ×,×ª×•×“×”,×× ×™,×ž×¢×•× ×™×™×Ÿ,×œ× ×ž×¢×•× ×™×™×Ÿ,×‘×‘×§×©×”,×ž×”,××™×š,×ž×ª×™,×œ×ž×”,×¢×–×¨×”,×©×™×¨×•×ª,×ž×™×“×¢,×œ×”×ª×¨××•×ª,×˜×•×‘,×‘×¡×“×¨,× ×›×•×Ÿ,××•×§×™×™,×¨×’×¢,×©× ×™×™×”"
      : "";

    try {
      const greetingToSay = greeting || getMessage("defaultGreeting", language);
      const isHebrew = gatherLanguage?.startsWith("he");
      const callbackUrl = `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${finalSessionId}`;

      // ALL languages (Hebrew, English, Arabic) now use Cloud Run WebSocket streaming.
      // Cloud Run handles Deepgram STT (nova-3-general, Hebrew/English/Arabic),
      // filler phrases, GPT-4o-mini LLM, and TwiML responses via REST API updates.
      // CLOUD_RUN_URL may not propagate from .env via Firebase CLI (known .gitignore issue),
      // so we hardcode the deployed URL as a fallback to guarantee WebSocket is always used.
      // URL format: {service}-{project-hash}-uc.a.run.app  (NOT the old project-number format)
      // NOTE: production service lives in us-central1 (verified 2026-06-10);
      // the previous me-west1 fallback was stale.
      const CLOUD_RUN_FALLBACK = "https://voiceflow-mediastream-myg46khq7q-uc.a.run.app";
      const cloudRunUrl = process.env.CLOUD_RUN_URL || CLOUD_RUN_FALLBACK;
      logger.info("Cloud Run URL resolution", {
        fromEnv: !!process.env.CLOUD_RUN_URL,
        url: cloudRunUrl,
        callSessionId: finalSessionId,
        language: gatherLanguage,
      });

      if (assistant.realtimeEnabled) {
        // Voice-to-voice path: <Connect><Stream> is BIDIRECTIONAL, required so that
        // we can inject OpenAI Realtime audio back to the caller. No <Say>, no <Pause>.
        const connect = response.connect();
        connect.stream({
          url: `wss://${cloudRunUrl.replace(/^https?:\/\//, "")}/stream/${finalSessionId}`,
        });
      } else {
        // Standard path: <Start><Stream> (one-way audio to us; we reply via TwiML REST updates)
        // FIX (Recording bug): Use inbound_track only.
        // both_tracks causes Twilio error 21220 ("not eligible for recording") when
        // concurrent REST API recording is attempted.  Cloud Run only ever processes
        // the inbound track (outbound is filtered at the WebSocket handler level), so
        // switching to inbound_track is safe and re-enables REST recording.
        response.say({voice: voiceId, language: sayLanguage}, applySpeed(greetingToSay, speechSpeed, language));
        const start = response.start();
        start.stream({
          url: `wss://${cloudRunUrl.replace(/^https?:\/\//, "")}/stream/${finalSessionId}`,
          track: "inbound_track",
        });
        response.pause({length: "120"});
      }

      logger.info("Voice webhook greeting set up", {
        callSid: callSid || "unknown",
        callSessionId: finalSessionId,
        language: gatherLanguage,
        mode: "stream",
        greetingLength: greetingToSay.length,
      });
    } catch (gatherError) {
      console.error("[twilioVoiceWebhook] Failed to create greeting", gatherError);
      logger.error("Failed to create greeting", {
        error: gatherError.message,
        callSessionId: finalSessionId,
      });
      // Fallback: Say greeting without interaction
      try {
        response.say(
          {voice: voiceId || DEFAULT_HEBREW_VOICE, language: sayLanguage || "he-IL"},
          greeting || getMessage("defaultGreeting", "he-IL"),
        );
      } catch (fallbackSayError) {
        response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("defaultGreeting", "he-IL"));
      }
    }

    // Safety net: If Record/Gather times out or callback fails, redirect back
    response.redirect({method: "POST"},
      `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${finalSessionId}`);

    // Start call recording via Twilio REST API (for inbound calls)
    // Awaited with full error logging so we know why it fails
    logger.info("Recording gate check", {
      callType: data.callType,
      hasCallSid: !!callSid,
      hasTwilioClient: !!twilioClient,
      callSessionId: finalSessionId,
    });
    // Skip Twilio REST recording entirely for realtime assistants:
    // <Connect><Stream> hands off the whole call so Twilio recording captures nothing.
    // The Cloud Run bridge records both sides directly and uploads a stereo WAV.
    if (data.callType === "inbound" && callSid && twilioClient && !data.assistantDefinition?.realtimeEnabled) {
      try {
        logger.info("Attempting to start recording", {callSid, callSessionId: finalSessionId});
        const recording = await twilioClient.calls(callSid).recordings.create({
          recordingStatusCallback: `${BASE_FUNCTION_URL}/twilioRecordingCallback?callSessionId=${finalSessionId}`,
          recordingStatusCallbackMethod: "POST",
          recordingChannels: "dual",
        });
        logger.info("Started recording for inbound call", {callSid, recordingSid: recording.sid, callSessionId: finalSessionId});
        // Save the recording SID so we can correlate callbacks
        snapshot.ref.set({twilioRecordingSid: recording.sid}, {merge: true}).catch(() => {});
      } catch (recErr) {
        logger.error("Failed to start recording for inbound call", {
          error: recErr.message,
          code: recErr.code,
          status: recErr.status,
          moreInfo: recErr.moreInfo,
          callSid,
          callSessionId: finalSessionId,
        });
        logAnomaly({
          severity: "error",
          category: "recording",
          code: "TWILIO_RECORDING_FAIL",
          message: `Failed to start recording for inbound call: ${recErr.message}`,
          callSessionId: finalSessionId,
          callSid,
          ownerId: data.ownerId || null,
          assistantId: data.assistantId || null,
          details: {
            twilioCode: recErr.code || null,
            status: recErr.status || null,
            moreInfo: recErr.moreInfo || null,
          },
        });
      }
    } else {
      logger.warn("Recording skipped â€” conditions not met", {
        isInbound: data.callType === "inbound",
        hasCallSid: !!callSid,
        hasTwilioClient: !!twilioClient,
      });
    }

    // Update session status
    try {
      await snapshot.ref.set(
        {
          status: "in-progress",
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    } catch (updateError) {
      console.error("[twilioVoiceWebhook] Failed to update session status", updateError);
      logger.warn("Failed to update session status", {error: updateError.message, sessionId});
      // Continue anyway - the response is already built
    }

    // Send response
    try {
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      console.log("[twilioVoiceWebhook] Response sent successfully");
    } catch (sendError) {
      console.error("[twilioVoiceWebhook] Failed to send response", sendError);
      logger.error("Failed to send response", {error: sendError.message});
      // Response might already be sent, but log the error
    }
  } catch (error) {
    // Log detailed error information - use console.error as backup
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      query: req.query,
      bodyKeys: Object.keys(req.body || {}),
      callSessionId: req.query.callSessionId || req.body?.callSessionId,
      incomingNumber: req.body?.Called || req.body?.To || req.query?.To,
      twilioAvailable: !!twilio,
      twimlAvailable: !!(twilio && twilio.twiml),
    };
    
    try {
      logger.error("Twilio voice webhook failed", errorDetails);
    } catch (logError) {
      console.error("[twilioVoiceWebhook] Failed to log error:", logError);
    }
    
    console.error("[twilioVoiceWebhook] ERROR:", JSON.stringify(errorDetails, null, 2));
    
    // Try to create response, but handle if twilio is not available
    let response;
    try {
      response = new twilio.twiml.VoiceResponse();
    } catch (twilioError) {
      console.error("[twilioVoiceWebhook] Failed to create Twilio response in error handler", twilioError);
      // Fallback: return simple XML
      res.set("Content-Type", "text/xml");
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">××™×¨×¢×” ×©×’×™××” ×‘×œ×ª×™ ×¦×¤×•×™×”. ×× × × ×¡×” ×©×•×‘ ×ž××•×—×¨ ×™×•×ª×¨.</Say><Hangup/></Response>');
      return;
    }
    
    response.say(
      {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
      "××™×¨×¢×” ×©×’×™××” ×‘×œ×ª×™ ×¦×¤×•×™×”. ×× × × ×¡×” ×©×•×‘ ×ž××•×—×¨ ×™×•×ª×¨.",
    );
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

/**
 * Handle speech results from Twilio Gather OR Record+Deepgram
 * When source=record (Hebrew), downloads recording and transcribes via Deepgram API.
 * When source is not set (non-Hebrew), uses Twilio's built-in STT result.
 */
exports.twilioGatherCallback = onRequest(async (req, res) => {
  const startTime = Date.now();

  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const isRecordSource = req.query?.source === "record" || !!req.body?.RecordingUrl;
    let speechResult = req.body?.SpeechResult || "";
    let speechConfidence = req.body?.Confidence || 0;

    // â”€â”€ DEEPGRAM TRANSCRIPTION (Hebrew Record mode) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (isRecordSource && req.body?.RecordingUrl) {
      const recordingUrl = req.body.RecordingUrl;
      const recordingSid = req.body?.RecordingSid || "unknown";
      const recordingDuration = req.body?.RecordingDuration || 0;

      logger.info("Record callback - transcribing with Deepgram", {
        callSessionId, recordingSid, recordingDuration, recordingUrl,
      });

      // ALWAYS try to transcribe â€” even duration=0 recordings may contain
      // short words like "×›×Ÿ" / "×œ×" that Twilio rounds down to 0 seconds
      try {
        // Download recording from Twilio
        const audioResponse = await axios.get(`${recordingUrl}.mp3`, {
          auth: {username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN},
          responseType: "arraybuffer",
          timeout: 5000,
        });

        // Transcribe with Deepgram REST API (nova-3 supports Hebrew natively)
        const dgResponse = await axios.post(
          "https://api.deepgram.com/v1/listen?language=he&model=nova-3&smart_format=true&punctuate=true",
          audioResponse.data,
          {
            headers: {
              "Authorization": `Token ${DEEPGRAM_API_KEY}`,
              "Content-Type": "audio/mpeg",
            },
            timeout: 5000,
          },
        );

        speechResult = dgResponse.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        speechConfidence = dgResponse.data?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

        logger.info("Deepgram transcription success", {
          callSessionId,
          transcript: speechResult,
          confidence: speechConfidence,
          recordingDuration,
          deepgramTimeMs: Date.now() - startTime,
        });
      } catch (dgError) {
        logger.error("Deepgram transcription failed", {
          callSessionId,
          error: dgError.message,
          status: dgError.response?.status,
        });
        logAnomaly({
          severity: "error",
          category: "stt",
          code: "DEEPGRAM_TRANSCRIBE_FAIL",
          message: `Deepgram REST transcription failed: ${dgError.message}`,
          callSessionId,
          details: {
            status: dgError.response?.status || null,
            recordingSid,
            recordingDuration,
          },
        });
        speechResult = "";
        speechConfidence = 0;
      }
    }
    // â”€â”€ END DEEPGRAM TRANSCRIPTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    console.log("=== twilioGatherCallback CALLED ===");
    console.log("callSessionId:", callSessionId);
    console.log("source:", isRecordSource ? "record+deepgram" : "gather+twilio");
    console.log("speechResult:", speechResult || "(empty)");
    console.log("speechConfidence:", speechConfidence);

    logger.info("Speech callback processed", {
      callSessionId,
      source: isRecordSource ? "record+deepgram" : "gather+twilio",
      speechResult: speechResult || "(empty)",
      speechResultLength: speechResult?.length || 0,
      speechConfidence,
      hasSpeechResult: !!speechResult && speechResult.trim().length > 0,
      processingTimeMs: Date.now() - startTime,
    });
    
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("thankYouGoodbye", "he-IL"));
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const snapshot = await sessionRef.get();

    if (!snapshot.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("thankYouGoodbye", "he-IL"));
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const data = snapshot.data();
    const assistant = data.assistantDefinition || {};
    const speechSpeed = assistant.speechSpeed || 1.0;
    // Ensure language is always set to he-IL for Hebrew (not just "he")
    let language = assistant.language || "en-US";
    if (language === "he") {
      language = "he-IL";
    }
    const voiceId = resolveVoiceForLanguage(assistant.voice, language);
    const leadId = data.metadata?.leadId || null;
    const companyId = data.companyId || null;
    
    // Start company data fetch EARLY (non-blocking) - runs in parallel
    // while we process speech and check for empty results
    const companyDataPromise = companyId
      ? db.collection("Company").doc(companyId).get().catch((err) => {
          logger.warn(`Could not fetch company data for ${companyId}:`, err);
          return null;
        })
      : Promise.resolve(null);

    // Initialize conversation history
    const conversationHistory = data.conversationHistory || [];
    const isFirstMessage = conversationHistory.length === 0;
    
    // Log if speechResult is empty
    const hasSpeechResult = speechResult && speechResult.trim();
    
    if (!hasSpeechResult) {
      // Track how many times we got empty speech (prevent infinite loop)
      const emptyCount = (data.emptyResultCount || 0) + 1;

      logger.warn("Empty speech result received", {
        callSessionId,
        body: req.body,
        query: req.query,
        isFirstMessage,
        emptyCount,
      });

      // Update empty count in Firestore (fire-and-forget)
      sessionRef.set({emptyResultCount: emptyCount}, {merge: true}).catch(() => {});

      const sayLanguage = language.startsWith("he") ? "he-IL"
        : language.startsWith("ar") ? "ar-XA"
        : language.startsWith("el") ? "el-GR"
        : (language || "en-US");
      // Twilio Gather STT needs proper locale codes (different from TTS)
      const gatherLanguage = language.startsWith("he") ? "he-IL"
        : language.startsWith("ar") ? "ar-SA"
        : language.startsWith("el") ? "el-GR"
        : language.startsWith("af") ? "af-ZA"
        : language.startsWith("zu") ? "en-ZA"
        : (language || "en-US");
      const isHebrew = language?.startsWith("he");
      const isArabic = language?.startsWith("ar");
      const callbackUrl = `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${callSessionId}`;

      // After 3 empty attempts, say goodbye instead of looping forever
      if (emptyCount >= 3) {
        const goodbyeMsg = isHebrew
          ? "× ×¨××” ×©×™×© ×‘×¢×™×™×ª ×§×œ×™×˜×”. × ×™×¦×•×¨ ×§×©×¨ ×‘×–×ž×Ÿ ××—×¨. ×™×•× ×˜×•×‘!"
          : isArabic
            ? "ÙŠØ¨Ø¯Ùˆ Ø£Ù† Ù‡Ù†Ø§Ùƒ Ù…Ø´ÙƒÙ„Ø© ÙÙŠ Ø§Ù„Ø§ØªØµØ§Ù„. Ø³Ù†ØªÙˆØ§ØµÙ„ Ù…Ø¹Ùƒ Ù„Ø§Ø­Ù‚Ø§Ù‹. Ù…Ø¹ Ø§Ù„Ø³Ù„Ø§Ù…Ø©!"
            : "It seems we're having connection issues. We'll try again later. Goodbye!";
        response.say({voice: voiceId, language: sayLanguage}, goodbyeMsg);
        response.hangup();
        res.set("Content-Type", "text/xml");
        res.status(200).send(response.toString());
        return;
      }

      // Vary the "didn't hear" message to sound more natural
      const repeatMessages = isHebrew
        ? [
            "×œ× ×©×ž×¢×ª×™, ××¤×©×¨ ×œ×—×–×•×¨ ×¢×œ ×–×”?",
            "×¡×œ×™×—×”, ×œ× ×§×œ×˜×ª×™. ×ž×” × ××ž×¨?",
            "×¨×’×¢, ×œ× ×©×ž×¢×ª×™ ×˜×•×‘. ××¤×©×¨ ×©×•×‘?",
          ]
        : isArabic
          ? [
              "Ù„Ù… Ø£Ø³Ù…Ø¹Ùƒ Ø¬ÙŠØ¯Ø§Ù‹ØŒ Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¥Ø¹Ø§Ø¯Ø©ØŸ",
              "Ø¹Ø°Ø±Ø§Ù‹ØŒ Ù„Ù… Ø£ÙÙ‡Ù… Ù…Ø§ Ù‚Ù„Øª. Ø£Ø¹Ø¯ Ù…Ù† ÙØ¶Ù„Ùƒ.",
              "Ù„Ù… Ø£Ø³Ù…Ø¹ Ø¨ÙˆØ¶ÙˆØ­ØŒ Ù‡Ù„ ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„ØªÙƒØ±Ø§Ø±ØŸ",
            ]
          : [
              "Sorry, I didn't catch that. Could you repeat?",
              "I didn't hear that. Could you say it again?",
              "Sorry, could you repeat that?",
            ];
      const repeatMessage = repeatMessages[emptyCount - 1] || repeatMessages[0];

      if (isHebrew) {
        response.say({voice: voiceId, language: sayLanguage}, repeatMessage);
        response.record({
          action: `${callbackUrl}&source=record`,
          method: "POST",
          maxLength: 15,
          timeout: 4,
          playBeep: false,
          trim: "do-not-trim",
          transcribe: false,
        });
      } else {
        const gather = response.gather({
          input: "speech",
          action: callbackUrl,
          method: "POST",
          timeout: 8,
          speechTimeout: "auto",
          language: gatherLanguage,
          enhanced: "true",
          profanityFilter: "false",
        });
        gather.say({voice: voiceId, language: sayLanguage}, repeatMessage);
      }

      // Safety fallback
      response.redirect({method: "POST"}, callbackUrl);

      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Reset empty count on successful speech
    if (data.emptyResultCount > 0) {
      sessionRef.set({emptyResultCount: 0}, {merge: true}).catch(() => {});
    }

    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: speechResult,
      timestamp: new Date(),
    });
    
    // Get LLM response with retry logic
    let aiResponse = "";
    let shouldContinue = true;
    let shouldHangup = false;

    // Resolve company data (was fetched in parallel earlier)
    const companySnapshot = await companyDataPromise;
    const companyData = companySnapshot?.exists ? companySnapshot.data() : {};

    // â”€â”€ Per-phone conversation memory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // On the FIRST turn of this call, load a brief summary of prior calls
    // from the same phone number and inject it as context.
    let callerMemoryContext = "";
    const isFirstTurn = conversationHistory.length <= 2; // greeting + this first user message
    if (isFirstTurn && data.leadNumber) {
      try {
        const prevSessions = await db.collection("call_sessions")
          .where("leadNumber", "==", data.leadNumber)
          .orderBy("createdAt", "desc")
          .limit(4) // last 4 calls
          .get();

        // Filter out the current session
        const pastSessions = prevSessions.docs
          .filter((d) => d.id !== callSessionId)
          .slice(0, 3);

        if (pastSessions.length > 0) {
          const summaries = pastSessions.map((d) => {
            const s = d.data();
            const date = s.createdAt?.toDate?.()?.toLocaleDateString?.() || "unknown date";
            const lastMsg = s.lastAIResponse || "";
            const turns = Math.floor((s.conversationHistory?.length || 0) / 2);
            return `- ${date}: ${turns} turn call. Last bot reply: "${lastMsg.substring(0, 80)}"`;
          });
          callerMemoryContext = `\n\nPREVIOUS CALLS WITH THIS NUMBER (${data.leadNumber}):\n${summaries.join("\n")}\nUse this context to personalise the conversation if relevant.`;
          logger.info("Loaded caller memory", { callSessionId, leadNumber: data.leadNumber, previousCalls: pastSessions.length });
        }
      } catch (memErr) {
        logger.warn("Could not load caller memory", { error: memErr.message });
      }
    }
    // â”€â”€ End per-phone memory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const MAX_RETRIES = 2; // Reduced from 3 for faster voice response
    let retryCount = 0;
    let llmSuccess = false;
    let lastError = null;

    while (retryCount < MAX_RETRIES && !llmSuccess) {
      try {
        // Build system prompt with company context and language.
        // Merge assistant-level custom instructions + caller memory into companyData.
        const customInstructions = [
          assistant.systemPrompt || assistant.instructions || companyData?.additionalInstructions || "",
          callerMemoryContext,
        ].filter(Boolean).join("\n");
        const mergedCompanyData = {
          ...companyData,
          additionalInstructions: customInstructions,
        };
        // No-announcement rule â€” same for both prompt paths.
        const isHebrew = language?.startsWith("he");
        const NO_CALL_ENDED_RULE = isHebrew
          ? "\n\n×—×©×•×‘: ×›×©×ž×¡×™×™×ž×™× â€” ×¤×©×•×˜ ××ž×•×¨ ×©×œ×•× ×•×¡×™×™×. ××™×Ÿ ×œ×•×ž×¨ '×× ×™ ×ž×¡×™×™× ××ª ×”×©×™×—×”', '×”×©×™×—×” ×ª×¡×ª×™×™×', ××• ×›×œ ×”×•×“×¢×” ×¢×œ ×¡×’×™×¨×ª ×”×©×™×—×”."
          : "\n\nImportant: when ending â€” just say goodbye naturally and stop. Never say 'I'm ending the call', 'the call is now over', or announce the hang-up in any way.";

        // Build system prompt â€” unified logic so vibe + gender + accent always apply.
        // When the assistant has a custom systemPrompt it becomes the PRIMARY goal section;
        // vibe, gender and accent are secondary style modifiers appended afterwards.
        const isArabic = language?.startsWith("ar");
        let systemPrompt;
        if (assistant.systemPrompt) {
          const vibe = assistant.assistantVibe || "friendly";
          const callerGender = assistant.callerGender || "neutral";
          const langKey = isHebrew ? "he" : isArabic ? "ar" : "en";
          const vibeSnippet = llmService.getVibeSnippet(langKey, vibe);
          const genderSnippet = isHebrew ? llmService.hebrewGenderInstruction(callerGender)
            : isArabic ? llmService.arabicGenderInstruction(callerGender) : "";
          const accentSnippet = llmService.getAccentInstruction(langKey, assistant.voiceAccent);

          const identity = `You are ${assistant.name || "an AI assistant"}${assistant.companyName ? ` from ${assistant.companyName}` : ""}.`;
          const styleSection = [vibeSnippet, genderSnippet, accentSnippet].filter(Boolean).join("\n");

          systemPrompt = [
            identity,
            "",
            "## Your goal",
            assistant.systemPrompt,
            "",
            ...(styleSection ? ["## Communication style", styleSection, ""] : []),
          ].join("\n") + NO_CALL_ENDED_RULE;
        } else {
          systemPrompt = llmService.buildSystemPrompt(assistant, mergedCompanyData, language);
        }

        // Inject knowledge base context (RAG) if assistant has uploaded documents
        const assistantId = data.assistantId || assistant.id || null;
        if (assistantId) {
          try {
            const knowledgeChunks = await getKnowledgeContext(db, assistantId, speechResult, 3);
            if (knowledgeChunks.length > 0) {
              systemPrompt += "\n\n## Reference Information\nUse the following knowledge to answer questions accurately:\n\n" +
                knowledgeChunks.map((c) => c.content).join("\n\n---\n\n");
            }
          } catch (kbErr) {
            logger.warn("Knowledge context retrieval failed (non-fatal)", kbErr.message);
          }
        }

        // Get conversation history for LLM
        const llmHistory = llmService.getConversationHistory({conversationHistory: conversationHistory});
        
        logger.info("Calling LLM", {
          callSessionId,
          attempt: retryCount + 1,
          maxRetries: MAX_RETRIES,
          userMessageLength: speechResult.length,
          historyLength: llmHistory.length,
        });
        
        // Call LLM with the actual speech result
        const llmResult = await llmService.getLLMResponse(
            systemPrompt,
            speechResult,
            llmHistory,
            {
              model: assistant.llmModel || "gpt-4o-mini",
              maxTokens: assistant.maxTokens || 100,
              temperature: assistant.temperature ?? 0.7,
            },
        );
        
        aiResponse = llmResult.text;
        llmSuccess = true;
        
        logger.info("LLM call successful", {
          callSessionId,
          attempt: retryCount + 1,
          responseLength: aiResponse.length,
          tokensUsed: llmResult.tokensUsed,
        });
        
        // Check if conversation should end - CONSERVATIVE detection
        // Only end when it's clearly a goodbye, not mid-conversation "×ª×•×“×”"
        const responseLower = aiResponse.toLowerCase();
        const userMessageLower = speechResult.toLowerCase().trim();

        // User explicitly wants to end (strict matching - short farewell messages only)
        const userExplicitEnd = [
          "×œ×”×ª×¨××•×ª", "×‘×™×™", "bye", "goodbye", "×¡×™×™×ž×ª×™", "×–×” ×”×›×œ",
        ];
        // "×ª×•×“×”" alone (not part of longer message) = might be ending
        const userThanksOnly = ["×ª×•×“×” ×¨×‘×”", "×ª×•×“×”", "thanks", "thank you"];

        // User wants to end ONLY if:
        // 1. They said an explicit farewell word, OR
        // 2. They ONLY said "×ª×•×“×”" (short message, < 15 chars) without asking anything else
        const isExplicitEnd = userExplicitEnd.some((kw) => userMessageLower.includes(kw));
        const isThanksOnly = userThanksOnly.some((kw) => userMessageLower.includes(kw)) &&
                             userMessageLower.length < 15 &&
                             !userMessageLower.includes("?") &&
                             !userMessageLower.includes("×¨×•×¦×”") &&
                             !userMessageLower.includes("×× ×™") &&
                             !userMessageLower.includes("×¢×•×“");
        const userWantsToEnd = isExplicitEnd || isThanksOnly;

        // AI is ending ONLY if it says farewell phrases (not just "×ª×•×“×”" mid-sentence)
        const aiEndPhrases = ["×œ×”×ª×¨××•×ª", "×™×•× × ×¢×™×", "×™×•× × ×¤×œ×", "× ×§×‘×¢ ×‘×”×¦×œ×—×”", "×ª×•×“×” ×©×‘×—×¨×ª"];
        const aiIsEnding = aiEndPhrases.some((kw) => responseLower.includes(kw));

        shouldHangup = userWantsToEnd || aiIsEnding;

        logger.info("End-of-call detection", {
          callSessionId,
          userWantsToEnd,
          aiIsEnding,
          shouldHangup,
          userMessageLength: userMessageLower.length,
          isExplicitEnd,
          isThanksOnly,
        });
        
        // AI response will be added to history after TTS confirmation (below)

        logger.info("LLM response generated", {
          callSessionId,
          responseLength: aiResponse.length,
          tokensUsed: llmResult.tokensUsed,
          shouldHangup,
        });
      } catch (llmError) {
        retryCount++;
        lastError = llmError;
        
        const errorType = llmError.errorType || (llmError.response?.status 
          ? `HTTP_${llmError.response.status}` 
          : llmError.code || "UNKNOWN");
        const isRetryable = llmError.isRetryable !== undefined 
          ? llmError.isRetryable
          : (!llmError.response || 
             (llmError.response.status >= 500) || 
             (llmError.response.status === 429) ||
             (llmError.code === "ECONNRESET" || llmError.code === "ETIMEDOUT"));
        
        logger.warn("LLM call failed", {
          callSessionId,
          attempt: retryCount,
          maxRetries: MAX_RETRIES,
          error: llmError.message,
          errorType,
          isRetryable,
          status: llmError.response?.status,
          willRetry: isRetryable && retryCount < MAX_RETRIES,
        });
        
        // If retryable and haven't exceeded max retries, wait and retry
        if (isRetryable && retryCount < MAX_RETRIES) {
          // Fast backoff: 100ms, 200ms (voice latency is critical)
          const delayMs = Math.min(100 * Math.pow(2, retryCount - 1), 500);
          logger.info("Retrying LLM call after delay", {
            callSessionId,
            delayMs,
            nextAttempt: retryCount + 1,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue; // Retry
        }
        
        // If not retryable or max retries exceeded, break and use fallback
        if (!isRetryable || retryCount >= MAX_RETRIES) {
          logger.error("LLM call failed after all retries, using fallback", {
            callSessionId,
            totalAttempts: retryCount,
            lastError: lastError.message,
            errorType,
          });
          break; // Exit retry loop and use fallback
        }
      }
    }
    
    // If LLM failed after all retries, use fallback
    if (!llmSuccess) {
      logger.warn("Using keyword matching fallback", {
        callSessionId,
        totalRetries: retryCount,
        lastError: lastError?.message,
      });
      
      // Fallback to keyword matching if LLM fails
      const speechLower = speechResult.toLowerCase().trim();
      const keywords = getKeywords(language);
      const isPositive = keywords.positive.some((kw) => speechLower.includes(kw));
      const isNegative = keywords.negative.some((kw) => speechLower.includes(kw));
      
      if (isPositive) {
        aiResponse = getMessage("positiveResponse", language);
      } else if (isNegative) {
        aiResponse = getMessage("negativeResponse", language);
      } else {
        // Don't use unclearResponse - try to continue conversation naturally
        aiResponse = language?.startsWith("he") 
          ? "×× ×™ ×ž×‘×™×Ÿ. ××™×š ××•×›×œ ×œ×¢×–×•×¨ ×œ×š ×¢×•×“?"
          : "I understand. How else can I help you?";
      }
      
      // Don't hangup on fallback - only if user explicitly says farewell
      const farewellWords = ["×œ×”×ª×¨××•×ª", "×‘×™×™", "bye", "goodbye", "×¡×™×™×ž×ª×™"];
      const userWantsToEnd = farewellWords.some((kw) => speechLower.includes(kw));
      shouldHangup = userWantsToEnd;
      
      logger.info("Fallback response generated", {
        callSessionId,
        aiResponse,
        shouldHangup,
        isPositive,
        isNegative,
      });
    }
    
    // Add AI response to history only after TTS is confirmed
    // Note: Cannot use FieldValue.serverTimestamp() inside array, use Date instead
    if (aiResponse) {
      conversationHistory.push({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
      });
    }

    // Update session with conversation history and status
    const updateData = {
      conversationHistory,
      lastSpeechResult: speechResult,
      lastAIResponse: aiResponse,
      responseAnalyzed: true,
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    // LATENCY OPTIMIZATION: Write Firestore and Lead updates as fire-and-forget
    // This saves ~80-150ms by not waiting for write confirmations before responding
    const writePromises = [];

    writePromises.push(
      sessionRef.set(updateData, {merge: true}).catch((err) => {
        logger.warn("Failed to update session", {callSessionId, error: err.message});
      }),
    );

    if (leadId && shouldHangup) {
      const conversationText = conversationHistory.map((m) => m.content).join(" ");
      const textLower = conversationText.toLowerCase();
      let leadStatus = "Contacted";
      if (textLower.includes("×›×Ÿ") || textLower.includes("×ž×ª××™×") || textLower.includes("yes")) {
        leadStatus = "Interested";
      } else if (textLower.includes("×œ×") || textLower.includes("no") || textLower.includes("×œ× ×ž×¢×•× ×™×™×Ÿ")) {
        leadStatus = "Not Interested";
      }
      writePromises.push(
        db.collection("Lead").doc(leadId).update({
          callStatus: leadStatus,
          lastContactDate: FieldValue.serverTimestamp(),
          callNotes: `Conversation: ${conversationText.substring(0, 500)}`,
        }).catch((err) => logger.warn(`Could not update Lead ${leadId}:`, err)),
      );
    }

    // Don't await writes - respond to Twilio immediately!
    // Writes happen in background
    Promise.all(writePromises).catch(() => {});

    const processingTime = Date.now() - startTime;
    logger.info("twilioGatherCallback processing complete", {
      callSessionId,
      processingTimeMs: processingTime,
      aiResponseLength: aiResponse.length,
      shouldHangup,
      conversationHistoryLength: conversationHistory.length,
    });
    
    // Say the AI response
    // FIX: use proper BCP-47 locale for Twilio <Say> / <Gather>
    // NOTE: <Say> (TTS) and <Gather> (STT) use DIFFERENT language code formats:
    //   <Say> uses Google TTS codes  : ar-XA, he-IL, el-GR, en-US
    //   <Gather> uses BCP-47 STT codes: ar-SA, he-IL, el-GR, en-US
    const sayLanguage = language.startsWith("he") ? "he-IL"
      : language.startsWith("ar") ? "ar-XA"
      : language.startsWith("el") ? "el-GR"
      : language.startsWith("af") ? "af-ZA"
      : language.startsWith("zu") ? "en-ZA"   // No native Zulu TTS voice; use SA English
      : (language || "en-US");
    // Arabic TTS code (ar-XA) is NOT valid for Twilio STT â€” must use BCP-47 ar-SA.
    const gatherLanguage = language.startsWith("ar") ? "ar-SA" : sayLanguage;
    
    // Continue conversation or hang up
    if (shouldHangup) {
      // Say the final AI response and hang up
      if (aiResponse) {
        console.log("Saying final AI response:", aiResponse.substring(0, 100) + "...");
        response.say({voice: voiceId, language: sayLanguage}, applySpeed(aiResponse, speechSpeed, language));
      }
      console.log("Hanging up call", {callSessionId, reason: "shouldHangup=true"});
      logger.info("Ending call", {callSessionId, reason: "shouldHangup=true"});
      response.hangup();
    } else {
      const isHebrew = language?.startsWith("he");
      const callbackUrl = `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${callSessionId}`;

      logger.info("Continuing conversation", {
        callSessionId,
        mode: isHebrew ? "record+deepgram" : "gather",
        language: gatherLanguage,
        aiResponseLength: aiResponse?.length || 0,
      });

      if (isHebrew) {
        // Hebrew: Say response then Record (Deepgram STT)
        if (aiResponse) {
          response.say({voice: voiceId, language: sayLanguage}, applySpeed(aiResponse, speechSpeed, language));
        }
        response.record({
          action: `${callbackUrl}&source=record`,
          method: "POST",
          maxLength: 15,
          timeout: 4,
          playBeep: false,
          trim: "do-not-trim",
          transcribe: false,
        });
      } else {
        // Non-Hebrew: Gather with optimised settings (barge-in via speechTimeout auto)
        const gather = response.gather({
          input: "speech",
          action: callbackUrl,
          method: "POST",
          timeout: 8,
          speechTimeout: "auto",
          language: gatherLanguage,
          enhanced: "true",
          profanityFilter: "false",
        });
        if (aiResponse) {
          gather.say({voice: voiceId, language: sayLanguage}, aiResponse);
        }
      }

      // Safety net: redirect back to keep conversation alive
      response.redirect({method: "POST"}, callbackUrl);
    }

    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
    
    const totalTime = Date.now() - startTime;
    console.log("twilioGatherCallback completed", {
      callSessionId,
      totalTimeMs: totalTime,
      shouldHangup,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      callSessionId: req.query?.callSessionId || req.body?.callSessionId,
      processingTimeMs: totalTime,
    };
    
    console.error("=== twilioGatherCallback ERROR ===");
    console.error(JSON.stringify(errorDetails, null, 2));
    
    logger.error("Twilio gather callback failed", errorDetails);
    
    const response = new twilio.twiml.VoiceResponse();
    // Default to bilingual message on error
    response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("willBeInTouch", "he-IL"));
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

async function _runPostCallTasks(callSessionId, callStatus) {
  // 1. Run AI analysis first
  try {
    const analysisService = require("./analysis_service");
    await analysisService._analyzeCallInternal(callSessionId);
  } catch (e) {
    logger.error("Auto-analysis failed", {
      err: e.message,
      stack: e.stack,
      callSessionId,
      hint: e.message.includes("401") || e.message.includes("API key")
        ? "OpenAI API key may be invalid â€” check OPENAI_API_KEY env var"
        : "",
    });
    // Save error to session so frontend can show it
    try {
      const db = getFirestore();
      await db.collection("call_sessions").doc(callSessionId).set({
        analysisError: e.message,
      }, {merge: true});
    } catch (_) {}
  }
  // 2. Send SMS only for completed calls (analysis summary is now written to Firestore)
  if (callStatus === "completed") {
    await _sendPostCallSms(callSessionId);
  }
  // 3. Place feedback call if enabled in assistant definition
  if (callStatus === "completed") {
    _placeFeedbackCall(callSessionId).catch((err) =>
      logger.warn("[feedback] feedback call failed (non-blocking)", {err: err.message, callSessionId}),
    );
  }

  // 4. Update leads collection (lowercase) if this call was part of a campaign
  try {
    const db = getFirestore();
    const snap = await db.collection("call_sessions").doc(callSessionId).get();
    if (snap.exists) {
      const session = snap.data();
      const leadId = session.metadata?.leadId;
      const campaignId = session.metadata?.campaignId;
      const analysis = session.analysis || {};
      const isSuccess = callStatus === "completed" && analysis.outcome === "success";
      const newLeadStatus = isSuccess ? "completed"
        : callStatus === "no-answer" || callStatus === "busy" ? "callback"
        : callStatus === "completed" ? "callback"
        : "failed";

      if (leadId) {
        await db.collection("leads").doc(leadId).set({
          lastCallId: callSessionId,
          lastCallDate: FieldValue.serverTimestamp(),
          lastCallSummary: analysis.summary || "",
          lastCallOutcome: analysis.outcome || callStatus,
          status: newLeadStatus,
          callCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        logger.info("Lead updated post-call", {leadId, newLeadStatus, callSessionId});
      }

      if (campaignId) {
        await db.collection("campaigns").doc(campaignId).set({
          calledCount: FieldValue.increment(1),
          ...(isSuccess ? {successCount: FieldValue.increment(1)} : {failedCount: FieldValue.increment(1)}),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }
    }
  } catch (e) {
    logger.warn("Lead/campaign update failed", {err: e.message, callSessionId});
  }

  // 5. Deduct credit for basic-plan users after call completes
  if (callStatus === "completed") {
    try {
      const db2 = getFirestore();
      const sessionSnap = await db2.collection("call_sessions").doc(callSessionId).get();
      const sess = sessionSnap.exists ? sessionSnap.data() : null;
      const ownerUid = sess?.ownerId || sess?.metadata?.userId || null;
      if (ownerUid) {
        const userSnap = await db2.collection("users").doc(ownerUid).get();
        if (userSnap.exists) {
          const u = userSnap.data();
          if (u.creditGranted && typeof u.creditBalance === "number" && u.creditBalance > 0) {
            // Deduct a flat rate per call (100 cents = $1.00) â€” configurable via billing config
            const billingSnap = await db2.collection("config").doc("billing").get();
            const billing = billingSnap.exists ? (billingSnap.data() || {}) : {};
            const costPerCallCents = typeof billing.costPerCallCents === "number"
              ? billing.costPerCallCents : 100; // default $1 per call
            const newBalance = Math.max(0, u.creditBalance - costPerCallCents);
            await db2.collection("users").doc(ownerUid).set(
              {creditBalance: newBalance, lastCreditDeduction: FieldValue.serverTimestamp()},
              {merge: true},
            );
            // Also mirror to `user` (singular) collection
            await db2.collection("user").doc(ownerUid).set(
              {creditBalance: newBalance, lastCreditDeduction: FieldValue.serverTimestamp()},
              {merge: true},
            );
            logger.info("Credit deducted post-call", {
              ownerUid, deducted: costPerCallCents, newBalance, callSessionId,
            });
          }
        }
      }
    } catch (creditErr) {
      logger.warn("Credit deduction failed (non-fatal)", {err: creditErr.message, callSessionId});
    }
  }

  // 6. Push notification to call owner
  try {
    const {sendPushToUser} = require("./push_service");
    const db3 = getFirestore();
    const sessionSnap3 = await db3.collection("call_sessions").doc(callSessionId).get();
    if (sessionSnap3.exists) {
      const sess3 = sessionSnap3.data();
      const ownerUid3 = sess3?.ownerId || sess3?.metadata?.userId || null;
      if (ownerUid3) {
        const callerNum = sess3.leadNumber || sess3.metadata?.callerNumber || "Unknown";
        const analysis = sess3.analysis || {};
        const durationSec = sess3.duration || 0;
        const durationStr = durationSec > 0
          ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
          : "";

        let title, body, url;
        if (callStatus === "completed") {
          title = "ðŸ“ž Call completed";
          const outcome = analysis.outcome ? ` Â· ${analysis.outcome}` : "";
          body = [callerNum, durationStr, analysis.summary?.slice(0, 80)].filter(Boolean).join(" Â· ") + outcome;
          url = `/calls/detail?id=${callSessionId}`;
        } else if (callStatus === "no-answer" || callStatus === "busy") {
          title = "ðŸ“µ Missed call";
          body = `${callerNum} â€” ${callStatus === "busy" ? "line busy" : "no answer"}`;
          url = `/calls/detail?id=${callSessionId}`;
        } else {
          title = "âš ï¸ Call ended";
          body = `${callerNum} Â· status: ${callStatus}`;
          url = `/calls/detail?id=${callSessionId}`;
        }

        await sendPushToUser(ownerUid3, {title, body, url, data: {callSessionId}});
      }
    }
  } catch (pushErr) {
    logger.warn("Push notification failed (non-fatal)", {err: pushErr.message, callSessionId});
  }
}

async function _sendPostCallSms(callSessionId) {
  const db = getFirestore();
  const snap = await db.collection("call_sessions").doc(callSessionId).get();
  if (!snap.exists) return;
  const session = snap.data();
  const leadNumber = session.leadNumber;
  if (!leadNumber) return;

  // Analysis is saved to call_sessions/{id}.analysis (by _analyzeCallInternal)
  // Re-fetch the session to get the analysis that was just written
  const freshSnap = await db.collection("call_sessions").doc(callSessionId).get();
  const analysis = freshSnap.exists ? (freshSnap.data()?.analysis || {}) : {};
  const summaryText = analysis.summary || "";
  const outcome = analysis.outcome || "";

  // Gate: only send SMS if assistant has sendSmsOnComplete=true OR a booking was detected
  const assistantDef = session.assistantDefinition || {};
  const BOOKING_OUTCOMES = ["appointment_booked", "meeting_scheduled", "booking", "success"];
  const isBooking = BOOKING_OUTCOMES.some((k) => outcome.toLowerCase().includes(k)) ||
    /\b(booked|appointment|meeting|scheduled|×¤×’×™×©×”|× ×§×‘×¢×”|×§×‘×™×¢×”)\b/i.test(summaryText);
  if (!assistantDef.sendSmsOnComplete && !isBooking) {
    logger.info("Post-call SMS skipped â€” no booking and sendSmsOnComplete not set", {callSessionId});
    return;
  }

  // Prefer assistantDefinition.companyName (the resolved assistant-specific name)
  // over session.companyName (which may still be the parent company on older sessions)
  const companyName = assistantDef.companyName || session.companyName || "us";
  const fromNumber = session.companyPhone || TWILIO_DEFAULT_FROM;

  // Resolve per-company Twilio credentials (3-tier fallback)
  let smsCreds;
  try {
    const companyId = session.companyId || null;
    const ownerId = session.ownerId || session.metadata?.userId || null;
    smsCreds = await getEffectiveTwilioCredentials(companyId, ownerId);
  } catch (credErr) {
    logger.warn("Post-call SMS skipped: cannot resolve Twilio creds", {callSessionId, err: credErr.message});
    return;
  }

  let smsBody = `Hi! You spoke with ${companyName} today.`;
  if (summaryText) smsBody += ` ${summaryText.slice(0, 110)}`;
  else if (session.lastAIResponse) smsBody += ` ${session.lastAIResponse.slice(0, 110)}`;
  if (outcome === "success") smsBody += " We look forward to seeing you!";
  if (smsBody.length > 160) smsBody = smsBody.slice(0, 157) + "...";

  const client = require("twilio")(smsCreds.sid, smsCreds.token);
  await client.messages.create({body: smsBody, from: fromNumber, to: leadNumber});
  logger.info("Post-call SMS sent", {callSessionId, to: leadNumber, ownKeys: smsCreds.isOwn});
}

// â”€â”€ Recording callback â€” saves recording URL to Firestore call session â”€â”€
exports.twilioRecordingCallback = onRequest(async (req, res) => {
  try {
    const body = req.body || {};
    const callSessionId = req.query.callSessionId || body.callSessionId;
    const recordingUrl = body.RecordingUrl || "";
    const recordingSid = body.RecordingSid || "";
    const recordingDuration = parseInt(body.RecordingDuration || "0", 10);
    const recordingStatus = body.RecordingStatus || "";

    if (!callSessionId || !recordingUrl) {
      res.status(200).send("OK");
      return;
    }

    console.log(`[RecordingCallback] session=${callSessionId} status=${recordingStatus} duration=${recordingDuration}s sid=${recordingSid}`);

    if (recordingStatus === "completed" && recordingDuration > 0) {
      const db = getFirestore();
      // Store proxy URL instead of direct Twilio URL (Twilio URLs require auth)
      const proxyUrl = `${BASE_FUNCTION_URL}/getRecording?sid=${recordingSid}`;
      await db.collection("call_sessions").doc(callSessionId).update({
        recordings: FieldValue.arrayUnion({
          sid: recordingSid,
          url: proxyUrl,
          duration: recordingDuration,
          createdAt: new Date().toISOString(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[RecordingCallback] Saved recording for ${callSessionId}: ${recordingDuration}s`);
    }
  } catch (err) {
    console.error("[RecordingCallback] Error:", err.message);
    logAnomaly({
      severity: "error",
      category: "recording",
      code: "RECORDING_CALLBACK_FAIL",
      message: `twilioRecordingCallback processing failed: ${err.message}`,
      details: {stack: err.stack ? err.stack.slice(0, 500) : null},
    });
  }
  res.status(200).send("OK");
});

// â”€â”€ Recording proxy â€” streams Twilio recording without exposing auth â”€â”€
exports.getRecording = onRequest(corsOptions, async (req, res) => {
  try {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    const sid = req.query.sid;
    if (!sid || !/^RE[a-fA-F0-9]{32}$/.test(sid)) { res.status(400).send("Invalid sid"); return; }
    // Recording SID is unguessable (32-char hex) â€” no extra auth needed for playback

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Recordings/${sid}.mp3`;
    const audioResponse = await axios.get(twilioUrl, {
      auth: {username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN},
      responseType: "arraybuffer",
      timeout: 15000,
    });
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(audioResponse.data));
  } catch (err) {
    console.error("[getRecording] Error:", err.message);
    logAnomaly({
      severity: "error",
      category: "recording",
      code: "RECORDING_DOWNLOAD_FAIL",
      message: `Failed to proxy Twilio recording: ${err.message}`,
      details: {
        status: err.response?.status || null,
        sid: req.query.sid || null,
      },
    });
    res.status(500).send("Failed to fetch recording");
  }
});

exports.twilioStatusCallback = onRequest(async (req, res) => {
  try {
    const body = req.body || {};
    let callSessionId =
      req.query.callSessionId ||
      body.callSessionId ||
      body.CallSessionId ||
      null;

    const db = getFirestore();

    // For inbound calls, callSessionId isn't in the URL â€” look up by Twilio CallSid
    if (!callSessionId && body.CallSid) {
      try {
        const byTwilioSid = await db.collection("call_sessions")
          .where("twilioSid", "==", body.CallSid)
          .limit(1)
          .get();
        if (!byTwilioSid.empty) {
          callSessionId = byTwilioSid.docs[0].id;
        }
      } catch (lookupErr) {
        logger.warn("Could not look up session by CallSid:", lookupErr.message);
      }
    }

    if (!callSessionId) {
      res.status(200).end();
      return;
    }

    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    
    // Update call_sessions
    const callStatus = (body.CallStatus || body.CallEvent || "completed").toLowerCase();
    const callDuration = parseInt(body.CallDuration || body.Duration || "0", 10);
    await sessionRef.set(
      {
        status: callStatus,
        duration: callDuration || null,
        twilioStatus: body,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    // Start recording when call becomes in-progress (call was answered)
    // This is the ONLY reliable place to start recording for streaming calls.
    // Skip for realtime assistants â€” Cloud Run records both sides directly.
    if (callStatus === "in-progress" && body.CallSid && twilioClient) {
      try {
        // Check if recording already exists OR this is a realtime call
        const sessionCheck = await sessionRef.get();
        const sd = sessionCheck.data() || {};
        const existingRecSid = sd.twilioRecordingSid;
        const isRealtime = sd.assistantDefinition?.realtimeEnabled === true;
        if (!existingRecSid && !isRealtime) {
          const recording = await twilioClient.calls(body.CallSid).recordings.create({
            recordingStatusCallback: `${BASE_FUNCTION_URL}/twilioRecordingCallback?callSessionId=${callSessionId}`,
            recordingStatusCallbackMethod: "POST",
            recordingChannels: "dual",
          });
          await sessionRef.set({twilioRecordingSid: recording.sid}, {merge: true});
          logger.info("Started recording on in-progress", {callSid: body.CallSid, recordingSid: recording.sid, callSessionId});
        }
      } catch (recErr) {
        logger.error("Failed to start recording on in-progress", {
          error: recErr.message,
          code: recErr.code,
          moreInfo: recErr.moreInfo,
          callSid: body.CallSid,
          callSessionId,
        });
        logAnomaly({
          severity: "error",
          category: "recording",
          code: "TWILIO_RECORDING_FAIL_ONINPROGRESS",
          message: `Failed to start recording on in-progress: ${recErr.message}`,
          callSessionId,
          callSid: body.CallSid,
          details: {
            twilioCode: recErr.code || null,
            moreInfo: recErr.moreInfo || null,
          },
        });
      }
    }

    // When call is completed, also save to Call collection for dashboard
    if (callStatus === "completed" || callStatus === "busy" || callStatus === "no-answer" || callStatus === "failed" || callStatus === "canceled") {
      try {
        const sessionSnapshot = await sessionRef.get();
        const sessionData = sessionSnapshot.exists ? sessionSnapshot.data() : {};
        
        // Extract phone numbers as integers (remove non-digits)
        const extractNumber = (str) => {
          if (!str) return 0;
          const digits = String(str).replace(/\D/g, "");
          return digits ? parseInt(digits.slice(-10), 10) : 0;
        };
        
        // Calculate duration from Twilio data
        const duration = body.CallDuration || body.Duration || "0";
        
        // Determine success based on status
        const isSuccess = callStatus === "completed" && parseInt(duration, 10) > 0;
        
        // Create Call record
        const callRecord = {
          id: sessionData.twilioSid || body.CallSid || callSessionId,
          duration: String(duration),
          dateTime: sessionData.createdAt || FieldValue.serverTimestamp(),
          fromName: sessionData.leadName || "",
          fromNumber: extractNumber(sessionData.companyPhone || body.From),
          toName: sessionData.leadName || "",
          toNumber: extractNumber(sessionData.leadNumber || body.To),
          success: isSuccess,
          callType: "outbound",
          endCallReason: body.SipResponseCode || callStatus,
          company: sessionData.companyId || "",
          recording: body.RecordingUrl || "",
          summary: "",
          requestType: "ai_call",
        };
        
        await db.collection("Call").doc(callRecord.id).set(callRecord);
        logger.info(`Call record saved: ${callRecord.id}`);
        
        // Update Lead record if we have a leadId
        const leadId = sessionData.metadata?.leadId;
        if (leadId) {
          try {
            const leadStatus = sessionData.leadStatus || 
                               (isSuccess ? "Contacted" : "No Answer");
            const callbackRequested = sessionData.callbackRequested || false;
            
            await db.collection("Lead").doc(leadId).update({
              callStatus: leadStatus,
              lastContactDate: FieldValue.serverTimestamp(),
              callNotes: sessionData.speechResult || `Call ${callStatus}`,
              callbackRequested,
            });
            logger.info(`Lead ${leadId} updated with status: ${leadStatus}`);
          } catch (leadError) {
            logger.warn(`Could not update Lead ${leadId}:`, leadError);
          }
        }
      } catch (callError) {
        logger.error("Failed to save Call record", callError);
      }

      // Auto-analyze then SMS (sequential â€” SMS needs analysis summary)
      _runPostCallTasks(String(callSessionId), callStatus).catch((err) =>
        logger.warn("Post-call tasks failed (non-blocking)", {err: err.message, callSessionId}),
      );
    }

    res.status(200).end();
  } catch (error) {
    logger.error("Failed to process Twilio status callback", error);
    res.status(200).end();
  }
});

/**
 * Execute a scenario flow from a specific node
 * This is the main entry point for scenario-based calls
 */
exports.scenarioFlowExecute = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const nodeId = req.query.nodeId || req.body?.nodeId;
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId) {
      // No session ID â€” can't know caller's language. Use a neutral multilingual goodbye.
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "×”×©×™×—×” ×œ× × ×ž×¦××”. ×œ×”×ª×¨××•×ª.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      // Session gone from DB â€” can't know language. Neutral fallback.
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "×”×©×™×—×” ×œ× × ×ž×¦××”. ×œ×”×ª×¨××•×ª.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const sessionData = sessionSnapshot.data();
    // From here we have sessionData â€” use the session's actual language/voice for error messages.
    const sessionLanguage = sessionData.assistantDefinition?.language || "he-IL";
    const sessionVoice = sessionData.assistantDefinition?.voice || DEFAULT_HEBREW_VOICE;
    const sessionSayLang = sessionLanguage.startsWith("ar") ? "ar-XA"
      : sessionLanguage.startsWith("el") ? "el-GR"
      : sessionLanguage.startsWith("he") ? "he-IL"
      : sessionLanguage;
    const scenarioId = sessionData.scenarioId;

    if (!scenarioId) {
      // Fall back to non-scenario flow â€” use session language for the message
      response.say({voice: sessionVoice, language: sessionSayLang}, "An error occurred. Goodbye.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Get the scenario
    const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
    if (!scenarioDoc.exists) {
      response.say({voice: sessionVoice, language: sessionSayLang}, "An error occurred. Goodbye.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const scenario = {id: scenarioDoc.id, ...scenarioDoc.data()};

    // Determine which node to execute
    let targetNodeId = nodeId || sessionData.currentNodeId;

    // If no node specified, start from the beginning
    if (!targetNodeId) {
      const startNode = scenarioEngine.getStartNode(scenario);
      if (startNode) {
        // Move to the node after start
        const nextNodes = scenarioEngine.findNextNodes(scenario, startNode.id);
        targetNodeId = nextNodes[0]?.node?.id || startNode.id;
      }
    }

    if (!targetNodeId) {
      response.say({voice: sessionVoice, language: sessionSayLang}, "An error occurred. Goodbye.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Build context from session data
    const context = {
      ...sessionData.scenarioContext,
      leadName: sessionData.leadName,
      leadPhone: sessionData.leadNumber,
      leadId: sessionData.metadata?.leadId,
      companyId: sessionData.companyId,
      companyName: sessionData.companyName,
      companyPhone: sessionData.companyPhone,
      assistantName: sessionData.assistantName,
      scenarioId,
      variables: sessionData.scenarioContext?.variables || {},
    };

    // Process the node
    const result = await scenarioEngine.processNode(
      targetNodeId,
      scenario,
      context,
      callSessionId
    );

    // Update session with new state
    await sessionRef.set({
      currentNodeId: result.lastNodeId,
      scenarioContext: {
        ...sessionData.scenarioContext,
        variables: result.context?.variables || {},
      },
      status: result.finalStatus || sessionData.status,
      updatedAt: FieldValue.serverTimestamp(),
      ...(result.executionLog && result.executionLog.length > 0
        ? { executionLog: FieldValue.arrayUnion(...result.executionLog) }
        : {}),
    }, {merge: true});

    res.set("Content-Type", "text/xml");
    res.status(200).send(result.twiml);
  } catch (error) {
    logger.error("Scenario flow execution failed", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "××™×¨×¢×” ×©×’×™××”. ×× × × ×¡×” ×©×•×‘ ×ž××•×—×¨ ×™×•×ª×¨.");
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

/**
 * Handle callbacks from Gather nodes in scenarios
 * Processes speech/DTMF input and continues the flow
 */
exports.scenarioFlowCallback = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const nodeId = req.query.nodeId || req.body?.nodeId;
    const speechResult = req.body?.SpeechResult || "";
    const digits = req.body?.Digits || "";
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId || !nodeId) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "×©×’×™××” ×‘×©×™×—×”. ×œ×”×ª×¨××•×ª.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "×”×©×™×—×” ×œ× × ×ž×¦××”. ×œ×”×ª×¨××•×ª.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const sessionData = sessionSnapshot.data();
    const scenarioId = sessionData.scenarioId;

    // Get the scenario
    const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
    if (!scenarioDoc.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "×”×ª×¨×—×™×© ×œ× × ×ž×¦×. ×œ×”×ª×¨××•×ª.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const scenario = {id: scenarioDoc.id, ...scenarioDoc.data()};
    const gatherNode = scenario.nodes.find((n) => n.id === nodeId);

    if (!gatherNode) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "×©×’×™××” ×‘×ª×¨×—×™×©. ×œ×”×ª×¨××•×ª.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Analyze the input
    const inputResult = speechResult || digits;
    const condition = scenarioEngine.analyzeSpeechForConditions(inputResult, gatherNode);

    // Log user's response
    const userInputLog = {
      nodeId: nodeId || "unknown",
      nodeType: "user_input",
      nodeLabel: "User Response",
      timestamp: new Date().toISOString(),
      output: { action: "user_input", text: inputResult, matchedCondition: condition || null },
    };

    // Update session with speech result
    await sessionRef.set({
      speechResult: inputResult,
      lastGatherResult: {
        nodeId,
        input: inputResult,
        condition,
        timestamp: FieldValue.serverTimestamp(),
      },
      scenarioContext: {
        ...sessionData.scenarioContext,
        speechResult: inputResult,
        lastInput: inputResult,
        variables: {
          ...(sessionData.scenarioContext?.variables || {}),
          lastSpeechResult: inputResult,
          lastDigits: digits,
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
      executionLog: FieldValue.arrayUnion(userInputLog),
    }, {merge: true});

    // Find the next node based on the condition
    let nextNodes = scenarioEngine.findNextNodes(scenario, nodeId, condition);
    
    // If no matching condition, try default
    if (nextNodes.length === 0) {
      const defaultNode = scenarioEngine.findDefaultNextNode(scenario, nodeId);
      if (defaultNode) {
        nextNodes = [{node: defaultNode}];
      }
    }

    const nextNodeId = nextNodes[0]?.node?.id;

    if (nextNodeId) {
      // Redirect to execute the next node
      response.redirect(
        `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${callSessionId}&nodeId=${nextNodeId}`
      );
    } else {
      // No next node - end the call
      const voice = resolveVoiceForLanguage(sessionData.scenarioContext?.defaultVoice, "he-IL");
      response.say({voice, language: "he-IL"}, "×ª×•×“×” ×¢×œ ×”×–×ž×Ÿ. ×œ×”×ª×¨××•×ª.");
      response.hangup();
    }

    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  } catch (error) {
    logger.error("Scenario flow callback failed", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "××™×¨×¢×” ×©×’×™××”. ×œ×”×ª×¨××•×ª.");
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

/**
 * Handle recording callbacks from scenario Record nodes
 */
exports.scenarioRecordingCallback = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const recordingUrl = req.body?.RecordingUrl || "";
    const recordingSid = req.body?.RecordingSid || "";
    const transcriptionText = req.body?.TranscriptionText || "";

    if (callSessionId) {
      const db = getFirestore();
      const sessionRef = db.collection("call_sessions").doc(String(callSessionId));

      await sessionRef.set({
        recordings: FieldValue.arrayUnion({
          sid: recordingSid,
          url: recordingUrl,
          transcription: transcriptionText,
          timestamp: new Date().toISOString(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      logger.info(`Recording saved for session ${callSessionId}: ${recordingSid}`);
    }

    res.status(200).end();
  } catch (error) {
    logger.error("Recording callback failed", error);
    res.status(200).end();
  }
});

// â”€â”€ Post-call Feedback Call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Places an outbound call after a completed conversation to collect quality
// feedback. Enabled per-assistant via assistantDefinition.feedbackCallEnabled.
// Stores results in call_sessions/{id}.feedback + call_feedback collection.

async function _placeFeedbackCall(originalCallSessionId) {
  try {
    const db = getFirestore();
    const snap = await db.collection("call_sessions").doc(originalCallSessionId).get();
    if (!snap.exists) return;
    const session = snap.data();

    // Only if assistant has feedback calls enabled
    if (!session.assistantDefinition?.feedbackCallEnabled) return;

    const toNumber = session.leadNumber;
    if (!toNumber) return;

    // Don't send a second feedback call
    if (session.feedbackCallSent) return;

    // Skip if call was immediately rejected (< 3 seconds)
    const duration = parseInt(session.twilioStatus?.CallDuration || "0", 10);
    if (duration > 0 && duration < 3) {
      logger.info("[feedback] Skipping feedback â€” call immediately rejected", {originalCallSessionId, duration});
      return;
    }

    // Resolve Twilio credentials using 3-tier fallback (company â†’ system env)
    const companyId = session.companyId || null;
    const ownerId = session.ownerId || session.metadata?.userId || null;
    let feedbackCreds;
    try {
      feedbackCreds = await getEffectiveTwilioCredentials(companyId, ownerId);
    } catch (credErr) {
      logger.warn("[feedback] Cannot resolve Twilio creds", {originalCallSessionId, err: credErr.message});
      return;
    }
    const fromNumber = session.companyPhone || feedbackCreds.from;
    if (!fromNumber) {
      logger.warn("[feedback] Missing from number", {originalCallSessionId});
      return;
    }

    const client = twilio(feedbackCreds.sid, feedbackCreds.token);

    // Mark original session so we don't double-send
    await db.collection("call_sessions").doc(originalCallSessionId).set(
      {feedbackCallSent: true, updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );

    const feedbackUrl = `${BASE_FUNCTION_URL}/twilioFeedbackWebhook?origSid=${encodeURIComponent(originalCallSessionId)}`;
    const call = await client.calls.create({
      to: toNumber,
      from: fromNumber,
      url: feedbackUrl,
      method: "POST",
    });

    logger.info(`[feedback] Feedback call placed â†’ ${toNumber}`, {originalCallSessionId, callSid: call.sid});
  } catch (err) {
    logger.warn("[feedback] _placeFeedbackCall error", {originalCallSessionId, err: err.message});
  }
}

exports.twilioFeedbackWebhook = onRequest(async (req, res) => {
  const origSid = req.query.origSid || req.body?.origSid || "";
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  let language = "he-IL";
  let voiceId = "Google.he-IL-Wavenet-A";
  let companyName = "";

  if (origSid) {
    try {
      const db = getFirestore();
      const snap = await db.collection("call_sessions").doc(origSid).get();
      if (snap.exists) {
        const s = snap.data();
        language = s.assistantDefinition?.language || "he-IL";
        voiceId = s.assistantDefinition?.voice || "Google.he-IL-Wavenet-A";
        companyName = s.assistantDefinition?.companyName || s.companyName || "";
      }
    } catch (_) { /* use defaults */ }
  }

  const isHebrew = language.startsWith("he");
  const gatherUrl = `${BASE_FUNCTION_URL}/twilioFeedbackGather?origSid=${encodeURIComponent(origSid)}&step=rating`;

  if (isHebrew) {
    const gather = response.gather({
      input: "dtmf",
      numDigits: "1",
      action: gatherUrl,
      method: "POST",
      timeout: "8",
    });
    gather.say({voice: voiceId, language},
      `×©×œ×•×! ×–×” ×œ× ×™${companyName ? " ×ž-" + companyName : ""}. ×ž×ª×§×©×¨×™× ×›×“×™ ×œ×§×‘×œ ×ž×ž×š ×ž×©×•×‘ ×§×¦×¨ ×¢×œ ×”×©×™×—×” ×©×¡×™×™×ž× ×•. ` +
      "××™×š ×ª×“×¨×’ ××ª ×”×©×™×—×”? ×œ×—×¥ 1 ×œ×’×¨×•×¢, 2 ×œ×‘×™× ×•× ×™, 3 ×œ×¡×‘×™×¨, 4 ×œ×˜×•×‘, 5 ×œ×ž×¦×•×™×Ÿ.",
    );
    response.say({voice: voiceId, language}, "×œ× ×§×™×‘×œ× ×• ×ª×©×•×‘×”. ×ª×•×“×” ×¢×œ ×–×ž× ×š. ×©×™×”×™×” ×™×•× ×˜×•×‘!");
  } else {
    const gather = response.gather({
      input: "dtmf",
      numDigits: "1",
      action: gatherUrl,
      method: "POST",
      timeout: "8",
    });
    gather.say({voice: voiceId, language},
      `Hi! This is a quick follow-up call${companyName ? " from " + companyName : ""}. ` +
      "How would you rate the call we just had? Press 1 for poor, 2 for fair, 3 for okay, 4 for good, 5 for excellent.",
    );
    response.say({voice: voiceId, language}, "We didn't get a response. Thank you for your time. Goodbye!");
  }
  response.hangup();
  res.type("text/xml").send(response.toString());
});

exports.twilioFeedbackGather = onRequest(async (req, res) => {
  const origSid = req.query.origSid || req.body?.origSid || "";
  const step = req.query.step || req.body?.step || "rating";
  const digits = String(req.body?.Digits || "").trim();
  const speechResult = String(req.body?.SpeechResult || req.body?.TranscriptionText || "").trim();

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  let language = "he-IL";
  let voiceId = "Google.he-IL-Wavenet-A";

  if (origSid) {
    try {
      const db = getFirestore();
      const snap = await db.collection("call_sessions").doc(origSid).get();
      if (snap.exists) {
        const s = snap.data();
        language = s.assistantDefinition?.language || "he-IL";
        voiceId = s.assistantDefinition?.voice || "Google.he-IL-Wavenet-A";
      }
    } catch (_) { /* use defaults */ }
  }

  const isHebrew = language.startsWith("he");

  if (step === "rating") {
    const rating = parseInt(digits, 10) || 0;

    if (origSid && rating > 0) {
      const db = getFirestore();
      await db.collection("call_sessions").doc(origSid).set(
        {feedback: {rating, ratedAt: FieldValue.serverTimestamp()}, updatedAt: FieldValue.serverTimestamp()},
        {merge: true},
      );
      logger.info(`[feedback] Rating ${rating} saved`, {origSid});
    }

    const improveUrl = `${BASE_FUNCTION_URL}/twilioFeedbackGather?origSid=${encodeURIComponent(origSid)}&step=improvement`;

    if (isHebrew) {
      const gather = response.gather({
        input: "speech",
        action: improveUrl,
        method: "POST",
        language: "he-IL",
        timeout: "5",
        speechTimeout: "auto",
      });
      gather.say({voice: voiceId, language},
        `×ª×•×“×” ×¢×œ ×”×“×™×¨×•×’ ${rating > 0 ? rating : ""}. ×™×© ×ž×©×”×• ×©×”×™×” ××¤×©×¨ ×œ×©×¤×¨ ×‘×©×™×—×”? ××ž×•×¨ ××ª ×–×” ×¢×›×©×™×•.`,
      );
      response.say({voice: voiceId, language}, "×ª×•×“×” ×¨×‘×” ×¢×œ ×”×ž×©×•×‘! ×©×™×”×™×” ×™×•× ×˜×•×‘!");
    } else {
      const gather = response.gather({
        input: "speech",
        action: improveUrl,
        method: "POST",
        language: "en-US",
        timeout: "5",
        speechTimeout: "auto",
      });
      gather.say({voice: voiceId, language},
        `Thank you for the rating. What could we improve in the call? Please say it now.`,
      );
      response.say({voice: voiceId, language}, "Thank you for the feedback! Have a great day!");
    }
    response.hangup();

  } else if (step === "improvement") {
    if (origSid) {
      const db = getFirestore();
      await db.collection("call_sessions").doc(origSid).set(
        {
          feedback: {improvement: speechResult, improvedAt: FieldValue.serverTimestamp()},
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      // Also write to top-level call_feedback collection for easy querying
      await db.collection("call_feedback").add({
        originalCallSessionId: origSid,
        improvement: speechResult,
        createdAt: FieldValue.serverTimestamp(),
      });
      logger.info(`[feedback] Improvement saved: "${speechResult}"`, {origSid});
    }

    if (isHebrew) {
      response.say({voice: voiceId, language}, "×ª×•×“×” ×¨×‘×”! × ×©×ª×ž×© ×‘×ž×©×•×‘ ×©×œ×š ×›×“×™ ×œ×”×©×ª×¤×¨. ×©×™×”×™×” ×œ×š ×™×•× × ×”×“×¨!");
    } else {
      response.say({voice: voiceId, language}, "Thank you so much! We'll use your feedback to improve. Have a wonderful day!");
    }
    response.hangup();
  } else {
    response.hangup();
  }

  res.type("text/xml").send(response.toString());
});

/**
 * Scheduled function: Clean up stale call sessions every 15 minutes.
 * Sessions stuck in non-terminal states for >2 hours are marked "abandoned".
 */
exports.cleanupStaleSessions = onSchedule("every 15 minutes", async () => {
  const db = getFirestore();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleStatuses = ["in-progress", "initiated", "dialing", "ringing", "answered", "queued"];

  let totalCleaned = 0;

  for (const status of staleStatuses) {
    try {
      const staleSnap = await db.collection("call_sessions")
        .where("status", "==", status)
        .where("createdAt", "<", twoHoursAgo)
        .limit(200)
        .get();

      if (staleSnap.empty) continue;

      const batch = db.batch();
      staleSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          status: "abandoned",
          updatedAt: FieldValue.serverTimestamp(),
          abandonReason: "stale_session_cleanup",
        });
      });

      await batch.commit();
      totalCleaned += staleSnap.size;
      logger.info(`Cleaned ${staleSnap.size} stale "${status}" sessions`);
    } catch (err) {
      logger.error(`Failed to clean stale "${status}" sessions:`, err.message);
    }
  }

  if (totalCleaned > 0) {
    logger.info(`Total stale sessions cleaned: ${totalCleaned}`);
  }
});

