import { callFn, auth } from "./firebase";

// ── Plain HTTP helpers (for onRequest functions, not onCall) ─────────────
const FUNCTIONS_BASE = `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch { /* unauthenticated — proceed without header */ }
  return headers;
}

async function httpGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  return res.json() as Promise<T>;
}

async function httpPost<T>(path: string, body: unknown, opts?: { timeoutMs?: number }): Promise<T> {
  const headers = await getAuthHeaders();
  // Optional client-side timeout (e.g. voice replay can run for minutes).
  let signal: AbortSignal | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (opts?.timeoutMs) {
    const ctrl = new AbortController();
    signal = ctrl.signal;
    timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  }
  try {
    const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error((err as { message?: string }).message || res.statusText);
    }
    return res.json() as Promise<T>;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Assistants ────────────────────────────────────────────────────────
export const assistantsList = () =>
  httpGet<Assistant[]>("/assistantsList");

export const assistantsCreate = (data: Partial<Assistant>) =>
  httpPost<Assistant>("/assistantsCreate", data);

export const assistantsGet = (id: string) =>
  httpGet<Assistant>(`/assistantsGet?id=${encodeURIComponent(id)}`);

export const assistantsUpdate = (
  // customTools/conversationFlow aren't on the base Assistant type but are
  // valid whitelisted update fields (see voice_service.assistantsUpdate).
  data: Partial<Assistant> & { id: string; customTools?: unknown[]; conversationFlow?: string },
) => httpPost<Assistant>("/assistantsUpdate", data);

export interface TestChatToolCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  status: number;
  ms: number;
  result: string;
  url?: string;
}
export const assistantTestChat = (data: {
  assistantId: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  override?: {
    systemPrompt?: string; assistantVibe?: string; callerGender?: string; language?: string; voiceAccent?: string;
    conversationFlow?: string;
    // Pass the editor's (possibly unsaved) custom tools so the sandbox can fire them.
    customTools?: unknown[];
  };
}) => httpPost<{ reply: string; toolCalls?: TestChatToolCall[] }>("/assistantTestChat", data);

export interface VoiceReplayResult {
  ok: boolean;
  provider: string;
  audioBase64: string;
  audioMime: string;
  durationMs: number;
  botSpoke: boolean;
  turns: { role: "caller" | "bot"; startMs: number; durMs: number }[];
  callerTurns: string[];
  botTranscript: string[];
  truncated: boolean;
  totalCallerTurns: number;
}
// "Run as a live voice call" — re-runs a past call through the REAL voice
// pipeline against the assistant's current config and returns a WAV recording.
// Long-running (a real session); allow up to 5 minutes.
export const assistantVoiceReplay = (data: {
  callSessionId: string;
  assistantId: string;
  maxTurns?: number;
}) => httpPost<VoiceReplayResult>("/assistantVoiceReplay", data, { timeoutMs: 300000 });

export const assistantsDelete = (data: { id: string }) =>
  httpPost<{ status: string }>("/assistantsDelete", data);

// ── Follow-ups & Escalations ──────────────────────────────────────────
export interface FollowupItem {
  id: string; leadId: string; phone: string; assistantId: string;
  campaignId?: string | null; reason?: string;
  attemptCount: number; maxAttempts: number;
  status: "pending" | "calling" | "done" | "exhausted";
  nextAttemptAt?: { _seconds?: number } | string | number; timezone?: string;
}
export interface EscalationItem {
  id: string; leadId: string; phone?: string | null; assistantId?: string | null;
  campaignId?: string | null; reason: string; attempts: number;
  status: "open" | "resolved" | "escalated"; notes?: string | null;
  createdAt?: { _seconds?: number } | string | number;
}
export const followupsList   = () => httpGet<FollowupItem[]>("/followupsList");
export const escalationsList = () => httpGet<EscalationItem[]>("/escalationsList");
export const escalationResolve = (data: { leadId: string; notes?: string }) =>
  httpPost<{ status: string; id: string }>("/escalationResolve", data);

export const assistantsDuplicate = (data: { id: string; name?: string }) =>
  httpPost<{ id: string; name: string }>("/assistantsDuplicate", data);

// ── Phone Numbers ─────────────────────────────────────────────────────
// Twilio returns a bare PhoneNumber[]; Voximplant returns { numbers, note }.
// Normalize both to { numbers, note } so the buy page has one shape to render.
export const searchPhoneNumbers = async (
  data: { country: string; areaCode?: string; provider?: "twilio" | "voximplant"; companyId?: string; category?: string; regionId?: string },
): Promise<{ numbers: PhoneNumber[]; note?: string | null }> => {
  const res = await httpPost<PhoneNumber[] | { numbers: PhoneNumber[]; note?: string | null }>("/searchPhoneNumbers", data);
  if (Array.isArray(res)) return { numbers: res };
  return { numbers: Array.isArray(res?.numbers) ? res.numbers : [], note: res?.note ?? null };
};

export const purchasePhoneNumber = (
  data: { phoneNumber: string; provider?: "twilio" | "voximplant"; companyId?: string; assistantId?: string; phoneId?: string; regionId?: string; category?: string; friendlyName?: string },
) =>
  httpPost<{ sid?: string; phoneNumber: string; provider?: string; bound?: boolean; note?: string | null }>("/purchasePhoneNumber", data);

export const releasePhoneNumber = (data: { phoneNumber: string; sid?: string }) =>
  httpPost<{ status: string }>("/releasePhoneNumber", data);

export const listPhoneNumbers = () =>
  httpGet<Array<{ sid: string; phoneNumber: string; friendlyName: string; country: string }>>("/listPhoneNumbers");

export const configurePhoneNumber = (data: { phoneNumber: string; assistantId?: string }) =>
  httpPost<{ status: string }>("/configurePhoneNumber", data);

// Provider-agnostic assignment — upserts Company.phoneNumberMap server-side
// (Admin SDK), so inbound routing actually reflects the assignment.
export const assignPhoneNumber = (data: { phoneNumber: string; assistantId?: string }) =>
  httpPost<{ status: string; companiesUpdated: number; assistantName: string }>("/assignPhoneNumber", data);

// Voximplant Management API credentials (stored on the company doc).
export interface VoximplantConfig {
  companyId: string;
  configured: boolean;
  voxAccountId: string;
  voxRuleId: string;
  voxAppName: string;
  voxApplicationId: string;
  voxCallerId: string;
  apiKeySet: boolean;
  apiKeyHint: string;
}
export const voximplantConfigGet = () =>
  httpGet<VoximplantConfig>("/voximplantConfigGet");
export const voximplantConfigSet = (data: {
  voxAccountId?: string; voxApiKey?: string; voxRuleId?: string;
  voxAppName?: string; voxApplicationId?: string; voxCallerId?: string;
}) => httpPost<{ status: string; updated: string[] }>("/voximplantConfigSet", data);

// ── SIP Trunks ────────────────────────────────────────────────────────
export const sipTrunkCreate = (data: SipTrunkInput) =>
  httpPost<{ status: string; trunk: SipTrunk }>("/sipTrunkCreate", data);

export const sipTrunkUpdate = (data: SipTrunkInput & { id: string }) =>
  httpPost<{ status: string; trunk: SipTrunk }>("/sipTrunkUpdate", data);

export const sipTrunkDelete = (data: { id: string }) =>
  httpPost<{ status: string; deleted: string }>("/sipTrunkDelete", data);

export const sipTrunkList = () =>
  httpGet<{ status: string; trunks: SipTrunk[] }>("/sipTrunkList");

export const sipTrunkTest = (data: { id: string }) =>
  httpPost<{ status: string; ok: boolean; message: string; steps: SipTestStep[] }>("/sipTrunkTest", data);

export const sipTrunkHealthCheck = () =>
  httpPost<SipHealthCheckResult>("/sipTrunkHealthCheck", {});

export const sipBridgeConfigGet = () =>
  httpGet<{ status: string; config: SipBridgeConfig }>("/sipBridgeConfigGet");

export const sipBridgeConfigSave = (data: SipBridgeConfigInput) =>
  httpPost<{ status: string }>("/sipBridgeConfigSave", data);

export const sipTracesList = (limit?: number) =>
  httpGet<{ status: string; traces: SipTrace[] }>(
    `/sipTracesList${limit ? `?limit=${limit}` : ""}`
  );

/** Returns a URL you can open directly in an <a> tag to download the PCAP file. */
export const sipTraceDownloadUrl = (traceId: string): string =>
  `${FUNCTIONS_BASE}/sipTraceDownload?traceId=${encodeURIComponent(traceId)}`;

// ── Calls ─────────────────────────────────────────────────────────────
export const placeCall = (data: PlaceCallPayload) =>
  httpPost<{ callSid: string; callSessionId: string }>("/placeCall", data);

// ── TTS ───────────────────────────────────────────────────────────────
export const listTtsVoices = (data: { provider?: string; language?: string }) =>
  httpPost<{ voices: TtsVoice[]; provider: string }>("/listTtsVoices", data);

export const synthesizeTts = (data: { text: string; provider: string; voiceId?: string; language?: string }) =>
  httpPost<{ audioContent: string; provider: string }>("/synthesizeTts", data);

// ── Admin ──────────────────────────────────────────────────────────────
export const adminListUsers = () =>
  httpGet<AdminUser[]>("/adminListUsers");

export const adminToggleUser = (data: { uid: string; status: "active" | "suspended" }) =>
  httpPost<{ status: string }>("/adminToggleUser", data);

export const adminDeleteUser = (data: { uid: string }) =>
  httpPost<{ status: string }>("/adminDeleteUser", data);

export const adminSetRole = (data: { uid: string; role: "user" | "admin" | "super_admin" }) =>
  httpPost<{ status: string }>("/adminSetRole", data);

// Features — super_admin endpoints
export interface FeatureRegistryEntry {
  id: string;
  label: string;
  defaultOn: boolean;
  kind: "nav" | "cap";
}
export const adminGetFeatureConfig = () =>
  httpGet<{
    status: string;
    defaults: { user: Record<string, boolean>; admin: Record<string, boolean> };
    featureRegistry: FeatureRegistryEntry[];
  }>("/adminGetFeatureConfig");
export const adminSetFeatureConfig = (data: { role: "user" | "admin"; featureId: string; enabled: boolean }) =>
  httpPost<{ status: string }>("/adminSetFeatureConfig", data);
export const adminSetUserFeatures = (data: { uid: string; featureOverrides: Record<string, boolean | null> }) =>
  httpPost<{ status: string }>("/adminSetUserFeatures", data);

// Bookings (assistant-booked appointments — new unified booking view).
// Separate namespace from the legacy `appointmentsList` (call-session
// derived view defined below).
export interface BookingAppointment {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  attendeeName?: string;
  attendeeEmail?: string;
  attendeePhone?: string;
  location?: string;
  notes?: string;
  status: string;
  assistantId?: string | null;
  callSessionId?: string | null;
  createdAt?: string | null;
}
export const bookingsList   = () =>
  httpGet<{ items: BookingAppointment[] }>("/bookingsList");
export const bookingsCreate = (data: { title: string; startAt: string; endAt: string; attendeeName?: string; attendeeEmail?: string; attendeePhone?: string; location?: string; notes?: string; timezone?: string; assistantId?: string }) =>
  httpPost<{ id: string; startAt: string; endAt: string }>("/bookingsCreate", data);
export const bookingsCancel = (id: string) =>
  httpPost<{ ok: boolean }>("/bookingsCancel", { id });

// AI Assistant Wizard
export interface WizardState {
  basics?: { name?: string; companyName?: string; language?: string; firstMessage?: string; industry?: string };
  personality?: { voice?: string; tone?: string; systemPrompt?: string };
  tools?: Array<{ toolId: string; reason?: string }>;
  finalized?: boolean;
}
export interface WizardAssistantConfig {
  name: string;
  assistantName: string;
  companyName: string;
  language: string;
  firstMessage: string;
  voice: string;
  systemPrompt: string;
  industry: string;
  tools: string[];
}
export const wizardChat = (data: { sessionId?: string | null; userMessage: string; voiceMode?: boolean }) =>
  httpPost<{
    sessionId: string;
    reply: string;
    state: WizardState;
    assistantConfig: WizardAssistantConfig;
    done: boolean;
  }>("/wizardChat", data);

export const wizardSTT = (data: { audioBase64: string; mimeType?: string; language?: string }) =>
  httpPost<{ transcript: string; confidence: number | null; language: string }>("/wizardSTT", data);

export async function wizardTTS(data: { text: string; voiceId?: string }): Promise<Blob> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/wizardTTS`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  return res.blob();
}

