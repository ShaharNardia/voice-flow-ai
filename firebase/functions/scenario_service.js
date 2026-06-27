/**
 * Scenario Service - CRUD operations for Call Flow Scenarios
 * Similar to Voximplant scenarios - allows customers to define visual call flows
 */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {extractUidFromRequest} = require("./security_utils");
const {logActivity} = require("./audit_service");
const axios = require("axios");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// CORS configuration
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

/**
 * Node type definitions with their default configurations
 */
const NODE_TYPES = {
  start: {
    label: "Start",
    color: "#4CAF50",
    maxOutputs: 1,
    defaultData: {trigger: "outbound"},
  },
  say: {
    label: "Say",
    color: "#2196F3",
    maxOutputs: 1,
    defaultData: {text: "", voice: "Google.he-IL-Wavenet-A", language: "he-IL"},
  },
  gather: {
    label: "Gather Input",
    color: "#FF9800",
    maxOutputs: 3, // success, timeout, error
    defaultData: {
      inputType: "speech",
      prompt: "",
      timeout: 5,
      speechTimeout: "auto",
      numDigits: null,
      keywords: {positive: [], negative: []},
    },
  },
  condition: {
    label: "Condition",
    color: "#9C27B0",
    maxOutputs: 10, // Multiple branches
    defaultData: {
      conditionType: "keywords", // keywords, variable, expression
      variable: "",
      operator: "equals",
      value: "",
      branches: [],
    },
  },
  setVariable: {
    label: "Set Variable",
    color: "#607D8B",
    maxOutputs: 1,
    defaultData: {variableName: "", value: "", valueType: "string"},
  },
  apiCall: {
    label: "API Call",
    color: "#00BCD4",
    maxOutputs: 2, // success, error
    defaultData: {
      url: "",
      method: "POST",
      headers: {},
      body: "",
      saveResponseTo: "",
    },
  },
  transfer: {
    label: "Transfer Call",
    color: "#E91E63",
    maxOutputs: 2, // success, failed
    defaultData: {
      destinationType: "number", // number, agent, queue
      destination: "",
      announcement: "",
      timeout: 30,
    },
  },
  record: {
    label: "Record",
    color: "#795548",
    maxOutputs: 1,
    defaultData: {
      action: "start", // start, stop
      maxLength: 300,
      playBeep: true,
      transcribe: false,
    },
  },
  wait: {
    label: "Wait",
    color: "#9E9E9E",
    maxOutputs: 1,
    defaultData: {duration: 1}, // seconds
  },
  scheduleCallback: {
    label: "Schedule Callback",
    color: "#3F51B5",
    maxOutputs: 1,
    defaultData: {
      delay: 3600, // seconds
      priority: "normal",
      message: "",
    },
  },
  updateLead: {
    label: "Update Lead",
    color: "#8BC34A",
    maxOutputs: 1,
    defaultData: {
      status: "",
      notes: "",
      customFields: {},
    },
  },
  end: {
    label: "End Call",
    color: "#F44336",
    maxOutputs: 0,
    defaultData: {
      message: "×ª×•×“×”. ×œ×”×ª×¨××•×ª!",
      status: "completed",
    },
  },
};

/**
 * Validate scenario structure
 */
