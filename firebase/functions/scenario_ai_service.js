/**
 * Scenario AI Service - AI-powered scenario generation
 * Uses OpenAI to generate call flow scenarios from natural language descriptions
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const axios = require("axios");

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

// Node types for the system prompt
const NODE_TYPES_INFO = `
Available node types:
- start: Beginning of the call flow. Data: { trigger: "outbound" | "inbound" }
- say: Speak text to caller. Data: { text: string, voice: "Google.he-IL-Wavenet-A", language: "he-IL" }
- gather: Collect input from caller. Data: { prompt: string, inputType: "speech" | "dtmf" | "both", timeout: number }
- condition: Branch based on conditions. Data: { conditionType: "keywords" | "variable", keywords: { positive: string[], negative: string[] } }
- setVariable: Set a variable. Data: { variableName: string, value: string }
- apiCall: Call external API. Data: { url: string, method: "GET" | "POST", headers: {}, body: string, saveResponseTo: string }
- transfer: Transfer call. Data: { destinationType: "number", destination: string, announcement: string }
- record: Record the call. Data: { action: "start" | "stop", maxLength: number, playBeep: boolean }
- wait: Pause. Data: { duration: number, waitType: "silence" | "holdMusic" }
- scheduleCallback: Schedule callback. Data: { delay: number, priority: "high" | "normal" | "low", message: string }
- updateLead: Update lead info. Data: { status: string, notes: string }
- end: End the call. Data: { message: string, status: "completed" | "voicemail" | "busy" }
`;

const SYSTEM_PROMPT = `You are an expert call flow designer. Generate JSON for a call flow scenario based on the user's description.

${NODE_TYPES_INFO}

Rules:
1. Always start with a "start" node
2. Always end paths with an "end" node
3. Position nodes vertically with ~120px spacing
4. Create logical branching with "condition" nodes
5. Use "gather" to collect user input before conditions
6. Include error handling paths

Return ONLY valid JSON in this exact format:
{
  "nodes": [
    { "id": "node_1", "type": "start", "position": { "x": 300, "y": 50 }, "data": { "trigger": "outbound" } },
    ...more nodes...
  ],
  "edges": [
    { "id": "edge_1", "source": "node_1", "target": "node_2" },
    ...more edges...
  ]
}

Do not include any explanation, only the JSON.`;

/**
 * Generate a scenario from natural language description
 */
exports.generateScenario = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  const {description} = req.body;

  if (!description || typeof description !== "string") {
    res.status(400).json({error: "Description is required"});
    return;
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    logger.error("OPENAI_API_KEY not configured");
    res.status(500).json({error: "AI service not configured"});
    return;
  }

  try {
    logger.info("Generating scenario from description", {description: description.substring(0, 100)});

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4",
          messages: [
            {role: "system", content: SYSTEM_PROMPT},
            {role: "user", content: `Create a call flow for: ${description}`},
          ],
          temperature: 0.7,
          max_tokens: 2000,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
    );

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse the JSON from the response
    let scenarioData;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      scenarioData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.error("Failed to parse AI response", {content, error: parseError.message});
      throw new Error("Failed to parse AI response as JSON");
    }

    // Validate the structure
    if (!scenarioData.nodes || !Array.isArray(scenarioData.nodes)) {
      throw new Error("Invalid scenario: missing nodes array");
    }
    if (!scenarioData.edges || !Array.isArray(scenarioData.edges)) {
      scenarioData.edges = [];
    }

    // Validate and fix node structure
    scenarioData.nodes = scenarioData.nodes.map((node, index) => ({
      id: node.id || `node_${index + 1}`,
      type: node.type || "say",
      position: {
        x: node.position?.x ?? 300,
        y: node.position?.y ?? (50 + index * 120),
      },
      data: node.data || {},
    }));

    // Validate edges
    const nodeIds = new Set(scenarioData.nodes.map((n) => n.id));
    scenarioData.edges = scenarioData.edges.filter((edge) => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    ).map((edge, index) => ({
      id: edge.id || `edge_${index + 1}`,
      source: edge.source,
      target: edge.target,
      condition: edge.condition || null,
    }));

    logger.info("Scenario generated successfully", {
      nodeCount: scenarioData.nodes.length,
      edgeCount: scenarioData.edges.length,
    });

    res.json({
      success: true,
      nodes: scenarioData.nodes,
      edges: scenarioData.edges,
    });
  } catch (error) {
    logger.error("Error generating scenario", {error: error.message});
    res.status(500).json({
      error: "Failed to generate scenario",
      details: error.message,
    });
  }
});

/**
 * Get AI suggestions for improving a scenario
 */
exports.suggestImprovements = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  const {nodes, edges, goal} = req.body;

  if (!nodes || !Array.isArray(nodes)) {
    res.status(400).json({error: "Nodes array is required"});
    return;
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    res.status(500).json({error: "AI service not configured"});
    return;
  }

  try {
    const scenarioJson = JSON.stringify({nodes, edges}, null, 2);

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `You are a call flow optimization expert. Analyze the scenario and suggest improvements.
${NODE_TYPES_INFO}
Provide suggestions in JSON format: { "suggestions": ["suggestion 1", "suggestion 2", ...] }`,
            },
            {
              role: "user",
              content: `Analyze this call flow${goal ? ` (goal: ${goal})` : ""}:\n${scenarioJson}\n\nProvide improvement suggestions.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
    );

    const content = response.data.choices[0]?.message?.content;
    let suggestions = [];

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        suggestions = parsed.suggestions || [];
      }
    } catch (e) {
      // If parsing fails, extract suggestions as lines
      suggestions = content.split("\n").filter((line) => line.trim().length > 0);
    }

    res.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    logger.error("Error getting suggestions", {error: error.message});
    res.status(500).json({error: "Failed to get suggestions"});
  }
});