export const adminResetPassword = (data: { email: string }) =>
  httpPost<{ resetLink: string }>("/adminResetPassword", data);

export const adminCreateUser = (data: { email: string; password: string; displayName?: string; role?: "user" | "admin" }) =>
  httpPost<AdminUser>("/adminCreateUser", data);

export const adminGetUserDetail = (uid: string) =>
  httpGet<{
    assistants: { id: string; name: string; language?: string; voice?: string; createdAt?: unknown }[];
    recentCalls: { id: string; leadNumber?: string; status?: string; createdAt?: unknown; assistantName?: string; scenarioId?: string; duration?: number }[];
    scenarios: { id: string; name: string; description?: string; nodeCount?: number; isActive?: boolean; createdAt?: unknown; updatedAt?: unknown }[];
    leads: { id: string; name?: string; phone?: string; email?: string; status?: string; createdAt?: unknown }[];
    campaigns: { id: string; name?: string; status?: string; leadCount?: number; createdAt?: unknown }[];
    phoneNumbers: { id: string; phoneNumber: string; friendlyName?: string; assistantId?: string }[];
    plan?: string;
    stripeCustomerId?: string;
    stripeStatus?: string;
    featureOverrides?: Record<string, boolean>;
  }>(`/adminGetUserDetail?uid=${encodeURIComponent(uid)}`);

export const bootstrapSuperAdmin = () =>
  httpPost<{ status: string; message: string }>("/bootstrapSuperAdmin", {});

// ── Admin Phone Numbers & Integrations ────────────────────────────────────────
export const adminListAllPhoneNumbers = () =>
  httpGet<AdminPhoneNumber[]>("/adminListAllPhoneNumbers");

export const adminReleasePhoneNumber = (data: { sid: string; phoneNumber?: string }) =>
  httpPost<{ status: string }>("/adminReleasePhoneNumber", data);

export const adminReassignPhoneNumber = (data: { sid: string; phoneNumber?: string; newOwnerId: string }) =>
  httpPost<{ status: string }>("/adminReassignPhoneNumber", data);

export const adminCheckIntegrations = () =>
  httpGet<AllIntegrationResults>("/adminCheckIntegrations");

// ── User Integration Status (non-admin, env-var presence check) ──────────────
export interface UserIntegrationService {
  configured: boolean;
  label: string;
  description: string;
}

export interface UserIntegrationStatus {
  services: {
    twilio:     UserIntegrationService;
    stripe:     UserIntegrationService;
    sendgrid:   UserIntegrationService;
    elevenlabs: UserIntegrationService;
    deepgram:   UserIntegrationService;
    openai:     UserIntegrationService;
    whatsapp:   UserIntegrationService;
  };
  timestamp: string;
}

export const getIntegrationStatus = () =>
  httpGet<UserIntegrationStatus>("/getIntegrationStatus");

// ── Admin Settings ─────────────────────────────────────────────────────────
export const adminGetSubscriptions = () =>
  httpGet<AdminSubscriptionUser[]>("/adminGetSubscriptions");

export const adminOverridePlan = (data: { uid: string; plan: PlanTier }) =>
  httpPost<{ status: string }>("/adminOverridePlan", data);

export const adminGetPlanConfig = () =>
  httpGet<{ plans: AllPlanConfigs; source: "firestore" | "hardcoded" }>("/adminGetPlanConfig");

export const adminUpdatePlanConfig = (data: { plans: AllPlanConfigs }) =>
  httpPost<{ status: string }>("/adminUpdatePlanConfig", data);

export const adminGetSystemSettings = () =>
  httpGet<SystemSettings>("/adminGetSystemSettings");

