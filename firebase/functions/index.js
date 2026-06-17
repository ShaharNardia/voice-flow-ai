const {initializeApp} = require("firebase-admin/app");
initializeApp();

const createAgent = require("./create_agent.js");
exports.createAgent = createAgent.createAgent;
const stripeCustomerSubscription = require("./stripe_customer_subscription.js");
exports.stripeCustomerSubscription =
  stripeCustomerSubscription.stripeCustomerSubscription;
const sendMailToCustomer = require("./send_mail_to_customer.js");
exports.sendMailToCustomer = sendMailToCustomer.sendMailToCustomer;
const whatsappService = require("./whatsapp_service.js");
exports.sendWhatsApp = whatsappService.sendWhatsApp;
const vapiWebhook = require("./vapi_webhook.js");
exports.vapiWebhook = vapiWebhook.vapiWebhook;

// NLPearl integration — DEPRECATED. All NLPearl assistants are auto-migrated
// to Gemini Live. The cloud functions and frontend page are unexported; the
// service file remains on disk only as a rollback escape hatch.
// To complete removal: delete nlpearl_service.js, saas-frontend/.../(dashboard)/nlpearl/,
// and the legacy NLPearlConfig React component in assistants/edit/page.tsx.

// Migration job — run once. Rewrites every assistant doc with
// voiceProvider === "nlpearl" to voiceProvider === "gemini-live" and removes
// the NLPearl-specific fields. Idempotent: re-running is a no-op once all
// docs are migrated.
const nlpearlMigration = require("./nlpearl_migration.js");
exports.migrateNlpearlToGemini = nlpearlMigration.migrateNlpearlToGemini;

// SIP setup wizard backend — admin-only helpers for /admin/sip-setup.
const sipSetup = require("./sip_setup_service.js");
exports.sipSetupCheckBridge = sipSetup.sipSetupCheckBridge;
exports.sipSetupGetConfig   = sipSetup.sipSetupGetConfig;
exports.sipSetupVerify      = sipSetup.sipSetupVerify;

// System policies — admin-editable Gemini Live behavior rules
const sysPolicies = require("./system_policies_service.js");
exports.getSystemPolicies       = sysPolicies.getSystemPolicies;
exports.updateSystemPolicies    = sysPolicies.updateSystemPolicies;
exports.getSystemPoliciesPublic = sysPolicies.getSystemPoliciesPublic;

// Per-call technical diagnostics — Cloud Run logs parsed into a timeline.
const callDiagnostics = require("./call_diagnostics_service.js");
exports.getCallDiagnostics = callDiagnostics.getCallDiagnostics;

// Admin secrets — list + rotate Firebase/GCP secrets from /admin/api-keys
const adminSecrets = require("./admin_secrets_service.js");
exports.adminListSecrets   = adminSecrets.adminListSecrets;
exports.adminRotateSecret  = adminSecrets.adminRotateSecret;

// Admin health — parallel integration health check for /admin/health
const adminHealth = require("./admin_health_service.js");
exports.adminHealthCheck = adminHealth.adminHealthCheck;

// Admin logs — Cloud Run/Functions log query for /admin/logs
const adminLogs = require("./admin_logs_service.js");
exports.adminLogsQuery = adminLogs.adminLogsQuery;

// Tool library — admin-defined HTTP tools any assistant can opt into
const toolLibrary = require("./tool_library_service.js");
exports.toolLibraryList   = toolLibrary.toolLibraryList;
exports.toolLibraryCreate = toolLibrary.toolLibraryCreate;
exports.toolLibraryUpdate = toolLibrary.toolLibraryUpdate;
exports.toolLibraryDelete = toolLibrary.toolLibraryDelete;
exports.toolLibraryTest   = toolLibrary.toolLibraryTest;

// ElevenLabs voice cloning — customer-uploadable cloned voices for cascade-mode TTS.
const elevenClone = require("./elevenlabs_voice_clone_service.js");
exports.elevenlabsCloneVoice    = elevenClone.elevenlabsCloneVoice;
exports.elevenlabsListVoices    = elevenClone.elevenlabsListVoices;
exports.elevenlabsDeleteVoice   = elevenClone.elevenlabsDeleteVoice;
exports.elevenlabsPreviewVoice  = elevenClone.elevenlabsPreviewVoice;

// Prompt Coach — AI chatbot for improving assistant system prompts
const promptCoachService = require("./prompt_coach_service.js");
exports.promptCoachChat   = promptCoachService.promptCoachChat;
exports.saveTurnFeedback  = promptCoachService.saveTurnFeedback;

