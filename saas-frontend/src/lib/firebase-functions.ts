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

async function httpPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Assistants ────────────────────────────────────────────────────────
export const assistantsList = () =>
  httpGet<Assistant[]>("/assistantsList");

export const assistantsCreate = (data: Partial<Assistant>) =>
  httpPost<Assistant>("/assistantsCreate", data);

export const assistantsGet = (id: string) =>
  httpGet<Assistant>(`/assistantsGet?id=${encodeURIComponent(id)}`);

export const assistantsUpdate = (data: Partial<Assistant> & { id: string }) =>
  httpPost<Assistant>("/assistantsUpdate", data);

export const assistantsDelete = (data: { id: string }) =>
  httpPost<{ status: string }>("/assistantsDelete", data);

// ── Phone Numbers ─────────────────────────────────────────────────────
export const searchPhoneNumbers = (data: { country: string; areaCode?: string }) =>
  httpPost<PhoneNumber[]>("/searchPhoneNumbers", data);

export const purchasePhoneNumber = (data: { phoneNumber: string }) =>
  httpPost<{ sid: string; phoneNumber: string }>("/purchasePhoneNumber", data);

export const releasePhoneNumber = (data: { phoneNumber: string; sid?: string }) =>
  httpPost<{ status: string }>("/releasePhoneNumber", data);

export const listPhoneNumbers = () =>
  httpGet<Array<{ sid: string; phoneNumber: string; friendlyName: string; country: string }>>("/listPhoneNumbers");

export const configurePhoneNumber = (data: { phoneNumber: string; assistantId?: string }) =>
  httpPost<{ status: string }>("/configurePhoneNumber", data);

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

export const adminSetRole = (data: { uid: string; role: "user" | "admin" }) =>
  httpPost<{ status: string }>("/adminSetRole", data);

export const adminResetPassword = (data: { email: string }) =>
  httpPost<{ resetLink: string }>("/adminResetPassword", data);

export const adminCreateUser = (data: { email: string; password: string; displayName?: string; role?: "user" | "admin" }) =>
  httpPost<AdminUser>("/adminCreateUser", data);

export const adminGetUserDetail = (uid: string) =>
  httpGet<{ assistants: Assistant[]; recentCalls: AdminCallSession[]; plan?: string; stripeCustomerId?: string; stripeStatus?: string }>(`/adminGetUserDetail?uid=${encodeURIComponent(uid)}`);

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
  httpPost<{ chunksCreated: number; url: string }>("/knowledgeProcessUrl", data);

export const knowledgeSync = (data: { assistantId: string; url: string }) =>
  httpPost<{ chunksCreated: number; url: string }>("/knowledgeSync", data);

export const knowledgeProcessText = (data: { assistantId: string; text: string; title?: string }) =>
  httpPost<{ chunksCreated: number; title: string }>("/knowledgeProcessText", data);

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

export const scenariosGet = (id: string) =>
  httpGet<ScenarioDoc>(`/scenariosGet?id=${encodeURIComponent(id)}`);

export const scenariosUpdate = (data: Partial<ScenarioInput> & { id: string }) =>
  httpPost<ScenarioDoc>("/scenariosUpdate", data);

export const scenariosDelete = (id: string) =>
  httpPost<{ status: string }>("/scenariosDelete", { id });

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
}

export interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  country?: string;
  monthlyPrice?: string;
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
  role: "admin" | "user";
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
  assistants: number;
  minutesPerMonth: number;
  leads: number;
  campaigns: number;
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