export const adminUpdateSystemSettings = (data: { settings: SystemSettings }) =>
  httpPost<{ status: string }>("/adminUpdateSystemSettings", data);

export const adminGetKeysMeta = () =>
  httpGet<AllKeysMeta>("/adminGetKeysMeta");

export const adminUpdateKeyMeta = (data: { keyName: string; last4: string | null; isSet: boolean }) =>
  httpPost<{ status: string }>("/adminUpdateKeyMeta", data);

export interface BillingConfig {
  signupCreditCents: number;
  signupCreditDays: number;
  basicRequiresOwnKeys: boolean;
}

export const adminGetBillingConfig = () =>
  httpGet<BillingConfig>("/adminGetBillingConfig");

export const adminUpdateBillingConfig = (data: { config: BillingConfig }) =>
  httpPost<{ status: string }>("/adminUpdateBillingConfig", data);

// ── Pronunciation Dictionary ─────────────────────────────────────────
export interface PronunciationFix {
  original: string;
  replacement: string;
  note: string;
}
export const adminGetPronunciation = () =>
  httpGet<{ fixes: PronunciationFix[] }>("/adminGetPronunciation");
export const adminUpdatePronunciation = (data: { fixes: PronunciationFix[] }) =>
  httpPost<{ status: string; count: number }>("/adminUpdatePronunciation", data);

// ── Knowledge Base ────────────────────────────────────────────────────
export const knowledgeProcessFile = (data: { assistantId: string; storagePath: string; fileName: string }) =>
  httpPost<{ chunksCreated: number; fileName: string }>("/knowledgeProcessFile", data);

export const knowledgeListFiles = (assistantId: string) =>
  httpGet<KnowledgeFile[]>(`/knowledgeListFiles?assistantId=${encodeURIComponent(assistantId)}`);

export const knowledgeDeleteFile = (data: { assistantId: string; sourceFile: string }) =>
  httpPost<{ deleted: number }>("/knowledgeDeleteFile", data);

export const knowledgeProcessUrl = (data: { assistantId: string; url: string }) =>
  httpPost<{ chunksCreated: number; pagesCrawled?: number; url: string }>("/knowledgeProcessUrl", data);

export interface CrawlPage { url: string; name?: string; chunks: number; chars: number }
export interface CrawlReport { sourceRoot: string; totalPages: number; totalChunks: number; totalChars: number; pages: CrawlPage[] }
export const knowledgeCrawlReport = (assistantId: string, sourceRoot: string) =>
  httpGet<CrawlReport>(`/knowledgeCrawlReport?assistantId=${encodeURIComponent(assistantId)}&sourceRoot=${encodeURIComponent(sourceRoot)}`);

export const knowledgeSync = (data: { assistantId: string; url: string }) =>
  httpPost<{ chunksCreated: number; pagesCrawled?: number; url: string }>("/knowledgeSync", data);

export const knowledgeProcessText = (data: { assistantId: string; text: string; title?: string }) =>
  httpPost<{ chunksCreated: number; title: string }>("/knowledgeProcessText", data);

// Clear the entire knowledge base for an assistant (all sources + chunks).
export const knowledgeClearAll = (data: { assistantId: string }) =>
  httpPost<{ deleted: number }>("/knowledgeClearAll", data);

// Load a source's full text back (for in-place editing of text/sheet entries).
export const knowledgeGetSource = (assistantId: string, sourceFile: string) =>
  httpGet<{ status: string; sourceFile: string; sourceType: string; content: string }>(
    `/knowledgeGetSource?assistantId=${encodeURIComponent(assistantId)}&sourceFile=${encodeURIComponent(sourceFile)}`,
  );

// ── Language Tutor (browser-based English lessons) ───────────────────

export interface TutorSession {
  client_secret: { value: string; expires_at: number };
  session_id: string;
  model: string;
  voice: string;
  mode: "lesson" | "placement";
  lessonMode: string;
  level: string;
  theme: string | null;
  moduleId: string | null;
  durationMin: number;
  isFirstLesson: boolean;
  courseId?: string;
  targetLang?: string;
  targetLangLabel?: string;
}

/** Per-course progress tracked independently under `courseProgress[courseId]`. */
export interface TutorCourseProgress {
  level?: "beginner" | "intermediate" | "advanced" | null;
  placementExamCompleted?: boolean;
  placementExamResult?: {
    level: string;
    strengths: string[];
    weaknesses: string[];
    recommendedThemes?: string[];
    notes?: string;
  } | null;
  strengths?: string[];
  weaknesses?: string[];
  preferredThemes?: string[];
  completedModules?: Record<string, string[]>;
  vocabularyMastered?: string[];
  vocabularyIntroduced?: string[];
  recurringMistakes?: Array<{ pattern: string; count: number }>;
}

