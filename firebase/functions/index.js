const {initializeApp} = require("firebase-admin/app");
initializeApp();

const createAgent = require("./create_agent.js");
exports.createAgent = createAgent.createAgent;
const stripeCustomerSubscription = require("./stripe_customer_subscription.js");
exports.stripeCustomerSubscription =
  stripeCustomerSubscription.stripeCustomerSubscription;
const sendMailToCustomer = require("./send_mail_to_customer.js");
exports.sendMailToCustomer = sendMailToCustomer.sendMailToCustomer;
const vapiWebhook = require("./vapi_webhook.js");
exports.vapiWebhook = vapiWebhook.vapiWebhook;
const createJob = require("./create_job.js");
exports.createJob = createJob.createJob;
const voiceService = require("./voice_service.js");
exports.assistantsCreate = voiceService.assistantsCreate;
exports.assistantsUpdate = voiceService.assistantsUpdate;
exports.assistantsDelete = voiceService.assistantsDelete;
exports.assistantsList = voiceService.assistantsList;
exports.assistantsGet = voiceService.assistantsGet;
exports.searchPhoneNumbers = voiceService.searchPhoneNumbers;
exports.purchasePhoneNumber = voiceService.purchasePhoneNumber;
exports.configurePhoneNumber = voiceService.configurePhoneNumber;
exports.releasePhoneNumber = voiceService.releasePhoneNumber;
exports.placeCall = voiceService.placeCall;
exports.twilioVoiceWebhook = voiceService.twilioVoiceWebhook;
exports.twilioGatherCallback = voiceService.twilioGatherCallback;
exports.twilioStatusCallback = voiceService.twilioStatusCallback;
const twilioMediaStream = require("./twilio_media_stream.js");
exports.twilioMediaStream = twilioMediaStream.twilioMediaStream;
exports.scenarioFlowExecute = voiceService.scenarioFlowExecute;
exports.scenarioFlowCallback = voiceService.scenarioFlowCallback;
exports.scenarioRecordingCallback = voiceService.scenarioRecordingCallback;
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
exports.scenariosNodeTypes = scenarioService.scenariosNodeTypes;

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