function validateScenario(scenario) {
  const errors = [];

  if (!scenario.name || scenario.name.trim() === "") {
    errors.push("Scenario name is required");
  }

  if (!scenario.nodes || !Array.isArray(scenario.nodes)) {
    errors.push("Nodes array is required");
  } else {
    // Check for start node
    const startNodes = scenario.nodes.filter((n) => n.type === "start");
    if (startNodes.length === 0) {
      errors.push("Scenario must have a Start node");
    } else if (startNodes.length > 1) {
      errors.push("Scenario can only have one Start node");
    }

    // Validate each node
    scenario.nodes.forEach((node, index) => {
      if (!node.id) {
        errors.push(`Node at index ${index} is missing an id`);
      }
      if (!node.type || !NODE_TYPES[node.type]) {
        errors.push(`Node ${node.id || index} has invalid type: ${node.type}`);
      }
    });
  }

  if (!scenario.edges || !Array.isArray(scenario.edges)) {
    errors.push("Edges array is required");
  } else {
    // Validate edges reference existing nodes
    const nodeIds = new Set((scenario.nodes || []).map((n) => n.id));
    scenario.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge ${index} references non-existent source: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge ${index} references non-existent target: ${edge.target}`);
      }
    });
  }

  return errors;
}

/**
 * Create a new scenario
 */
exports.scenariosCreate = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({status: "error", message: "Method not allowed"});
    return;
  }

  try {
    const uid = await extractUidFromRequest(req);
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const db = getFirestore();

    // Validate scenario
    const validationErrors = validateScenario(payload);
    if (validationErrors.length > 0) {
      res.status(400).json({
        status: "error",
        message: "Invalid scenario",
        errors: validationErrors,
      });
      return;
    }

    const docRef = db.collection("scenarios").doc();
    const now = FieldValue.serverTimestamp();

    const scenario = {
      id: docRef.id,
      name: payload.name,
      description: payload.description || "",
      companyId: payload.companyId || null,
      ownerId: uid || payload.ownerId || payload.userId || null,
      version: 1,
      isActive: payload.isActive !== false,
      nodes: payload.nodes || [],
      edges: payload.edges || [],
      variables: payload.variables || {},
      settings: {
        defaultVoice: payload.settings?.defaultVoice || "Google.he-IL-Wavenet-A",
        defaultLanguage: payload.settings?.defaultLanguage || "he-IL",
        recordCalls: payload.settings?.recordCalls || false,
        transcribeCalls: payload.settings?.transcribeCalls || false,
        maxDuration: payload.settings?.maxDuration || 600,
      },
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(scenario);

    logger.info(`Created scenario ${docRef.id}`, {scenarioId: docRef.id});

    res.status(201).json({
      status: "success",
      id: docRef.id,
      ...scenario,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    logActivity({ userId: uid, action: "scenario.create", category: "scenario", resourceType: "scenario", resourceId: docRef.id, details: {name: payload.name} }).catch(() => {});
  } catch (error) {
    logger.error("Failed to create scenario", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create scenario",
    });
  }
});

/**
 * Update an existing scenario
 */
exports.scenariosUpdate = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "PUT") {
    res.status(405).json({status: "error", message: "Method not allowed"});
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const scenarioId = payload.id || payload.scenarioId || req.query.id;

    if (!scenarioId) {
      res.status(400).json({
        status: "error",
        message: "Scenario ID is required",
      });
      return;
    }

    const db = getFirestore();
    const docRef = db.collection("scenarios").doc(scenarioId);
    const doc = await docRef.get();

    if (!doc.exists) {
      res.status(404).json({
        status: "error",
        message: "Scenario not found",
      });
      return;
    }

    const existingData = doc.data();
    const updates = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Update allowed fields
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;
    if (payload.nodes !== undefined) updates.nodes = payload.nodes;
    if (payload.edges !== undefined) updates.edges = payload.edges;
    if (payload.variables !== undefined) updates.variables = payload.variables;
    if (payload.settings !== undefined) {
      updates.settings = {...existingData.settings, ...payload.settings};
    }

    // Increment version if nodes or edges changed
    if (payload.nodes !== undefined || payload.edges !== undefined) {
      updates.version = (existingData.version || 0) + 1;
    }

    // Validate if structure changed
    if (updates.nodes || updates.edges) {
      const toValidate = {
        name: updates.name || existingData.name,
        nodes: updates.nodes || existingData.nodes,
        edges: updates.edges || existingData.edges,
      };
      const validationErrors = validateScenario(toValidate);
      if (validationErrors.length > 0) {
        res.status(400).json({
          status: "error",
          message: "Invalid scenario",
          errors: validationErrors,
        });
        return;
      }
    }

    await docRef.set(updates, {merge: true});

    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data();

    logger.info(`Updated scenario ${scenarioId}`, {scenarioId});

    res.status(200).json({
      status: "success",
      id: scenarioId,
      ...updatedData,
    });
    logActivity({ userId: null, action: "scenario.update", category: "scenario", resourceType: "scenario", resourceId: scenarioId, details: {name: payload.name} }).catch(() => {});
  } catch (error) {
    logger.error("Failed to update scenario", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update scenario",
    });
  }
});

/**
 * Get a single scenario by ID
 */
exports.scenariosGet = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({status: "error", message: "Method not allowed"});
    return;
  }

  try {
    const scenarioId = req.query.id || req.query.scenarioId;

    if (!scenarioId) {
      res.status(400).json({
        status: "error",
        message: "Scenario ID is required",
      });
      return;
    }

    const db = getFirestore();
    const doc = await db.collection("scenarios").doc(scenarioId).get();

    if (!doc.exists) {
      res.status(404).json({
        status: "error",
        message: "Scenario not found",
      });
      return;
    }

    const data = doc.data();
    res.status(200).json({
      status: "success",
      id: doc.id,
      ...data,
    });
  } catch (error) {
    logger.error("Failed to get scenario", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get scenario",
    });
  }
});

/**
 * List scenarios with optional filtering
 */
exports.scenariosList = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({status: "error", message: "Method not allowed"});
    return;
  }

  try {
    const uid = await extractUidFromRequest(req);
    const companyId = req.query.companyId;
    const activeOnly = req.query.activeOnly === "true";
    const limit = parseInt(req.query.limit) || 50;

    const db = getFirestore();
    let query = db.collection("scenarios").orderBy("createdAt", "desc");

    // Filter by authenticated user's UID â€” include legacy null-owner docs
    const ownerFilter = uid || req.query.ownerId || req.query.userId;
    if (ownerFilter) {
      query = query.where("ownerId", "in", [ownerFilter, null]);
    } else if (companyId) {
      query = query.where("companyId", "==", companyId);
    }
    if (activeOnly) {
      query = query.where("isActive", "==", true);
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const scenarios = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      status: "success",
      count: scenarios.length,
      scenarios,
    });
  } catch (error) {
    logger.error("Failed to list scenarios", error);
    res.status(500).json({
      status: "error",
      message: "Failed to list scenarios",
    });
  }
});

/**
 * Delete a scenario
 */
exports.scenariosDelete = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "DELETE" && req.method !== "POST") {
    res.status(405).json({status: "error", message: "Method not allowed"});
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const scenarioId = payload.id || payload.scenarioId || req.query.id;

    if (!scenarioId) {
      res.status(400).json({
        status: "error",
        message: "Scenario ID is required",
      });
      return;
    }

    const db = getFirestore();
    const docRef = db.collection("scenarios").doc(scenarioId);
    const doc = await docRef.get();

    if (!doc.exists) {
      res.status(404).json({
        status: "error",
        message: "Scenario not found",
      });
      return;
    }

    await docRef.delete();

    logger.info(`Deleted scenario ${scenarioId}`, {scenarioId});

    res.status(200).json({
      status: "success",
      message: "Scenario deleted",
      id: scenarioId,
    });
    logActivity({ userId: null, action: "scenario.delete", category: "scenario", resourceType: "scenario", resourceId: scenarioId }).catch(() => {});
  } catch (error) {
    logger.error("Failed to delete scenario", error);
    res.status(500).json({
      status: "error",
      message: "Failed to delete scenario",
    });
  }
});

/**
 * Duplicate a scenario
 */
exports.scenariosDuplicate = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({status: "error", message: "Method not allowed"});
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const scenarioId = payload.id || payload.scenarioId;
    const newName = payload.name;

    if (!scenarioId) {
      res.status(400).json({
        status: "error",
        message: "Scenario ID is required",
      });
      return;
    }

    const db = getFirestore();
    const sourceDoc = await db.collection("scenarios").doc(scenarioId).get();

    if (!sourceDoc.exists) {
      res.status(404).json({
        status: "error",
        message: "Source scenario not found",
      });
      return;
    }

    const sourceData = sourceDoc.data();
    const newDocRef = db.collection("scenarios").doc();
    const now = FieldValue.serverTimestamp();

    const newScenario = {
      ...sourceData,
      id: newDocRef.id,
      name: newName || `${sourceData.name} (Copy)`,
      version: 1,
      isActive: false, // Start as inactive
      createdAt: now,
      updatedAt: now,
    };

    await newDocRef.set(newScenario);

    logger.info(`Duplicated scenario ${scenarioId} to ${newDocRef.id}`);

    res.status(201).json({
      status: "success",
      id: newDocRef.id,
      ...newScenario,
    });
    logActivity({ userId: null, action: "scenario.duplicate", category: "scenario", resourceType: "scenario", resourceId: newDocRef.id, details: {sourceId: scenarioId} }).catch(() => {});
  } catch (error) {
    logger.error("Failed to duplicate scenario", error);
    res.status(500).json({
      status: "error",
      message: "Failed to duplicate scenario",
    });
  }
});

/**
 * Get available node types
 */
exports.scenariosNodeTypes = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  res.status(200).json({
    status: "success",
    nodeTypes: NODE_TYPES,
  });
});

// Export NODE_TYPES for use in other modules
exports.NODE_TYPES = NODE_TYPES;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AI Scenario Wizard
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WIZARD_INTERVIEW_SYSTEM = `You are a friendly, expert phone-bot scenario designer.
Your job: conduct a short interview (max 6 questions) to understand the business use-case,
then generate a professional call flow scenario.

Rules:
- Ask ONE question at a time. Keep each question under 20 words.
- After 4-6 exchanges (or when you have enough info), output EXACTLY the token "Â§READYÂ§" on its own line â€” nothing before or after it on that line.
- Don't ask about technical details (node types, branching logic, etc.) â€” you handle that automatically.
- Be warm, conversational, and encouraging.

Questions to cover (adapt based on what the user already told you, skip obvious ones):
1. What is the main purpose / goal of this phone bot? (one sentence)
2. Who are the people calling or being called? (customers, leads, tenants, patientsâ€¦)
3. What does success look like? What is the ideal outcome of one call?
4. What key piece of information do you need to collect from the caller?
5. After the call â€” what should happen? (book an appointment, send to CRM, transfer to a human, etc.)
6. Any common objection, hesitation, or edge-case the bot should handle gracefully?

When you output Â§READYÂ§, add a SECOND line with a compact JSON summary:
{ "purpose": "...", "audience": "...", "goal": "...", "collect": "...", "afterCall": "...", "edgeCases": "..." }`;

const WIZARD_GENERATE_SYSTEM = `You are an expert phone-bot scenario architect.
Given an interview summary, generate a COMPLETE, PRODUCTION-READY scenario JSON.

STRICT RULES:
1. Output ONLY valid JSON â€” no markdown, no explanation, no code fences.
2. Use realistic, professional, human-sounding language (not robotic).
3. Cover the happy path PLUS at least 2 important branches/edge-cases.
4. Maximum 16 nodes for clarity. Minimum 6 nodes.
5. Node IDs must be unique strings (e.g. "n1", "n2", "gather-name", "cond-intent").
6. Position nodes in a clear top-to-bottom layout.
   - Center column: x=300. Left branch: x=80. Right branch: x=520. Extra: x=740.
   - Start at y=60. Each level: y += 160.
7. Every node must be reachable from start.
8. The scenario must end with at least one "end" node.

OUTPUT SCHEMA (JSON object):
{
  "name": "Short descriptive name",
  "description": "One-line description",
  "nodes": [ ...NodeObject ],
  "edges": [ ...EdgeObject ]
}

NodeObject:
{
  "id": "unique-string",
  "type": "start|say|gather|condition|setVariable|transfer|end",
  "position": { "x": number, "y": number },
  "data": { ...type-specific fields below }
}

DATA FIELDS BY TYPE:
start:       { "trigger": "inbound" }
say:         { "text": "Spoken text here" }
gather:      { "prompt": "Question spoken to caller", "inputType": "speech", "timeout": 5, "saveResponseTo": "variableName" }
condition:   { "conditionType": "keywords", "branches": [ { "id": "branch_id", "name": "Branch Label", "keywords": ["word1","word2"] } ] }
             // Always add a final branch with id "default", name "Other", keywords []
setVariable: { "variableName": "varName", "value": "some value", "valueType": "string" }
transfer:    { "destinationType": "number", "destination": "+00000000000", "timeout": 30 }
end:         { "message": "Closing words to caller", "status": "completed" }

EdgeObject:
{
  "id": "edge-unique-id",
  "source": "source-node-id",
  "target": "target-node-id",
  "sourceHandle": "handle-id-if-multi-output"
}

MULTI-OUTPUT HANDLES:
- gather node outputs: "success", "timeout"
- condition node outputs: each branch's "id" field (including "default")
- all other nodes: omit sourceHandle (single output)

EXAMPLE of a condition with 3 branches:
  branches: [ {id:"yes", name:"Interested", keywords:["yes","sure","interested"]},
              {id:"no",  name:"Not now",    keywords:["no","not interested","busy"]},
              {id:"default", name:"Other",  keywords:[]} ]
  â†’ 3 outgoing edges with sourceHandle "yes", "no", "default"`;

/**
 * Wizard Step 1: Interview chat
 * POST { messages: [{role, content}] }
 * Returns { message: string, ready: bool, summary?: object }
 */
exports.scenarioWizardChat = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }

  try {
    await extractUidFromRequest(req);
    const {messages = []} = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) { res.status(500).json({error: "OPENAI_API_KEY not configured"}); return; }

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {role: "system", content: WIZARD_INTERVIEW_SYSTEM},
            ...messages,
          ],
          max_tokens: 300,
          temperature: 0.7,
        },
        {headers: {"Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json"}, timeout: 20000},
    );

    const raw = response.data.choices[0].message.content || "";
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const readyIdx = lines.findIndex((l) => l === "Â§READYÂ§");

    if (readyIdx !== -1) {
      // Parse summary JSON from the line after Â§READYÂ§
      let summary = null;
      try { summary = JSON.parse(lines[readyIdx + 1] || "{}"); } catch (_) { /* ignore */ }
      res.json({message: "Great â€” I have everything I need! Let me generate your scenario now âœ¨", ready: true, summary});
    } else {
      res.json({message: raw, ready: false});
    }
  } catch (e) {
    logger.error("scenarioWizardChat error", e.message);
    res.status(500).json({error: e.message || "Chat failed"});
  }
});

/**
 * Wizard Step 2: Generate scenario from collected context
 * POST { summary: object, messages: [{role, content}] }
 * Returns { name, description, nodes, edges }
 */
exports.scenarioWizardGenerate = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }

  try {
    await extractUidFromRequest(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {summary = {}, messages = []} = body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) { res.status(500).json({error: "OPENAI_API_KEY not configured"}); return; }

    // Build context from interview conversation + summary
    const interviewText = messages
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role === "user" ? "Business owner" : "Designer"}: ${m.content}`)
        .join("\n");

    const userPrompt = `Here is the interview transcript:
---
${interviewText}
---
Summary extracted: ${JSON.stringify(summary)}

Generate the complete scenario JSON now.`;

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {role: "system", content: WIZARD_GENERATE_SYSTEM},
            {role: "user", content: userPrompt},
          ],
          max_tokens: 4000,
          temperature: 0.3,
          response_format: {type: "json_object"},
        },
        {headers: {"Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json"}, timeout: 45000},
    );

    const raw = response.data.choices[0].message.content || "{}";
    let scenario;
    try {
      scenario = JSON.parse(raw);
    } catch (parseErr) {
      logger.error("Failed to parse wizard scenario JSON", raw.slice(0, 500));
      res.status(500).json({error: "AI returned invalid JSON â€” please try again"});
      return;
    }

    // Ensure required fields
    if (!scenario.nodes || !Array.isArray(scenario.nodes) || scenario.nodes.length === 0) {
      res.status(500).json({error: "AI did not generate any nodes â€” please try again"});
      return;
    }

    // Inject display fields (label, color) into each node's data
    for (const node of scenario.nodes) {
      const cfg = NODE_TYPES[node.type];
      if (cfg) {
        node.data = node.data || {};
        node.data.label = node.data.label || cfg.label || node.type;
        node.data.color = cfg.color;
      }
    }

    res.json({
      name:        scenario.name        || "AI Generated Scenario",
      description: scenario.description || "",
      nodes:       scenario.nodes,
      edges:       scenario.edges       || [],
    });
  } catch (e) {
    logger.error("scenarioWizardGenerate error", e.message);
    res.status(500).json({error: e.message || "Generation failed"});
  }
});