export interface TutorStudentProfile {
  uid: string;
  nativeLanguage?: string | null;
  /** Flat fields preserved for backward compat — treated as "English course progress" when no courseProgress["en-general"] exists. */
  level: "beginner" | "intermediate" | "advanced" | null;
  placementExamCompleted: boolean;
  placementExamResult?: {
    level: string;
    strengths: string[];
    weaknesses: string[];
    recommendedThemes?: string[];
    notes?: string;
  } | null;
  totalLessonsCount: number;
  totalMinutes: number;
  strengths: string[];
  weaknesses: string[];
  vocabularyMastered: string[];
  vocabularyIntroduced: string[];
  recurringMistakes: Array<{ pattern: string; count: number }>;
  preferredThemes: string[];
  completedModules?: Record<string, string[]>;
  summaryEmailEnabled?: boolean;
  summaryEmailExtra?: string | null;
  /** Multi-language course fields */
  currentCourseId?: string;
  courseProgress?: Record<string, TutorCourseProgress>;
  /** Extra fields `tutorUpdateStudentProfile` accepts — typed permissively for Partial<> update calls */
  courseId?: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TutorKnowledgeSource {
  title: string;
  sourceType: "text" | "url";
  chunks: number;
}

export interface LessonCorrection {
  studentSaid: string;
  correct: string;
  explanation?: string;
  category: "grammar" | "vocabulary" | "pronunciation" | "phrasing" | "accent" | "intonation";
  at: string;
}

export interface PronunciationDrill {
  word: string;
  targetSound: string;
  ipa?: string;
  tip?: string;
  at: string;
}

export interface LessonVocabEntry {
  word: string;
  definition: string;
  example?: string;
  at: string;
}

export interface LessonTranscriptEntry {
  role: "user" | "tutor";
  content: string;
  timestamp: string;
}

export interface LessonSaveInput {
  courseId?: string;
  language?: string;
  level?: "beginner" | "intermediate" | "advanced";
  theme?: string | null;
  moduleId?: string | null;
  topic?: string | null;
  voice?: string;
  mode?: "lesson" | "placement";
  durationSec: number;
  durationPlannedMin?: number;
  transcript: LessonTranscriptEntry[];
  corrections: LessonCorrection[];
  vocabulary: LessonVocabEntry[];
  pronunciationDrills?: PronunciationDrill[];
  summary?: string | null;
  realtimeInputSec: number;
  realtimeOutputSec: number;
}

export interface LessonSummary {
  id: string;
  level: string | null;
  theme?: string | null;
  moduleId?: string | null;
  topic: string | null;
  durationSec: number;
  correctionsCount: number;
  vocabularyCount: number;
  summary: string | null;
  cost: number;
  mode?: "lesson" | "placement";
  createdAt: string | null;
}

export interface LessonDetail extends LessonSummary {
  voice?: string;
  transcript: LessonTranscriptEntry[];
  corrections: LessonCorrection[];
  vocabulary: LessonVocabEntry[];
  pronunciationDrills?: PronunciationDrill[];
  realtimeInputSec: number;
  realtimeOutputSec: number;
}

export const tutorCreateSession = (data: { courseId?: string; theme?: string | null; moduleId?: string | null; durationMin?: number; voice?: string; lessonMode?: string }) =>
  httpPost<TutorSession>("/tutorCreateSession", data);

export const lessonsSave = (data: LessonSaveInput) =>
  httpPost<{ id: string; cost: number; correctionsCount?: number; vocabularyCount?: number }>("/lessonsSave", data);

export const lessonsList = () =>
  httpGet<{ lessons: LessonSummary[] }>("/lessonsList");

export const lessonsGet = (id: string) =>
  httpGet<LessonDetail>(`/lessonsGet?id=${encodeURIComponent(id)}`);

export const tutorGetStudentProfile = () =>
  httpGet<TutorStudentProfile>("/tutorGetStudentProfile");

export const tutorUpdateStudentProfile = (data: Partial<TutorStudentProfile>) =>
  httpPost<{ status: string }>("/tutorUpdateStudentProfile", data);

export const tutorKnowledgeProcessText = (data: { title: string; text: string }) =>
  httpPost<{ ok: boolean; chunks: number; title: string }>("/tutorKnowledgeProcessText", data);

export const tutorKnowledgeList = () =>
  httpGet<{ sources: TutorKnowledgeSource[] }>("/tutorKnowledgeList");

export const tutorKnowledgeDelete = (data: { title: string }) =>
  httpPost<{ ok: boolean; deleted: number }>("/tutorKnowledgeDelete", data);

// Scheduled lessons ---------------------------------------------------
export interface ScheduledLesson {
  id: string;
  scheduledAt: string;
  durationMin: number;
  theme: string | null;
  moduleId: string | null;
  voice: string;
  notes?: string;
  status: "scheduled" | "completed" | "cancelled" | "missed";
  createdAt: string | null;
}
export const scheduledLessonsCreate = (data: {
  scheduledAt: string;
  durationMin?: number;
  theme?: string | null;
  moduleId?: string | null;
  voice?: string;
  notes?: string;
}) => httpPost<{ id: string; scheduledAt: string }>("/scheduledLessonsCreate", data);

export const scheduledLessonsList = () =>
  httpGet<{ items: ScheduledLesson[] }>("/scheduledLessonsList");

export const scheduledLessonsCancel = (data: { id: string }) =>
  httpPost<{ ok: boolean }>("/scheduledLessonsCancel", data);

// Admin tutor views ---------------------------------------------------
export interface AdminTutorStudent {
  uid: string;
  email: string;
  level: string | null;
  placementDone: boolean;
  lessons: number;
  minutes: number;
  cost: number;
  lastAt: string | null;
  vocabularyCount: number;
}
export interface AdminStudentLesson {
  id: string;
  level: string | null;
  theme: string | null;
  moduleId: string | null;
  topic: string | null;
  mode: "lesson" | "placement";
  durationSec: number;
  correctionsCount: number;
  vocabularyCount: number;
  drillsCount: number;
  cost: number;
  realtimeInputSec: number;
  realtimeOutputSec: number;
  createdAt: string | null;
}
export const adminListTutorStudents = () =>
  httpGet<{ students: AdminTutorStudent[] }>("/adminListTutorStudents");

export const adminListStudentLessons = (studentUid: string) =>
  httpGet<{ lessons: AdminStudentLesson[] }>(`/adminListStudentLessons?studentUid=${encodeURIComponent(studentUid)}`);

// ── Leads & Campaigns CRM ─────────────────────────────────────────────
export const leadsBatchCreate = (data: { campaignId?: string; leads: Partial<Lead>[] }) =>
  httpPost<{ created: number }>("/leadsBatchCreate", data);

export const leadsUpdate = (data: { id: string } & Partial<Lead>) =>
  httpPost<{ status: string }>("/leadsUpdate", data);

export const leadsDelete = (data: { id: string }) =>
  httpPost<{ status: string }>("/leadsDelete", data);

export const campaignsCreate = (data: { name: string; assistantId: string; fromNumber: string; description?: string }) =>
  httpPost<Campaign>("/campaignsCreate", data);

export const campaignsList = () =>
  httpGet<Campaign[]>("/campaignsList");

export const campaignStart = (data: { campaignId: string; batchSize?: number }) =>
  httpPost<{ queued: number; remaining: number; errors?: number }>("/campaignStart", data);

export const campaignPause = (data: { campaignId: string }) =>
  httpPost<{ status: string }>("/campaignPause", data);

export const appointmentsList = (params?: { assistantId?: string; from?: string; to?: string }) =>
  httpGet<Appointment[]>(`/appointmentsList${params && Object.keys(params).length ? "?" + new URLSearchParams(params as Record<string, string>) : ""}`);

// ── SIP setup wizard (admin only) ─────────────────────────────────────
export const sipSetupCheckBridge = (data: { bridgeUrl: string; bridgeSecret?: string }) =>
  httpPost<{ ok: boolean; ariConnected?: boolean; version?: string; activeCalls?: number; latencyMs?: number; error?: string }>(
    "/sipSetupCheckBridge", data
  );

export const sipSetupGetConfig = () =>
  httpGet<{
    functions: { SIP_BRIDGE_URL: boolean; SIP_BRIDGE_SECRET: boolean; currentBridgeUrl: string | null };
  }>("/sipSetupGetConfig");

export interface SipVerifyResult {
  firebaseEnv:     { ok: boolean; detail: string };
  cloudRunPing:    { ok: boolean; status: number | null; detail: string };
  bridgeReachable: { ok: boolean; ariConnected: boolean; version: string | null; detail: string };
}
export const sipSetupVerify = (data: { bridgeUrl?: string; bridgeSecret?: string }) =>
  httpPost<SipVerifyResult>("/sipSetupVerify", data);

// ── System policies (admin-editable Gemini Live behavior rules) ─────────
export interface SystemPolicy {
  voiceHeader?: string | null;
  goodbyePatterns?: { hebrew?: string; arabic?: string; english?: string; spanish?: string };
  silenceThresholdMs?: number;
  silenceMaxChecks?: number;
  silenceFarewell?: { hebrew?: string; arabic?: string; english?: string };
  silenceCheckIn?:  { hebrew?: string; arabic?: string; english?: string };
  maxKbChars?: number;
  maxCallDurationSec?: number;
  showToolCallsInTranscript?: boolean;
  stripMetaEnabled?: boolean;
  globalTelephonyOverride?: "none" | "voximplant";
}
export const getSystemPolicies = () =>
  httpGet<{ policy: SystemPolicy; defaults: SystemPolicy }>("/getSystemPolicies");
export const updateSystemPolicies = (data: Partial<SystemPolicy>) =>
  httpPost<{ policy: SystemPolicy; updated: string[] }>("/updateSystemPolicies", data);

// ── Per-call technical diagnostics ─────────────────────────────────────
export interface DiagnosticEvent {
  ts: string;
  type: string;
  severity: "debug" | "info" | "warning" | "error";
  label: string;
  detail?: string;
  raw?: string;
}
export const getCallDiagnostics = (callSessionId: string, hours = 6) =>
  httpGet<{
    callSessionId: string;
    events: DiagnosticEvent[];
    summary: {
      totalEvents: number; errors: number; warnings: number;
      toolCalls: number; modelFallbacks: number; langHintRejected: boolean;
    };
    queriedHours: number;
  }>(`/getCallDiagnostics?callSessionId=${encodeURIComponent(callSessionId)}&hours=${hours}`);

// ── Admin secrets (rotation UI) ───────────────────────────────────────
export interface ManagedSecret {
  name: string; label: string; provider: string; functions: string[];
  status: "present" | "missing";
  versionCount: number;
  lastRotated: string | null;
  masked: string | null;
  error?: string | null;
}
export const adminListSecrets = () =>
  httpGet<{ secrets: ManagedSecret[]; project: string }>("/adminListSecrets");

export const adminRotateSecret = (data: { name: string; value: string }) =>
  httpPost<{
    name: string;
    versionName: string;
    message: string;
    affectedFunctions: string[];
  }>("/adminRotateSecret", data);

// ── Admin health dashboard ────────────────────────────────────────────
export interface HealthCheck {
  id: string; label: string; provider: string;
  status: "ok" | "degraded" | "down" | "unconfigured";
  detail: string;
  latencyMs: number;
  extra?: Record<string, unknown>;
}
export const adminHealthCheck = () =>
  httpGet<{
    overall: "ok" | "degraded" | "down";
    results: HealthCheck[];
    totalLatencyMs: number;
    checkedAt: string;
  }>("/adminHealthCheck");

// ── Admin logs ────────────────────────────────────────────────────────
export interface LogEntry {
  ts: string;
  severity: string;
  service: string;
  message: string;
  insertId: string | null;
}
export const adminLogsQuery = (params: {
  service?: "mediastream" | "functions" | "sip-bridge" | "all";
  severity?: "INFO" | "WARNING" | "ERROR";
  search?: string;
  callSessionId?: string;
  hours?: number;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
  return httpGet<{
    entries: LogEntry[];
    filter: string;
    queriedHours: number;
    count: number;
  }>(`/adminLogsQuery?${qs.toString()}`);
};

// ── Tool library ──────────────────────────────────────────────────────
export interface LibraryTool {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  parameters?: Array<{ name: string; type?: string; description?: string; required?: boolean }>;
  companyId?: string;
  enabled?: boolean;
  createdAt?: { _seconds: number } | null;
}
export const toolLibraryList = () =>
  httpGet<{ tools: LibraryTool[] }>("/toolLibraryList");

export const toolLibraryCreate = (data: Partial<LibraryTool>) =>
  httpPost<{ tool: LibraryTool }>("/toolLibraryCreate", data);

export const toolLibraryUpdate = (data: Partial<LibraryTool> & { id: string }) =>
  httpPost<{ tool: LibraryTool }>("/toolLibraryUpdate", data);

export const toolLibraryDelete = (data: { id: string }) =>
  httpPost<{ ok: boolean }>("/toolLibraryDelete", data);

// Owner-accessible single-tool test (assistant editor per-tool "Test" button).
export const customToolTest = (data: { tool: unknown; sampleArgs?: Record<string, unknown> }) =>
  httpPost<{ ok: boolean; status: number; ms: number; result: string; url?: string }>("/customToolTest", data);

export const toolLibraryTest = (data: { id?: string; tool?: Partial<LibraryTool>; sampleArgs?: Record<string, unknown> }) =>
  httpPost<{
    ok: boolean;
    status?: number;
    latencyMs: number;
    headers?: Record<string, string>;
    body?: string;
    url?: string;
    error?: string;
    code?: string;
  }>("/toolLibraryTest", data);

// ── Global tool preset packs (code-defined, available to every assistant) ──
export interface ToolPresetTool {
  name: string;
  displayName?: string;
  description: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  parameters?: Array<{ name: string; type?: string; description?: string; required?: boolean }>;
}
export interface ToolPresetPack {
  id: string;
  title: string;
  description: string;
  systemPrompt?: string;
  tools: ToolPresetTool[];
}
export const toolPresetsList = () =>
  httpGet<{ packs: ToolPresetPack[] }>("/toolPresetsList");

// ── ElevenLabs voice cloning ──────────────────────────────────────────
export interface CustomVoice {
  voiceId: string;
  name: string;
  companyId: string;
  consentDate: string;
  assistantIds: string[];
  createdAt: string | null;
  provider: "elevenlabs";
}

/** Upload sample + consent recording, get back a cloned voice_id.
 *  Returns null if the response isn't 2xx — caller should display the error. */
export async function elevenlabsCloneVoice(args: {
  sampleFile: Blob;
  consentFile: Blob;
  name: string;
  consentAttestation: string;
  description?: string;
}): Promise<{ voiceId: string; name: string; provider: "elevenlabs" }> {
  const fd = new FormData();
  fd.append("sampleFile", args.sampleFile, "sample.webm");
  fd.append("consentFile", args.consentFile, "consent.webm");
  fd.append("name", args.name);
  fd.append("consentAttestation", args.consentAttestation);
  if (args.description) fd.append("description", args.description);
  const headers: Record<string, string> = {};
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}
  const res = await fetch(`${FUNCTIONS_BASE}/elevenlabsCloneVoice`, {
    method: "POST", headers, body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string; detail?: string }).detail || (err as { error?: string }).error || res.statusText);
  }
  return res.json();
}

