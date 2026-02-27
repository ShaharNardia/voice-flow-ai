/**
 * Scenario Engine - Flow Execution Engine for Call Scenarios
 * Processes scenario nodes and generates TwiML responses
 */

const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");
const axios = require("axios");

const REGION = "us-central1";
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

// Default voices by language (Google Cloud TTS via Twilio)
// Neural2 > WaveNet > Standard in quality. Hebrew male voices: B, D
const DEFAULT_VOICES = {
  "he": "Google.he-IL-Neural2-D",
  "he-IL": "Google.he-IL-Neural2-D",
  "en": "Polly.Joanna",
  "en-US": "Polly.Joanna",
  "en-GB": "Polly.Amy",
  "ar": "Google.ar-XA-Wavenet-A",
  "ar-XA": "Google.ar-XA-Wavenet-A",
};

// Default Hebrew voice (male Neural2-D - higher quality than WaveNet)
const DEFAULT_HEBREW_VOICE = "Google.he-IL-Neural2-D";
// Default English voice (for backward compatibility)
const DEFAULT_ENGLISH_VOICE = "Polly.Joanna";

/**
 * Resolve the best TTS voice for the given language.
 *
 * Twilio <Say> only supports Polly.* and Google.* voice IDs.
 * Any other voice (OpenAI, ElevenLabs, Deepgram, etc.) is swapped to the
 * best Twilio-compatible voice for the target language.
 * For Hebrew → Google.he-IL-Wavenet-A (highest quality Hebrew TTS).
 *
 * @param {string} voiceId - The voice ID from the assistant definition
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "ar")
 * @returns {string} Twilio-compatible voice ID
 */