// Bench service — Phase 1 STT/TTS validation harness
const benchService = require("./bench_service.js");
exports.benchSttRun         = benchService.benchSttRun;
exports.benchTtsGenerate    = benchService.benchTtsGenerate;
exports.benchScore          = benchService.benchScore;
exports.benchUploadUrl      = benchService.benchUploadUrl;
exports.benchListRuns       = benchService.benchListRuns;
exports.benchListRatings    = benchService.benchListRatings;
const createJob = require("./create_job.js");
exports.createJob = createJob.createJob;
const voiceService = require("./voice_service.js");
exports.assistantsCreate = voiceService.assistantsCreate;
exports.assistantsUpdate = voiceService.assistantsUpdate;
exports.assistantsDelete = voiceService.assistantsDelete;
exports.assistantsDuplicate = voiceService.assistantsDuplicate;
exports.assistantsList = voiceService.assistantsList;
exports.assistantsGet = voiceService.assistantsGet;
// FIX (Issue 3 — Test Chat "Failed to Fetch"):
// assistantTestChat was exported from voice_service.js but was NEVER registered
// here in index.js.  Firebase Functions only deploys functions that appear in
// this file; without this line the endpoint did not exist and every call from
// the "Test the Bot" UI returned "Failed to fetch" (DNS / 404-level failure).
exports.assistantTestChat = voiceService.assistantTestChat;
exports.searchPhoneNumbers = voiceService.searchPhoneNumbers;
exports.purchasePhoneNumber = voiceService.purchasePhoneNumber;
exports.configurePhoneNumber = voiceService.configurePhoneNumber;
exports.assignPhoneNumber = voiceService.assignPhoneNumber;
exports.releasePhoneNumber = voiceService.releasePhoneNumber;
exports.listPhoneNumbers = voiceService.listPhoneNumbers;
exports.voximplantConfigGet = voiceService.voximplantConfigGet;
exports.voximplantConfigSet = voiceService.voximplantConfigSet;
exports.placeCall = voiceService.placeCall;
exports.twilioVoiceWebhook = voiceService.twilioVoiceWebhook;
exports.twilioGatherCallback = voiceService.twilioGatherCallback;
exports.twilioStatusCallback = voiceService.twilioStatusCallback;
exports.twilioRecordingCallback = voiceService.twilioRecordingCallback;
exports.getRecording = voiceService.getRecording;

// VoxImplant webhook — called by the VoxImplant scenario on call events
const voximplantService = require("./voximplant_service.js");
exports.voxImplantWebhook = require("firebase-functions/v2/https").onRequest(
  { memory: "256MiB", region: "us-central1" },
  (req, res) => voximplantService.handleWebhook(req, res)
);
const twilioMediaStream = require("./twilio_media_stream.js");
exports.twilioMediaStream = twilioMediaStream.twilioMediaStream;
exports.scenarioFlowExecute = voiceService.scenarioFlowExecute;
exports.scenarioFlowCallback = voiceService.scenarioFlowCallback;
exports.scenarioRecordingCallback = voiceService.scenarioRecordingCallback;
exports.twilioFeedbackWebhook = voiceService.twilioFeedbackWebhook;
exports.twilioFeedbackGather = voiceService.twilioFeedbackGather;
exports.cleanupStaleSessions = voiceService.cleanupStaleSessions;
const assignAssistant = require("./assign_assistant.js");
exports.assignAssistant = assignAssistant.assignAssistant;
const createReservation = require("./create_reservation.js");
exports.createReservation = createReservation.createReservation;
const endOfCallLog = require("./end_of_call_log.js");
exports.endOfCallLog = endOfCallLog.endOfCallLog;
const getLeadDetails = require("./get_leads.js");
exports.getLeadDetails = getLeadDetails.getLeadDetails;
const getPhoneNumberFromJob = require("./get_phone_number_from_job.js");
exports.getPhoneNumberFromJob = getPhoneNumberFromJob.getPhoneNumberFromJob;
const outboundLeadTest = require("./outbound_lead_test.js");
exports.outboundLeadTest = outboundLeadTest.outboundLeadTest;
const transferCall = require("./transfer_call.js");
exports.transferCall = transferCall.transferCall;
const setUserSubscription = require("./set_user_subscription.js");
exports.setUserSubscription = setUserSubscription.setUserSubscription;
exports.bootstrapAdminUser = setUserSubscription.bootstrapAdminUser;
const ttsService = require("./tts_service.js");
exports.listTtsVoices = ttsService.listTtsVoices;
exports.synthesizeTts = ttsService.synthesizeTts;