export const elevenlabsListVoices = () =>
  httpGet<CustomVoice[]>("/elevenlabsListVoices");

/** Super-admin: list custom voices across ALL tenants. Requires role super_admin. */
export const elevenlabsAdminListVoices = () =>
  httpGet<CustomVoice[]>("/elevenlabsListVoices?all=1");

export const elevenlabsDeleteVoice = (data: { voiceId: string }) =>
  httpPost<{ voiceId: string; results: { elevenlabs: boolean; firestore: boolean; gcs: boolean } }>(
    "/elevenlabsDeleteVoice", data
  );

export const elevenlabsPreviewVoice = (data: { voiceId: string; text: string }) =>
  httpPost<{ voiceId: string; audioBase64: string; mimeType: string; charCount: number }>(
    "/elevenlabsPreviewVoice", data
  );

// ── WhatsApp ──────────────────────────────────────────────────────────
export const sendWhatsApp = callFn<{ to: string; message: string }, { success: boolean }>("sendWhatsApp");

// ── Billing ───────────────────────────────────────────────────────────
export const stripeCustomerSubscription = callFn<{ action: string }, { url?: string }>("stripeCustomerSubscription");

export const createCheckoutSession = (data: { priceId: string; successUrl: string; cancelUrl: string }) =>
  httpPost<{ url: string }>("/createCheckoutSession", data);

export const createBillingPortalSession = (data: { returnUrl: string }) =>
  httpPost<{ url: string }>("/createBillingPortalSession", data);

export const getUserPlan = () =>
  httpGet<{
    plan: string;
    limits: Record<string, unknown>;
    usage: { minutesUsed: number; assistantCount: number; leadCount: number; campaignCount: number; callCount: number };
  }>("/getUserPlan");

// ── Scenarios (plain HTTP onRequest endpoints) ────────────────────────
export const scenariosCreate = (data: ScenarioInput) =>
  httpPost<ScenarioDoc>("/scenariosCreate", data);

export const scenariosList = () =>
  httpGet<{ scenarios: ScenarioDoc[] }>("/scenariosList");

export const scenariosGet = (id: string) =>
  httpGet<ScenarioDoc>(`/scenariosGet?id=${encodeURIComponent(id)}`);

export const scenariosUpdate = (data: Partial<ScenarioInput> & { id: string }) =>
  httpPost<ScenarioDoc>("/scenariosUpdate", data);

export const scenariosDelete = (id: string) =>
  httpPost<{ status: string }>("/scenariosDelete", { id });

// ── Scenario AI Wizard ─────────────────────────────────────────────────
export interface WizardMessage { role: "user" | "assistant"; content: string; }
export interface WizardChatResponse { message: string; ready: boolean; summary?: Record<string, string>; }
export interface WizardGenerateResponse { name: string; description: string; nodes: ScenarioNode[]; edges: ScenarioEdge[]; }

export const scenarioWizardChat = (messages: WizardMessage[]) =>
  httpPost<WizardChatResponse>("/scenarioWizardChat", { messages });

export const scenarioWizardGenerate = (messages: WizardMessage[], summary?: Record<string, string>) =>
  httpPost<WizardGenerateResponse>("/scenarioWizardGenerate", { messages, summary });

// ── Types ─────────────────────────────────────────────────────────────
export interface Assistant {
  id: string;
  name: string;
  assistantName?: string;
  companyName?: string;
  language: string;
  voice?: string;
  firstMessage?: string;
  systemPrompt?: string;
  instructions?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  phoneNumber?: string;
  isActive?: boolean;
  assignedPhoneNumbers?: string[];
  metadata?: { ownerId?: string | null; companyId?: string | null };
  voiceAccent?: "native-il" | "neutral" | "default" | "msa" | "levantine" | "gulf" | "egyptian";
}

export interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  country?: string;
  monthlyPrice?: string;
  // Voximplant-only fields, used to complete the purchase call.
  phoneId?: string;
  regionId?: string;
  category?: string;
  setupPrice?: string;
  provider?: "twilio" | "voximplant";
}

// ── SIP Trunk types ────────────────────────────────────────────────────
export type SipTrunkType       = "register" | "peer";
export type SipDtmfMode        = "rfc2833" | "info" | "inband" | "auto";
export type SipEncryption      = "required" | "preferred" | "disabled";
export type SipTransport       = "tls" | "tcp" | "udp";

