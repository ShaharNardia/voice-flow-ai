/**
 * Scenario Service - CRUD operations for Call Flow Scenarios
 * Similar to Voximplant scenarios - allows customers to define visual call flows
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

// CORS configuration
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5000",
    /\.web\.app$/,
    /\.firebaseapp\.com$/,
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
    defaultData: {text: "", voice: "Polly.Joanna", language: "en-US"},
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
      message: "תודה. להתראות!",
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
exports.scenariosCreate = onRequest(corsOptions, async (req, res) => {
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
      ownerId: payload.ownerId || payload.userId || null,
      version: 1,
      isActive: payload.isActive !== false,
      nodes: payload.nodes || [],
      edges: payload.edges || [],
      variables: payload.variables || {},
      settings: {
        defaultVoice: payload.settings?.defaultVoice || "Polly.Joanna",
        defaultLanguage: payload.settings?.defaultLanguage || "en-US",
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
exports.scenariosUpdate = onRequest(corsOptions, async (req, res) => {
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
exports.scenariosGet = onRequest(corsOptions, async (req, res) => {
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
exports.scenariosList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({status: "error", message: "Method not allowed"});
    return;
  }

  try {
    const companyId = req.query.companyId;
    const ownerId = req.query.ownerId || req.query.userId;
    const activeOnly = req.query.activeOnly === "true";
    const limit = parseInt(req.query.limit) || 50;

    const db = getFirestore();
    let query = db.collection("scenarios").orderBy("createdAt", "desc");

    if (companyId) {
      query = query.where("companyId", "==", companyId);
    }
    if (ownerId) {
      query = query.where("ownerId", "==", ownerId);
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
exports.scenariosDelete = onRequest(corsOptions, async (req, res) => {
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
exports.scenariosDuplicate = onRequest(corsOptions, async (req, res) => {
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
exports.scenariosNodeTypes = onRequest(corsOptions, async (req, res) => {
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