// Scenario Service - Visual Call Flow Builder
const scenarioService = require("./scenario_service.js");
exports.scenariosCreate = scenarioService.scenariosCreate;
exports.scenariosUpdate = scenarioService.scenariosUpdate;
exports.scenariosGet = scenarioService.scenariosGet;
exports.scenariosList = scenarioService.scenariosList;
exports.scenariosDelete = scenarioService.scenariosDelete;
exports.scenariosDuplicate = scenarioService.scenariosDuplicate;
exports.scenariosNodeTypes    = scenarioService.scenariosNodeTypes;
exports.scenarioWizardChat    = scenarioService.scenarioWizardChat;
exports.scenarioWizardGenerate = scenarioService.scenarioWizardGenerate;

// Scenario AI Service - AI-powered scenario generation
const scenarioAiService = require("./scenario_ai_service.js");
exports.scenarioAiGenerate = scenarioAiService.generateScenario;
exports.scenarioAiSuggest = scenarioAiService.suggestImprovements;

// Setup Israeli Phone Number
const setupIsraeliPhone = require("./setup_israeli_phone_function.js");
exports.setupIsraeliPhone = setupIsraeliPhone.setupIsraeliPhone;
exports.setupIsraeliPhoneHttp = setupIsraeliPhone.setupIsraeliPhoneHttp;

// Health Check & Monitoring
const healthCheck = require("./health_check.js");
exports.healthCheck = healthCheck.healthCheck;
exports.getIntegrationStatus = healthCheck.getIntegrationStatus;

// Knowledge Base Service
const knowledgeService = require("./knowledge_service.js");
exports.knowledgeProcessFile = knowledgeService.knowledgeProcessFile;
exports.knowledgeListFiles   = knowledgeService.knowledgeListFiles;
exports.knowledgeCrawlReport = knowledgeService.knowledgeCrawlReport;
exports.knowledgeDeleteFile  = knowledgeService.knowledgeDeleteFile;
exports.knowledgeProcessText = knowledgeService.knowledgeProcessText;
exports.knowledgeProcessUrl  = knowledgeService.knowledgeProcessUrl;
exports.knowledgeSync        = knowledgeService.knowledgeSync;

// Language Tutor Service has moved to the coach-app repo (coach codebase).
// These endpoints are now served at coach.lancelotech.com.

// Leads & Campaigns CRM Service
const leadsService = require("./leads_service.js");
exports.leadsBatchCreate = leadsService.leadsBatchCreate;
exports.leadsUpdate      = leadsService.leadsUpdate;
exports.leadsDelete      = leadsService.leadsDelete;
exports.campaignsCreate  = leadsService.campaignsCreate;
exports.campaignsList    = leadsService.campaignsList;
exports.campaignStart    = leadsService.campaignStart;
exports.campaignPause    = leadsService.campaignPause;
exports.appointmentsList = leadsService.appointmentsList;

// Admin Service
const adminService = require("./admin_service.js");
exports.adminListUsers = adminService.adminListUsers;
exports.adminToggleUser = adminService.adminToggleUser;
exports.adminDeleteUser = adminService.adminDeleteUser;
exports.adminSetRole = adminService.adminSetRole;
exports.adminResetPassword = adminService.adminResetPassword;
exports.adminCreateUser = adminService.adminCreateUser;
exports.adminGetUserDetail = adminService.adminGetUserDetail;
exports.bootstrapSuperAdmin = adminService.bootstrapSuperAdmin;
exports.adminGetCallTelemetry  = adminService.adminGetCallTelemetry;
exports.adminListCallTelemetry = adminService.adminListCallTelemetry;

// Features Service — per-role defaults + per-user overrides (super_admin only)
const featuresService = require("./features_service.js");
exports.adminGetFeatureConfig = featuresService.adminGetFeatureConfig;
exports.adminSetFeatureConfig = featuresService.adminSetFeatureConfig;
exports.adminSetUserFeatures  = featuresService.adminSetUserFeatures;

// Appointments Service — booking via assistant tool or manual create.
// Exports as bookings* to avoid name collision with the pre-existing
// leads_service.appointmentsList (which is a different legacy view).
const appointmentsService = require("./appointments_service.js");
exports.bookingsCreate = appointmentsService.bookingsCreate;
exports.bookingsList   = appointmentsService.bookingsList;
exports.bookingsCancel = appointmentsService.bookingsCancel;