export interface SipTestStep {
  step:   string;
  ok:     boolean;
  detail: string;
}

/** A DID (Direct Inward Dialing) number provisioned by the SIP provider */
export interface SipDid {
  id:           string;
  number:       string;       // E.164 format, e.g. +972501234567
  description?: string;
  assistantId?: string;       // which assistant handles inbound calls on this DID
}

/** Single item in an IVR DTMF menu */
export interface SipIvrMenuItem {
  key:          string;       // 0-9, *, #
  label:        string;       // spoken label, e.g. "Sales"
  action:       "assistant" | "extension" | "hangup";
  assistantId?: string;       // when action = assistant
  extension?:   string;       // when action = extension
}

/** DTMF IVR menu attached to a SIP trunk — plays on inbound call */
export interface SipIvrMenu {
  enabled: boolean;
  prompt:  string;    // TTS text spoken to the caller
  timeout: number;    // seconds to wait for digit input (default 5)
  items:   SipIvrMenuItem[];
}

/** Outbound routing rule — matches calls by E.164 prefix and routes them via this trunk */
export interface SipOutboundRoute {
  id:          string;
  pattern:     string;   // E.164 prefix, e.g. "+972" or "+1"
  description: string;
  priority:    number;   // lower = higher priority (1 = first tried)
}

export interface SipTrunk {
  id:             string;
  name:           string;
  type:           SipTrunkType;
  // Register fields
  registrar?:     string;
  username?:      string;
  authUsername?:  string;
  domain?:        string;
  hasPassword:    boolean;   // server never returns the actual password
  // Peer fields
  host?:          string;
  allowedIps?:    string[];
  // Common
  port:           number;
  transport:      SipTransport;
  callerId?:      string;
  dtmfMode:       SipDtmfMode;
  codecs:         string[];
  encryption:     SipEncryption;
  maxChannels:    number;
  status:         "active" | "inactive";
  // DID management
  dids?:          SipDid[];
  // IVR / DTMF menu
  ivrMenu?:       SipIvrMenu;
  // Outbound PBX routing
  outboundRoutes?: SipOutboundRoute[];
  testResult?:    { success: boolean; message: string; steps: SipTestStep[]; testedAt: string } | null;
  createdAt?:     unknown;
  updatedAt?:     unknown;
}

/** Input shape — includes password (write-only, never returned) */
export interface SipTrunkInput {
  name:           string;
  type:           SipTrunkType;
  // Register
  registrar?:     string;
  username?:      string;
  authUsername?:  string;
  domain?:        string;
  password?:      string;   // optional on update (omit = keep existing)
  // Peer
  host?:          string;
  allowedIps?:    string[];
  // Common
  port?:          number;
  transport:      SipTransport;
  callerId?:      string;
  dtmfMode:       SipDtmfMode;
  codecs?:        string[];
  encryption:     SipEncryption;
  maxChannels?:   number;
  status?:        "active" | "inactive";
  // DID, IVR, routing
  dids?:          SipDid[];
  ivrMenu?:       SipIvrMenu;
  outboundRoutes?: SipOutboundRoute[];
}

// ── SIP Health Check types ─────────────────────────────────────────────
export type SipHealthSeverity = "critical" | "warning" | "info";

export type SipHealthSummary  = "healthy" | "warning" | "critical";

export interface SipHealthIssue {
  severity: SipHealthSeverity;
  msg:      string;
}

export interface SipHealthCheck {
  id:     string;
  label:  string;
  ok:     boolean | null;   // null = skipped/not-applicable
  detail: string;
}

export interface SipTrunkHealthResult {
  id:        string;
  name:      string;
  type:      SipTrunkType;
  status:    "active" | "inactive";
  transport: string;
  health:    SipHealthSummary;
  checks:    SipHealthCheck[];
  issues:    SipHealthIssue[];
  trace:     string[];   // per-step request log shown in the UI
}

export interface SipBridgeHealth {
  status:             "online" | "offline" | "misconfigured" | "unconfigured" | "not_linked" | "error";
  url?:               string;
  hasSecret?:         boolean;
  asteriskConnected?: boolean;
  activeCalls?:       number;
  detail:             string;
}

export interface SipHealthCheckResult {
  status:      string;
  summary:     SipHealthSummary;
  checkedAt:   string;
  trunkCount:  number;
  trunks:      SipTrunkHealthResult[];
  bridge:      SipBridgeHealth;
  issues:      SipHealthIssue[];
}

export interface SipBridgeConfig {
  telephonyProvider:    string;   // e.g. "asterisk", "twilio", "generic"
  asteriskBridgeUrl:    string;   // e.g. "https://bridge.example.com"
  hasSecret:            boolean;  // true if a secret is stored (never returned)
  asteriskCallerId:     string;   // default outbound caller ID
  asteriskSipTrunkName: string;   // Asterisk trunk name to use
}

export interface SipBridgeConfigInput {
  telephonyProvider:     string;
  asteriskBridgeUrl:     string;
  asteriskBridgeSecret?: string;  // omit to keep existing secret
  asteriskCallerId?:     string;
  asteriskSipTrunkName?: string;
}

export interface SipTrace {
  traceId:    string;
  channelId:  string;
  sessionId:  string | null;
  from:       string;
  to:         string;
  companyId:  string;
  startMs:    number;
  endMs:      number;
  durationMs: number | null;
  createdAt:  unknown;
}

export interface TtsVoice {
  id: string;
  name: string;
  provider: string;
  language: string;
  gender?: string;
  previewUrl?: string;
}

export interface PlaceCallPayload {
  number: string;          // lead's phone number
  companyPhone: string;    // your Twilio number to call from
  assistantId?: string;
  assistantDefinition?: Partial<Assistant>;
  scenarioId?: string;
  leadId?: string;
}

export interface ScenarioNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface ScenarioEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
  condition?: string | null;
}

export interface ScenarioInput {
  name: string;
  description?: string;
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  variables?: Record<string, unknown>;
  settings?: {
    defaultVoice?: string;
    defaultLanguage?: string;
    recordCalls?: boolean;
    transcribeCalls?: boolean;
    maxDuration?: number;
  };
}

export interface ScenarioDoc extends ScenarioInput {
  id: string;
  version?: number;
  isActive?: boolean;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  role: "admin" | "user" | "super_admin";
  status: "active" | "suspended";
  disabled: boolean;
  createdAt?: unknown;
  assistantCount?: number;
  plan?: "basic" | "pro" | "scale";
  minutesUsedThisMonth?: number;
}

export interface AdminSubscriptionUser {
  uid: string;
  email: string;
  displayName?: string;
  plan: "basic" | "pro" | "scale";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeStatus?: string;
  minutesUsedThisMonth: number;
}

export type PlanTier = "basic" | "pro" | "scale";

export interface PlanConfig {
  // null = Unlimited. Backend persists null; UI renders ∞.
  assistants: number | null;
  minutesPerMonth: number | null;
  leads: number | null;
  campaigns: number | null;
  knowledgeBase: boolean;
  analytics: boolean;
  calendar: boolean;
  whatsapp: boolean;
  callHistoryLimit: number | null;
  price: number;
}

export interface AllPlanConfigs {
  basic: PlanConfig;
  pro: PlanConfig;
  scale: PlanConfig;
}

export interface KeyMeta {
  isSet: boolean;
  last4: string | null;
  description: string;
}

export interface AllKeysMeta {
  STRIPE_SECRET_KEY: KeyMeta;
  STRIPE_WEBHOOK_SECRET: KeyMeta;
  STRIPE_PRO_PRICE_ID: KeyMeta;
  STRIPE_SCALE_PRICE_ID: KeyMeta;
  ELEVENLABS_API_KEY: KeyMeta;
  TWILIO_ACCOUNT_SID: KeyMeta;
  TWILIO_AUTH_TOKEN: KeyMeta;
}

export interface AdminPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  country: string;
  voiceUrl?: string;
  smsUrl?: string;
  ownerId?: string | null;
  ownerEmail?: string | null;
  firestoreId?: string | null;
  dateCreated?: string | null;
}

export type IntegrationStatus = "ok" | "error" | "not_configured";