function resolveVoiceForLanguage(voiceId, language) {
  if (!language) {
    language = "he-IL"; // Default to Hebrew
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
    // For other languages, if it's a valid Twilio voice, keep it
    if (!lang.startsWith("he") && !lang.startsWith("en") && !lang.startsWith("ar")) {
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

/**
 * Replace {{placeholder}} tokens with actual values from context
 */
function replacePlaceholders(text, context) {
  if (!text || typeof text !== "string") return text || "";

  let result = text;
  const placeholders = {
    leadName: context.leadName || context.lead?.name || "valued customer",
    clientName: context.leadName || context.lead?.name || "valued customer",
    assistantName: context.assistantName || "your assistant",
    companyName: context.companyName || "our company",
    leadPhone: context.leadPhone || context.lead?.phone || "",
    currentTime: new Date().toLocaleTimeString(),
    currentDate: new Date().toLocaleDateString(),
  };

  // Add custom variables from context
  if (context.variables) {
    Object.assign(placeholders, context.variables);
  }

  // Replace all placeholders
  Object.entries(placeholders).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
    result = result.replace(regex, value || "");
  });

  return result;
}

/**
 * Find next node(s) based on edges
 */
function findNextNodes(scenario, currentNodeId, condition = null) {
  const edges = scenario.edges || [];
  
  return edges
    .filter((edge) => {
      if (edge.source !== currentNodeId) return false;
      if (condition && edge.condition && edge.condition !== condition) return false;
      if (!condition && edge.condition) return false; // Skip conditional edges when no condition
      return true;
    })
    .map((edge) => {
      const node = scenario.nodes.find((n) => n.id === edge.target);
      return {edge, node};
    })
    .filter((item) => item.node);
}

/**
 * Find the default next node (edge without condition or with 'default' condition)
 */
function findDefaultNextNode(scenario, currentNodeId) {
  const edges = scenario.edges || [];
  
  const defaultEdge = edges.find((edge) => 
    edge.source === currentNodeId && 
    (!edge.condition || edge.condition === "default" || edge.condition === "")
  );

  if (!defaultEdge) return null;
  
  return scenario.nodes.find((n) => n.id === defaultEdge.target);
}

/**
 * Node Processor: Start
 */
function processStartNode(node, context, scenario) {
  // Start node just moves to the next node
  const nextNode = findDefaultNextNode(scenario, node.id);
  return {
    nextNodeId: nextNode?.id || null,
    twiml: null, // No TwiML for start node
  };
}

/**
 * Node Processor: Say
 */
function processSayNode(node, context, scenario, twimlResponse) {
  const data = node.data || {};
  const text = replacePlaceholders(data.text || "", context);
  const language = data.language || context.defaultLanguage || "he-IL";
  const voice = resolveVoiceForLanguage(data.voice || context.defaultVoice, language);

  if (text) {
    twimlResponse.say({voice, language}, text);
  }

  const nextNode = findDefaultNextNode(scenario, node.id);
  return {
    nextNodeId: nextNode?.id || null,
    continueProcessing: true, // Can process next node immediately
  };
}

/**
 * Node Processor: Gather
 */
function processGatherNode(node, context, scenario, twimlResponse, callSessionId) {
  const data = node.data || {};
  const prompt = replacePlaceholders(data.prompt || "", context);
  const language = data.language || context.defaultLanguage || "he-IL";
  const voice = resolveVoiceForLanguage(data.voice || context.defaultVoice, language);
  const timeout = data.timeout || 5;
  const inputType = data.inputType || "speech";

  // Create gather with callback to our flow handler
  const gatherOptions = {
    action: `${BASE_FUNCTION_URL}/scenarioFlowCallback?callSessionId=${callSessionId}&nodeId=${node.id}`,
    method: "POST",
    timeout: timeout,
  };

  if (inputType === "speech" || inputType === "both") {
    gatherOptions.input = inputType === "both" ? "speech dtmf" : "speech";
    gatherOptions.speechTimeout = data.speechTimeout || "auto";
    gatherOptions.language = language;
  } else if (inputType === "dtmf") {
    gatherOptions.input = "dtmf";
    if (data.numDigits) {
      gatherOptions.numDigits = data.numDigits;
    }
  }

  const gather = twimlResponse.gather(gatherOptions);

  if (prompt) {
    gather.say({voice, language}, prompt);
  }

  // If no input received, go to timeout path
  const timeoutNode = findNextNodes(scenario, node.id, "timeout")[0]?.node;
  const defaultNode = findDefaultNextNode(scenario, node.id);
  const fallbackNode = timeoutNode || defaultNode;

  if (fallbackNode) {
    const fallbackText = data.timeoutMessage || "I didn't hear a response.";
    twimlResponse.say({voice, language}, replacePlaceholders(fallbackText, context));
    twimlResponse.redirect(
      `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${callSessionId}&nodeId=${fallbackNode.id}`
    );
  } else {
    twimlResponse.say({voice, language: "he-IL"}, "תודה על הזמן. להתראות.");
    twimlResponse.hangup();
  }

  return {
    nextNodeId: null, // Wait for callback
    continueProcessing: false,
  };
}

/**
 * Node Processor: Condition
 */
function processConditionNode(node, context, scenario) {
  const data = node.data || {};
  const conditionType = data.conditionType || "keywords";
  let matchedCondition = null;

  if (conditionType === "keywords") {
    // Check speech result against keywords
    const speechResult = (context.speechResult || "").toLowerCase().trim();
    const branches = data.branches || [];
    
    for (const branch of branches) {
      const keywords = (branch.keywords || []).map((k) => k.toLowerCase());
      if (keywords.some((kw) => speechResult.includes(kw))) {
        matchedCondition = branch.id || branch.name;
        break;
      }
    }
    
    // Check for built-in positive/negative
    if (!matchedCondition) {
      const positiveKeywords = ["yes", "yeah", "sure", "ok", "okay", "interested", "כן", "בטח"];
      const negativeKeywords = ["no", "nope", "not", "busy", "later", "לא", "עסוק"];
      
      if (positiveKeywords.some((kw) => speechResult.includes(kw))) {
        matchedCondition = "positive";
      } else if (negativeKeywords.some((kw) => speechResult.includes(kw))) {
        matchedCondition = "negative";
      }
    }
  } else if (conditionType === "variable") {
    // Check variable value
    const varName = data.variable;
    const operator = data.operator || "equals";
    const compareValue = data.value;
    const actualValue = context.variables?.[varName];

    switch (operator) {
      case "equals":
        matchedCondition = actualValue == compareValue ? "true" : "false";
        break;
      case "notEquals":
        matchedCondition = actualValue != compareValue ? "true" : "false";
        break;
      case "contains":
        matchedCondition = String(actualValue).includes(compareValue) ? "true" : "false";
        break;
      case "greaterThan":
        matchedCondition = Number(actualValue) > Number(compareValue) ? "true" : "false";
        break;
      case "lessThan":
        matchedCondition = Number(actualValue) < Number(compareValue) ? "true" : "false";
        break;
      default:
        matchedCondition = "default";
    }
  }

  // Find next node based on condition
  let nextNodes = findNextNodes(scenario, node.id, matchedCondition);
  if (nextNodes.length === 0) {
    // Fall back to default
    const defaultNode = findDefaultNextNode(scenario, node.id);
    if (defaultNode) {
      nextNodes = [{node: defaultNode}];
    }
  }

  return {
    nextNodeId: nextNodes[0]?.node?.id || null,
    matchedCondition,
  };
}

/**
 * Node Processor: Set Variable
 */
function processSetVariableNode(node, context, scenario) {
  const data = node.data || {};
  const varName = data.variableName;
  const value = replacePlaceholders(data.value || "", context);

  if (varName) {
    context.variables = context.variables || {};
    
    // Type conversion
    if (data.valueType === "number") {
      context.variables[varName] = Number(value);
    } else if (data.valueType === "boolean") {
      context.variables[varName] = value.toLowerCase() === "true";
    } else {
      context.variables[varName] = value;
    }
  }

  const nextNode = findDefaultNextNode(scenario, node.id);
  return {
    nextNodeId: nextNode?.id || null,
    continueProcessing: true,
    updatedVariables: context.variables,
  };
}

/**
 * Node Processor: API Call
 */
async function processApiCallNode(node, context, scenario, twimlResponse) {
  const data = node.data || {};
  const url = replacePlaceholders(data.url || "", context);
  const method = (data.method || "POST").toUpperCase();
  
  let successNode = findNextNodes(scenario, node.id, "success")[0]?.node;
  let errorNode = findNextNodes(scenario, node.id, "error")[0]?.node;
  const defaultNode = findDefaultNextNode(scenario, node.id);

  if (!successNode) successNode = defaultNode;
  if (!errorNode) errorNode = defaultNode;

  try {
    // Prepare headers
    const headers = {...(data.headers || {})};
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Prepare body
    let body = data.body;
    if (typeof body === "string") {
      body = replacePlaceholders(body, context);
      try {
        body = JSON.parse(body);
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }

    // Make the API call
    const response = await axios({
      method,
      url,
      headers,
      data: body,
      timeout: 10000,
    });

    // Save response to variable if specified
    if (data.saveResponseTo) {
      context.variables = context.variables || {};
      context.variables[data.saveResponseTo] = response.data;
    }

    return {
      nextNodeId: successNode?.id || null,
      continueProcessing: true,
      updatedVariables: context.variables,
      apiResult: {success: true, data: response.data},
    };
  } catch (error) {
    logger.error("API call failed in scenario", {error: error.message, url});
    
    if (data.saveResponseTo) {
      context.variables = context.variables || {};
      context.variables[`${data.saveResponseTo}_error`] = error.message;
    }

    return {
      nextNodeId: errorNode?.id || null,
      continueProcessing: true,
      updatedVariables: context.variables,
      apiResult: {success: false, error: error.message},
    };
  }
}

/**
 * Node Processor: Transfer
 */
function processTransferNode(node, context, scenario, twimlResponse) {
  const data = node.data || {};
  const destination = replacePlaceholders(data.destination || "", context);
  const announcement = replacePlaceholders(data.announcement || "", context);
  const language = data.language || context.defaultLanguage || "he-IL";
  const voice = resolveVoiceForLanguage(data.voice || context.defaultVoice, language);
  const timeout = data.timeout || 30;

  if (announcement) {
    twimlResponse.say({voice, language}, announcement);
  }

  const dial = twimlResponse.dial({
    timeout,
    callerId: context.companyPhone || context.callerId,
  });

  if (data.destinationType === "sip") {
    dial.sip(destination);
  } else {
    dial.number(destination);
  }

  return {
    nextNodeId: null, // Transfer ends our handling
    continueProcessing: false,
  };
}

/**
 * Node Processor: Record
 */
function processRecordNode(node, context, scenario, twimlResponse, callSessionId) {
  const data = node.data || {};
  const action = data.action || "start";
  const language = context.defaultLanguage || "he-IL";
  const voice = resolveVoiceForLanguage(context.defaultVoice, language);

  if (action === "start") {
    const nextNode = findDefaultNextNode(scenario, node.id);
    
    twimlResponse.record({
      maxLength: data.maxLength || 300,
      playBeep: data.playBeep !== false,
      transcribe: data.transcribe || false,
      action: `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${callSessionId}&nodeId=${nextNode?.id || ""}`,
      recordingStatusCallback: `${BASE_FUNCTION_URL}/scenarioRecordingCallback?callSessionId=${callSessionId}`,
    });

    return {
      nextNodeId: null,
      continueProcessing: false,
    };
  }

  // For stop, just continue to next node
  const nextNode = findDefaultNextNode(scenario, node.id);
  return {
    nextNodeId: nextNode?.id || null,
    continueProcessing: true,
  };
}

/**
 * Node Processor: Wait
 */
function processWaitNode(node, context, scenario, twimlResponse) {
  const data = node.data || {};
  const duration = data.duration || 1;

  twimlResponse.pause({length: duration});

  const nextNode = findDefaultNextNode(scenario, node.id);
  return {
    nextNodeId: nextNode?.id || null,
    continueProcessing: true,
  };
}

/**
 * Node Processor: Schedule Callback
 */
async function processScheduleCallbackNode(node, context, scenario) {
  const data = node.data || {};
  const delay = data.delay || 3600; // Default 1 hour
  const priority = data.priority || "normal";
  const message = replacePlaceholders(data.message || "", context);

  const db = getFirestore();
  const callbackTime = new Date(Date.now() + delay * 1000);

  // Create a scheduled callback record
  await db.collection("scheduled_callbacks").add({
    leadId: context.leadId,
    leadPhone: context.leadPhone,
    companyId: context.companyId,
    scenarioId: context.scenarioId,
    scheduledFor: callbackTime,
    priority,
    message,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  const nextNode = findDefaultNextNode(scenario, node.id);
  return {
    nextNodeId: nextNode?.id || null,
    continueProcessing: true,
  };
}

/**
 * Node Processor: Update Lead
 */
async function processUpdateLeadNode(node, context, scenario) {
  const data = node.data || {};
  const leadId = context.leadId;

  if (leadId) {
    const db = getFirestore();
    const updates = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (data.status) {
      updates.callStatus = data.status;
    }
    if (data.notes) {
      updates.callNotes = replacePlaceholders(data.notes, context);
    }
    if (data.customFields) {
      Object.entries(data.customFields).forEach(([key, value]) => {
        updates[key] = replacePlaceholders(String(value), context);
      });
    }

    try {
      await db.collection("Lead").doc(leadId).update(updates);
    } catch (error) {
      logger.warn(`Failed to update lead ${leadId}:`, error);
    }
  }

  const nextNode = findDefaultNextNode(scenario, node.id);
  return {
    nextNodeId: nextNode?.id || null,
    continueProcessing: true,
  };
}

/**
 * Node Processor: End
 */
function processEndNode(node, context, scenario, twimlResponse) {
  const data = node.data || {};
  const message = replacePlaceholders(data.message || "תודה. להתראות!", context);
  const language = data.language || context.defaultLanguage || "he-IL";
  const voice = resolveVoiceForLanguage(data.voice || context.defaultVoice, language);

  if (message) {
    twimlResponse.say({voice, language}, message);
  }
  twimlResponse.hangup();

  return {
    nextNodeId: null,
    continueProcessing: false,
    finalStatus: data.status || "completed",
  };
}

/**
 * Main function to process a node and generate TwiML
 */
async function processNode(nodeId, scenario, context, callSessionId) {
  const twimlResponse = new twilio.twiml.VoiceResponse();
  const node = scenario.nodes.find((n) => n.id === nodeId);

  if (!node) {
    logger.error(`Node ${nodeId} not found in scenario ${scenario.id}`);
    twimlResponse.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "אירעה שגיאה. אנא נסה שוב מאוחר יותר.");
    twimlResponse.hangup();
    return {twiml: twimlResponse.toString(), finalStatus: "error"};
  }

  logger.info(`Processing node ${node.id} (${node.type}) in scenario ${scenario.id}`);

  let result;
  let currentNodeId = nodeId;
  let iterations = 0;
  const MAX_ITERATIONS = 50; // Prevent infinite loops

  while (currentNodeId && iterations < MAX_ITERATIONS) {
    const currentNode = scenario.nodes.find((n) => n.id === currentNodeId);
    if (!currentNode) break;

    switch (currentNode.type) {
      case "start":
        result = processStartNode(currentNode, context, scenario);
        break;
      case "say":
        result = processSayNode(currentNode, context, scenario, twimlResponse);
        break;
      case "gather":
        result = processGatherNode(currentNode, context, scenario, twimlResponse, callSessionId);
        break;
      case "condition":
        result = processConditionNode(currentNode, context, scenario);
        break;
      case "setVariable":
        result = processSetVariableNode(currentNode, context, scenario);
        break;
      case "apiCall":
        result = await processApiCallNode(currentNode, context, scenario, twimlResponse);
        break;
      case "transfer":
        result = processTransferNode(currentNode, context, scenario, twimlResponse);
        break;
      case "record":
        result = processRecordNode(currentNode, context, scenario, twimlResponse, callSessionId);
        break;
      case "wait":
        result = processWaitNode(currentNode, context, scenario, twimlResponse);
        break;
      case "scheduleCallback":
        result = await processScheduleCallbackNode(currentNode, context, scenario);
        break;
      case "updateLead":
        result = await processUpdateLeadNode(currentNode, context, scenario);
        break;
      case "end":
        result = processEndNode(currentNode, context, scenario, twimlResponse);
        break;
      default:
        logger.warn(`Unknown node type: ${currentNode.type}`);
        result = {nextNodeId: findDefaultNextNode(scenario, currentNode.id)?.id};
    }

    // Update context with any new variables
    if (result.updatedVariables) {
      context.variables = result.updatedVariables;
    }

    // Check if we should continue processing
    if (!result.continueProcessing) {
      break;
    }

    currentNodeId = result.nextNodeId;
    iterations++;
  }

  if (iterations >= MAX_ITERATIONS) {
    logger.error(`Max iterations reached in scenario ${scenario.id}`);
    twimlResponse.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "אירעה שגיאה. להתראות.");
    twimlResponse.hangup();
  }

  return {
    twiml: twimlResponse.toString(),
    lastNodeId: currentNodeId,
    context,
    finalStatus: result?.finalStatus,
  };
}

/**
 * Analyze speech result and determine which condition branch to take
 */
function analyzeSpeechForConditions(speechResult, gatherNode) {
  const data = gatherNode.data || {};
  const speech = (speechResult || "").toLowerCase().trim();
  
  // Check custom keywords first
  const keywords = data.keywords || {};
  
  if (keywords.positive && Array.isArray(keywords.positive)) {
    if (keywords.positive.some((kw) => speech.includes(kw.toLowerCase()))) {
      return "positive";
    }
  }
  
  if (keywords.negative && Array.isArray(keywords.negative)) {
    if (keywords.negative.some((kw) => speech.includes(kw.toLowerCase()))) {
      return "negative";
    }
  }

  // Default keyword matching
  const defaultPositive = ["yes", "yeah", "sure", "ok", "okay", "interested", "כן", "בטח", "מעוניין"];
  const defaultNegative = ["no", "nope", "not", "busy", "later", "לא", "עסוק", "אחר כך"];

  if (defaultPositive.some((kw) => speech.includes(kw))) {
    return "positive";
  }
  if (defaultNegative.some((kw) => speech.includes(kw))) {
    return "negative";
  }

  return "unclear";
}

/**
 * Get the start node of a scenario
 */
function getStartNode(scenario) {
  return scenario.nodes.find((n) => n.type === "start");
}

/**
 * Initialize a call session with scenario context
 */
async function initializeScenarioSession(callSessionId, scenarioId, initialContext = {}) {
  const db = getFirestore();
  
  // Get the scenario
  const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
  if (!scenarioDoc.exists) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }

  const scenario = {id: scenarioDoc.id, ...scenarioDoc.data()};
  const startNode = getStartNode(scenario);

  if (!startNode) {
    throw new Error(`Scenario ${scenarioId} has no start node`);
  }

  // Update call session with scenario info
  await db.collection("call_sessions").doc(callSessionId).set({
    scenarioId,
    currentNodeId: startNode.id,
    scenarioContext: {
      variables: {},
      ...initialContext,
      defaultVoice: scenario.settings?.defaultVoice || DEFAULT_HEBREW_VOICE,
      defaultLanguage: scenario.settings?.defaultLanguage || "he-IL",
    },
    scenarioStartedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  return {scenario, startNode};
}

// Export functions
module.exports = {
  processNode,
  replacePlaceholders,
  findNextNodes,
  findDefaultNextNode,
  analyzeSpeechForConditions,
  getStartNode,
  initializeScenarioSession,
};