// Reminders Service — scheduled cron firing invite + reminder emails
const remindersService = require("./reminders_service.js");
exports.dispatchReminders = remindersService.dispatchReminders;

// Assistant Wizard — chat-based assistant builder
const assistantWizardService = require("./assistant_wizard_service.js");
exports.wizardChat = assistantWizardService.wizardChat;

// Wizard Voice — STT + TTS bridge for voice-based wizard
const wizardVoiceService = require("./wizard_voice_service.js");
exports.wizardSTT = wizardVoiceService.wizardSTT;
exports.wizardTTS = wizardVoiceService.wizardTTS;

// Analysis Service
const analysisService = require("./analysis_service.js");
exports.analyzeCall = analysisService.analyzeCall;

// Subscription Service — Plan management + Stripe Checkout
const subscriptionService = require("./subscription_service.js");
exports.createCheckoutSession      = subscriptionService.createCheckoutSession;
exports.createBillingPortalSession = subscriptionService.createBillingPortalSession;
exports.getUserPlan                = subscriptionService.getUserPlan;

// Admin Phone Service — cross-user phone number management + integration health
const adminPhoneService = require("./admin_phone_service.js");
exports.adminListAllPhoneNumbers = adminPhoneService.adminListAllPhoneNumbers;
exports.adminReleasePhoneNumber  = adminPhoneService.adminReleasePhoneNumber;
exports.adminReassignPhoneNumber = adminPhoneService.adminReassignPhoneNumber;
exports.adminCheckIntegrations   = adminPhoneService.adminCheckIntegrations;

// Admin Settings Service — plan config, subscriptions, API key metadata, system settings
const adminSettingsService = require("./admin_settings_service.js");
exports.adminGetSubscriptions      = adminSettingsService.adminGetSubscriptions;
exports.adminOverridePlan          = adminSettingsService.adminOverridePlan;
exports.adminGetPlanConfig         = adminSettingsService.adminGetPlanConfig;
exports.adminUpdatePlanConfig      = adminSettingsService.adminUpdatePlanConfig;
exports.adminGetSystemSettings     = adminSettingsService.adminGetSystemSettings;
exports.adminUpdateSystemSettings  = adminSettingsService.adminUpdateSystemSettings;
exports.adminGetKeysMeta           = adminSettingsService.adminGetKeysMeta;
exports.adminUpdateKeyMeta         = adminSettingsService.adminUpdateKeyMeta;
exports.adminGetBillingConfig      = adminSettingsService.adminGetBillingConfig;
exports.adminUpdateBillingConfig   = adminSettingsService.adminUpdateBillingConfig;
exports.adminGetPronunciation      = adminSettingsService.adminGetPronunciation;
exports.adminUpdatePronunciation   = adminSettingsService.adminUpdatePronunciation;
exports.getPronunciationFixes      = adminSettingsService.getPronunciationFixes;
exports.adminGetRateCard           = adminSettingsService.adminGetRateCard;
exports.adminUpdateRateCard        = adminSettingsService.adminUpdateRateCard;
exports.adminGetCustomerPricing    = adminSettingsService.adminGetCustomerPricing;
exports.adminUpdateCustomerPricing = adminSettingsService.adminUpdateCustomerPricing;
exports.adminGetCostDashboard      = adminSettingsService.adminGetCostDashboard;
exports.getCostConfig              = adminSettingsService.getCostConfig;

// Audit Service
const auditService = require("./audit_service.js");
exports.adminGetActivityLog = auditService.adminGetActivityLog;

// SIP Trunk Service — per-user SIP trunk management (Register + Peer types)
const sipTrunkService = require("./sip_trunk_service.js");
exports.sipTrunkCreate       = sipTrunkService.sipTrunkCreate;
exports.sipTrunkUpdate       = sipTrunkService.sipTrunkUpdate;
exports.sipTrunkDelete       = sipTrunkService.sipTrunkDelete;
exports.sipTrunkList         = sipTrunkService.sipTrunkList;
exports.sipTrunkTest         = sipTrunkService.sipTrunkTest;
exports.sipTrunkHealthCheck  = sipTrunkService.sipTrunkHealthCheck;
exports.sipBridgeConfigGet   = sipTrunkService.sipBridgeConfigGet;
exports.sipBridgeConfigSave  = sipTrunkService.sipBridgeConfigSave;
exports.sipInboundCall       = sipTrunkService.sipInboundCall;
exports.sipTraceSave         = sipTrunkService.sipTraceSave;
exports.sipTracesList        = sipTrunkService.sipTracesList;
exports.sipTraceDownload     = sipTrunkService.sipTraceDownload;