export interface IntegrationResult {
  status: IntegrationStatus;
  label: string;
  detail?: string;
  mode?: string;
  accountSid?: string;
}

export interface AllIntegrationResults {
  twilio:     IntegrationResult;
  stripe:     IntegrationResult;
  sendgrid:   IntegrationResult;
  elevenlabs: IntegrationResult;
  deepgram:   IntegrationResult;
  openai:     IntegrationResult;
  checkedAt?: string;
}

export interface SystemSettings {
  appName: string;
  supportEmail: string;
  defaultPlan: "basic" | "pro";
  featureFlags: {
    onboardingWizard: boolean;
    stripeLiveMode: boolean;
    maintenanceMode: boolean;
  };
}

export interface AdminCallSession {
  id: string;
  leadNumber: string;
  status: string;
  createdAt?: unknown;
  assistantName?: string;
}

export interface KnowledgeFile {
  sourceFile: string;
  storagePath: string | null;
  chunkCount: number;
  sourceType?: "file" | "url";
  syncedAt?: unknown;
  pagesCount?: number;     // URL sources: number of distinct pages crawled
}

// ── Call Analysis ─────────────────────────────────────────────────────────────

export interface CallAnalysis {
  summary: string;
  outcome: "success" | "partial" | "failed" | "no_answer" | "unknown";
  outcomeReason: string;
  score: number;
  scoreReason: string;
  strengths: string[];
  improvements: string[];
  recommendedApproach: string;
  sentiment: "positive" | "neutral" | "negative" | "frustrated";
  keyMoments: string[];
  analyzedAt?: string;
}

export const analyzeCall = (callSessionId: string) =>
  httpPost<CallAnalysis>("/analyzeCall", { callSessionId });

// ── CRM Types ─────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  notes?: string;
  customFields?: Record<string, string>;
  status: "new" | "queued" | "calling" | "completed" | "callback" | "failed" | "dnc";
  campaignId?: string;
  assistantId?: string;
  callCount?: number;
  lastCallId?: string;
  lastCallDate?: unknown;
  lastCallSummary?: string;
  lastCallOutcome?: string;
  ownerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  assistantId: string;
  fromNumber: string;
  status: "draft" | "running" | "paused" | "completed";
  leadCount: number;
  calledCount: number;
  successCount: number;
  failedCount: number;
  ownerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Appointment {
  id: string;
  customerName?: string;
  customerPhone?: string;
  service?: string;
  time?: string;
  assistantId?: string;
  assistantName?: string;
  callSessionId?: string;
  companyId?: string;
  analysis?: { summary?: string; outcome?: string; };
  createdAt?: unknown;
  status?: string;
}

// ── Cost Tracking & Customer Pricing ────────────────────────────

export interface RateCard {
  twilio: { costPerMinute: number };
  openai: { costPerPromptToken1K: number; costPerCompletionToken1K: number; costPerTtsChar1K: number };
  openaiRealtime?: { costPerMinuteInput: number; costPerMinuteOutput: number };
  deepgram: { costPerMinute: number };
  googleTts: { costPerChar1K: number };
  currency: string;
}

export interface CustomerPricingOverride {
  model: "markup" | "fixedPerMinute";
  markupPercent: number | null;
  fixedPerMinute: number | null;
  displayName?: string;
}

export interface CustomerPricingConfig {
  defaultModel: "markup" | "fixedPerMinute";
  defaultMarkupPercent: number;
  defaultFixedPerMinute: number;
  currency: string;
  overrides: Record<string, CustomerPricingOverride>;
}

export interface CostDashboardResult {
  summary: { totalCost: number; totalRevenue: number; profit: number; totalCalls: number; totalMinutes: number };
  byService: { twilio: number; llm: number; stt: number; tts: number; realtime?: number };
  byUser: Array<{ uid: string; email: string; calls: number; minutes: number; cost: number; revenue: number }>;
  byAssistant?: Array<{ assistantId: string; assistantName: string; calls: number; minutes: number; cost: number; revenue: number }>;
  calls: Array<{ id: string; createdAt: string; ownerId: string; assistantId?: string; assistantName?: string; duration: number; costs: Record<string, unknown> }>;
}

export interface CostConfigResult {
  rateCard: RateCard;
  customerPricing: CustomerPricingConfig;
}
export const getCostConfig = () => httpGet<CostConfigResult>("/getCostConfig");

export const adminGetRateCard = () => httpGet<RateCard>("/adminGetRateCard");
export const adminUpdateRateCard = (data: { rateCard: RateCard }) => httpPost<{ status: string }>("/adminUpdateRateCard", data);
export const adminGetCustomerPricing = () => httpGet<CustomerPricingConfig>("/adminGetCustomerPricing");
export const adminUpdateCustomerPricing = (data: Partial<CustomerPricingConfig>) => httpPost<{ status: string }>("/adminUpdateCustomerPricing", data);
export const adminGetCostDashboard = (params: { from: string; to: string; userId?: string }) =>
  httpGet<CostDashboardResult>(`/adminGetCostDashboard?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}${params.userId ? `&userId=${encodeURIComponent(params.userId)}` : ""}`);

// ── Super-admin Call Telemetry ────────────────────────────────────────────────

export interface CallTelemetryTurn {
  i: number;
  tOffset: number;
  user: string;
  bot: string;
  totalMs: number | null;
  sttMs?: number | null;
  llmMs?: number | null;
  ttsMs?: number | null;
  rtLatencyMs?: number | null;
  bargedIn: boolean;
  tools: string[];
}
export interface CallTelemetryEvent { t: number; e: string; d?: Record<string, unknown>; }
export interface CallTelemetryToolCall { name: string; latencyMs: number | null; success: boolean; resultLen: number; }
export interface CallTelemetryError { t: number; code: string; msg: string; }
export interface CallTelemetryInsights {
  avgTurnLatencyMs: number | null;
  minTurnLatencyMs: number | null;
  maxTurnLatencyMs: number | null;
  p50TurnLatencyMs: number | null;
  p75TurnLatencyMs: number | null;
  p95TurnLatencyMs: number | null;
  avgSttMs?: number | null;
  avgLlmMs?: number | null;
  avgTtsMs?: number | null;
  bargeInRate: number;
  stallRate: number;
  toolCallSuccessRate: number | null;
  greetingLatencyMs: number | null;
  setupLatencyMs: number | null;
  streamStartMs: number | null;
  health: "good" | "warn" | "critical";
}
export interface CallTelemetryData {
  callSessionId: string;
  assistantId: string | null;
  ownerId: string | null;
  mode: "realtime" | "standard";
  language: string | null;
  voice: string | null;
  startAt: { _seconds: number } | string;
  endAt: { _seconds: number } | string | null;
  durationMs: number | null;
  milestones: Record<string, number>;
  turnCount: number;
  bargeInCount: number;
  stallCount: number;
  truncationCount: number;
  toolCallCount: number;
  errorCount: number;
  audioPacketsIn: number;
  audioPacketsOut: number;
  turns: CallTelemetryTurn[];
  toolCalls: CallTelemetryToolCall[];
  events: CallTelemetryEvent[];
  errors: CallTelemetryError[];
  insights: CallTelemetryInsights;
  costs: Record<string, unknown> | null;
}

export const adminGetCallTelemetry = (callId: string) =>
  httpGet<CallTelemetryData>(`/adminGetCallTelemetry?callId=${encodeURIComponent(callId)}`);

export const adminListCallTelemetry = (params?: { ownerId?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params?.ownerId) qs.set("ownerId", params.ownerId);
  if (params?.limit) qs.set("limit", String(params.limit));
  return httpGet<CallTelemetryData[]>(`/adminListCallTelemetry?${qs}`);
};

// ── Activity Log ─────────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: string;
  timestamp: string | null;
  userId: string;
  userEmail: string;
  action: string;
  category: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  status: string;
}

export interface ActivityLogResponse {
  entries: ActivityLogEntry[];
  nextCursor: string | null;
  total: number;
}

export const adminGetActivityLog = (params: { limit?: number; startAfter?: string; category?: string; userId?: string }) => {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.startAfter) query.set("startAfter", params.startAfter);
  if (params.category) query.set("category", params.category);
  if (params.userId) query.set("userId", params.userId);
  return httpGet<ActivityLogResponse>(`/adminGetActivityLog?${query.toString()}`);
};

// ── Compliance Service ────────────────────────────────────────────────────────

export interface DncEntry {
  id: string;
  phone: string;
  reason?: string;
  addedAt: string | null;
}

export interface ConsentRecord {
  id: string;
  phone: string;
  channel: string;
  purpose?: string;
  method?: string;
  consentedAt: string | null;
  expiresAt?: string | null;
  status: string;
}

export interface ComplianceViolation {
  id: string;
  callSessionId?: string;
  violationType: string;
  severity: string;
  details?: Record<string, unknown>;
  createdAt: string | null;
}

export interface ComplianceDashboardResult {
  totalCalls: number;
  blockedCalls: number;
  violations: { critical: number; high: number; medium: number; warning: number };
  dncCount: number;
  activeConsents: number;
  complianceScore: number;
}

export const complianceCheckCall = (data: { phoneNumber: string; channel?: string }) =>
  httpPost<{ status: string; allowed: boolean; violations: string[]; tcpaCompliant: boolean }>("/complianceCheckCall", data);

export const complianceDncAdd = (data: { phone: string; reason?: string }) =>
  httpPost<{ status: string; id: string }>("/complianceDncAdd", data);

export const complianceDncRemove = (data: { phone: string; reason?: string }) =>
  httpPost<{ status: string }>("/complianceDncRemove", data);

export const complianceDncList = (params?: { page?: number; limit?: number }) =>
  httpGet<{ status: string; entries: DncEntry[]; count: number }>(
    `/complianceDncList?page=${params?.page ?? 0}&limit=${params?.limit ?? 50}`
  );

export const complianceDncBulkAdd = (data: { phones: string[]; reason?: string }) =>
  httpPost<{ status: string; added: number; skipped: number }>("/complianceDncBulkAdd", data);

export const complianceConsentRecord = (data: { phone: string; channel: string; purpose?: string; method?: string; expiresInDays?: number }) =>
  httpPost<{ status: string; id: string }>("/complianceConsentRecord", data);

export const complianceConsentList = (params?: { page?: number; limit?: number; status?: string }) => {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  return httpGet<{ status: string; consents: ConsentRecord[]; count: number }>(`/complianceConsentList?${q}`);
};

export const complianceConsentRevoke = (data: { phone: string; reason?: string }) =>
  httpPost<{ status: string }>("/complianceConsentRevoke", data);

export const complianceGetReport = (params?: { from?: string; to?: string }) => {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  return httpGet<{ status: string; violations: ComplianceViolation[]; count: number }>(`/complianceGetReport?${q}`);
};

export const complianceDashboard = () =>
  httpGet<{ status: string } & ComplianceDashboardResult>("/complianceDashboard");

// ── Verbal Contract Service ───────────────────────────────────────────────────

export interface ContractTemplate {
  id: string;
  name: string;
  terms: string[];
  language: string;
  smsConfirmation: boolean;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface VerbalContract {
  id: string;
  callSessionId: string;
  templateId?: string;
  templateName: string;
  terms: string[];
  partyName?: string;
  partyPhone?: string;
  contractHash: string;
  status: string;
  confirmedTranscriptSnippet?: string;
  confirmedAt: string | null;
  createdAt: string | null;
}

export const contractTemplateCreate = (data: { name: string; terms: string[]; language?: string; smsConfirmation?: boolean }) =>
  httpPost<{ status: string; id: string }>("/contractTemplateCreate", data);

export const contractTemplateUpdate = (data: { id: string; name?: string; terms?: string[]; language?: string; smsConfirmation?: boolean }) =>
  httpPost<{ status: string }>("/contractTemplateUpdate", data);

export const contractTemplateList = () =>
  httpGet<{ status: string; templates: ContractTemplate[] }>("/contractTemplateList");

export const contractTemplateDelete = (data: { id: string }) =>
  httpPost<{ status: string }>("/contractTemplateDelete", data);

export const contractList = (params?: { page?: number; limit?: number }) =>
  httpGet<{ status: string; contracts: VerbalContract[]; count: number; page: number; limit: number }>(
    `/contractList?page=${params?.page ?? 0}&limit=${params?.limit ?? 50}`
  );

export const contractGet = (id: string) =>
  httpGet<{ status: string; contract: VerbalContract }>(`/contractGet?id=${encodeURIComponent(id)}`);

export const contractVoid = (data: { id: string; reason?: string }) =>
  httpPost<{ status: string }>("/contractVoid", data);

// ── Voice Commerce Service ────────────────────────────────────────────────────

export interface VoiceProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  sku?: string;
  stock?: number | null;
  category?: string;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface VoiceOrder {
  id: string;
  callSessionId: string;
  items: Array<{ productId?: string; name: string; price: number; quantity: number }>;
  totalAmount: number;
  currency: string;
  partyName?: string;
  partyPhone?: string;
  paymentLink?: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export const voiceProductCreate = (data: Partial<VoiceProduct>) =>
  httpPost<{ status: string; id: string }>("/voiceProductCreate", data);

export const voiceProductUpdate = (data: Partial<VoiceProduct> & { id: string }) =>
  httpPost<{ status: string }>("/voiceProductUpdate", data);

export const voiceProductList = (includeInactive?: boolean) =>
  httpGet<{ status: string; products: VoiceProduct[]; count: number }>(
    `/voiceProductList${includeInactive ? "?includeInactive=true" : ""}`
  );

export const voiceProductDelete = (data: { id: string }) =>
  httpPost<{ status: string }>("/voiceProductDelete", data);

export const voiceOrderList = (params?: { page?: number; limit?: number; status?: string }) => {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  return httpGet<{ status: string; orders: VoiceOrder[]; count: number }>(`/voiceOrderList?${q}`);
};

export const voiceOrderGet = (id: string) =>
  httpGet<{ status: string; order: VoiceOrder }>(`/voiceOrderGet?id=${encodeURIComponent(id)}`);

export const voiceOrderUpdateStatus = (data: { id: string; status: string }) =>
  httpPost<{ status: string }>("/voiceOrderUpdateStatus", data);

// ── Agent Registry Service ────────────────────────────────────────────────────

export interface AgentRegistration {
  id: string;
  agentName: string;
  description?: string;
  capabilities: string[];
  webhookUrl?: string;
  phoneNumber?: string;
  status: string;
  callsReceived: number;
  apiKeyVisible?: string;  // Only present on create/rotate
  createdAt: string | null;
  updatedAt: string | null;
}

export const agentRegister = (data: {
  agentName: string;
  description?: string;
  capabilities: string[];
  webhookUrl?: string;
  phoneNumber?: string;
}) => httpPost<{ status: string; agentId: string; apiKey: string; message: string }>("/agentRegister", data);

export const agentUpdate = (data: {
  agentId: string;
  description?: string;
  capabilities?: string[];
  webhookUrl?: string;
  status?: string;
}) => httpPost<{ status: string }>("/agentUpdate", data);

export const agentUnregister = (data: { agentId: string }) =>
  httpPost<{ status: string }>("/agentUnregister", data);

export const agentDirectory = (params?: { limit?: number; offset?: number }) =>
  httpGet<{ status: string; agents: AgentRegistration[]; total: number }>(
    `/agentDirectory?limit=${params?.limit ?? 20}&offset=${params?.offset ?? 0}`
  );

export const agentSearch = (data: { query: string; capabilities?: string[] }) =>
  httpPost<{ status: string; agents: AgentRegistration[]; count: number }>("/agentSearch", data);

export const agentMyListings = () =>
  httpGet<{ status: string; agents: AgentRegistration[] }>("/agentMyListings");

export const agentRotateKey = (data: { agentId: string }) =>
  httpPost<{ status: string; apiKey: string; message: string }>("/agentRotateKey", data);

// ── El Al Airlines Demo ───────────────────────────────────────────────────────

export const elAlSeedAssistant = () =>
  httpPost<{ success: boolean; assistantId: string; chunksCreated: number; message: string }>(
    "/elAlSeedAssistant",
    {}
  );