// Compliance Service — TCPA/GDPR/HIPAA compliance engine, DNC registry, consent tracking
const complianceService = require("./compliance_service.js");
exports.complianceCheckCall      = complianceService.complianceCheckCall;
exports.complianceDncAdd         = complianceService.complianceDncAdd;
exports.complianceDncRemove      = complianceService.complianceDncRemove;
exports.complianceDncList        = complianceService.complianceDncList;
exports.complianceDncBulkAdd     = complianceService.complianceDncBulkAdd;
exports.complianceConsentRecord  = complianceService.complianceConsentRecord;
exports.complianceConsentList    = complianceService.complianceConsentList;
exports.complianceConsentRevoke  = complianceService.complianceConsentRevoke;
exports.complianceLogViolation   = complianceService.complianceLogViolation;
exports.complianceGetReport      = complianceService.complianceGetReport;
exports.complianceDashboard      = complianceService.complianceDashboard;

// Verbal Contract Service — verbal agreement capture with SHA-256 tamper-proof hashing
const verbalContractService = require("./verbal_contract_service.js");
exports.contractTemplateCreate = verbalContractService.contractTemplateCreate;
exports.contractTemplateUpdate = verbalContractService.contractTemplateUpdate;
exports.contractTemplateList   = verbalContractService.contractTemplateList;
exports.contractTemplateDelete = verbalContractService.contractTemplateDelete;
exports.contractCreate         = verbalContractService.contractCreate;
exports.contractList           = verbalContractService.contractList;
exports.contractGet            = verbalContractService.contractGet;
exports.contractVoid           = verbalContractService.contractVoid;

// Voice Commerce Service — product catalog + Stripe payment links + order management
const voiceCommerceService = require("./voice_commerce_service.js");
exports.voiceProductCreate          = voiceCommerceService.voiceProductCreate;
exports.voiceProductUpdate          = voiceCommerceService.voiceProductUpdate;
exports.voiceProductList            = voiceCommerceService.voiceProductList;
exports.voiceProductDelete          = voiceCommerceService.voiceProductDelete;
exports.voiceProductSearch          = voiceCommerceService.voiceProductSearch;
exports.voiceCreatePaymentLink      = voiceCommerceService.voiceCreatePaymentLink;
exports.voiceOrderCreate            = voiceCommerceService.voiceOrderCreate;
exports.voiceOrderList              = voiceCommerceService.voiceOrderList;
exports.voiceOrderGet               = voiceCommerceService.voiceOrderGet;
exports.voiceOrderUpdateStatus      = voiceCommerceService.voiceOrderUpdateStatus;
exports.voiceCommerceStripeWebhook  = voiceCommerceService.voiceCommerceStripeWebhook;

// Agent Registry Service — agent-to-agent network: registration, discovery, secure inter-agent calls
const agentRegistryService = require("./agent_registry_service.js");
exports.agentRegister    = agentRegistryService.agentRegister;
exports.agentUpdate      = agentRegistryService.agentUpdate;
exports.agentUnregister  = agentRegistryService.agentUnregister;
exports.agentDirectory   = agentRegistryService.agentDirectory;
exports.agentSearch      = agentRegistryService.agentSearch;
exports.agentMyListings  = agentRegistryService.agentMyListings;
exports.agentCallOut     = agentRegistryService.agentCallOut;
exports.agentHandshake   = agentRegistryService.agentHandshake;
exports.agentRotateKey   = agentRegistryService.agentRotateKey;

// El Al Airlines — AirLabs API wrapper + demo assistant seeder
const elalService = require("./elal_service.js");
exports.elAlFlightStatus    = elalService.elAlFlightStatus;
exports.elAlSchedule        = elalService.elAlSchedule;
exports.elAlDelays          = elalService.elAlDelays;
exports.elAlRoutes          = elalService.elAlRoutes;
exports.elAlAirportInfo     = elalService.elAlAirportInfo;
exports.elAlLookupCode      = elalService.elAlLookupCode;
exports.elAlSeedAssistant   = elalService.elAlSeedAssistant;

// Bridge Deploy — serves the sip-bridge deploy script (temporary, delete after use)
const bridgeDeployService = require('./bridge_deploy.js');
exports.bridgeDeploy = bridgeDeployService.bridgeDeploy;
