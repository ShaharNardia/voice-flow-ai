/**
 * Realtime Scenario Runner — drives a scenario flow inside the voice-to-voice
 * (OpenAI Realtime) path.
 *
 * Unlike the TwiML-based scenario engine (firebase/functions/scenario_engine.js),
 * this runner does not produce TwiML. It interacts with the live OpenAI Realtime
 * session via the RealtimeBridge: injecting assistant messages for "say" nodes,
 * listening for user transcripts on "gather" nodes, and firing HTTP calls
 * directly for "apiCall" nodes.
 *
 * Supported node types:
 *   start        — skip, advance
 *   say          — inject assistant text + trigger response, advance when
 *                  the response.done event fires
 *   gather       — wait for the next user transcript; run branch logic
 *   condition    — evaluate keyword matches against lastTranscript/variables
 *   setVariable  — update context.variables, advance
 *   apiCall      — HTTP request with placeholder substitution, save response
 *                  to context variable, branch on success/error, advance
 *   transfer     — inject transfer_call tool call, advance
 *   wait         — setTimeout then advance
 *   end          — inject final say + hangup
 *
 * Skipped (treated as noop + advance):
 *   record, scheduleCallback, updateLead — specific to TwiML or batch jobs
 */

const axios = require("axios");

function replacePlaceholders(template, vars) {
  if (!template || typeof template !== "string") return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const parts = key.split(".");
    let v = vars;
    for (const p of parts) {
      if (v == null) return "";
      v = v[p];
    }
    return v == null ? "" : String(v);
  });
}

function findEdge(edges, fromId, byLabel) {
  // edges may use `source/target` or `from/to`; handle both
  const matches = (edges || []).filter((e) => {
    const from = e.source || e.from;
    return from === fromId;
  });
  if (byLabel) {
    const labelled = matches.find((e) => (e.label || "").toLowerCase() === byLabel.toLowerCase() || (e.sourceHandle || "").toLowerCase() === byLabel.toLowerCase());
    if (labelled) return labelled.target || labelled.to;
  }
  // Default: first edge without a label, or first edge
  const defaultEdge = matches.find((e) => !e.label && !e.sourceHandle) || matches[0];
  return defaultEdge ? (defaultEdge.target || defaultEdge.to) : null;
}

function matchesConditions(text, conditions) {
  if (!text || !conditions) return null;
  const normalized = text.toLowerCase().trim();
  for (const cond of conditions) {
    const keywords = Array.isArray(cond.keywords) ? cond.keywords : [];
    if (keywords.some((k) => normalized.includes(String(k).toLowerCase()))) {
      return cond;
    }
  }
  return null;
}

class RealtimeScenarioRunner {
  constructor({scenario, bridge, sessionRef, callSessionId, initialContext = {}}) {
    this.scenario = scenario;
    this.bridge = bridge;
    this.sessionRef = sessionRef;
    this.callSessionId = callSessionId;
    this.context = {
      variables: initialContext.variables || {},
      lastTranscript: "",
    };
    this.currentNodeId = null;
    this.waitingForUser = false;   // set when a gather node is active
    this.gatherNode = null;        // the current gather node (for branching)
    this.done = false;
    this._log = (msg) => console.log(`[${callSessionId}] [SCN] ${msg}`);
  }

  start() {
    const nodes = this.scenario?.nodes || [];
    const startNode = nodes.find((n) => n.type === "start") || nodes[0];
    if (!startNode) {
      this._log("No start node in scenario — exiting");
      this.done = true;
      return;
    }
    this.currentNodeId = startNode.id;
    this.advance();
  }

  /**
   * Called by the host when a new user transcript arrives.
   * If we're waiting on a gather node, route it to branch logic.
   */
  onUserTranscript(text) {
    if (this.done) return;
    this.context.lastTranscript = text;
    if (this.waitingForUser && this.gatherNode) {
      this.waitingForUser = false;
      const matched = matchesConditions(text, this.gatherNode.data?.conditions || []);
      const nextId = matched
        ? findEdge(this.scenario.edges, this.gatherNode.id, matched.label || matched.value)
        : findEdge(this.scenario.edges, this.gatherNode.id);
      this.gatherNode = null;
      this.currentNodeId = nextId;
      this.advance();
    }
  }

  /**
   * Advance through nodes until we hit one that needs to wait
   * (gather) or a terminal state.
   */
  async advance() {
    while (!this.done && this.currentNodeId && !this.waitingForUser) {
      const node = (this.scenario?.nodes || []).find((n) => n.id === this.currentNodeId);
      if (!node) {
        this._log(`Unknown node ${this.currentNodeId} — ending scenario`);
        this.done = true;
        return;
      }
      this._log(`→ ${node.type} (${node.id})`);
      try {
        await this._processNode(node);
      } catch (e) {
        this._log(`Node ${node.type} failed: ${e.message}`);
        // On error, try to find an "error" branch, otherwise end
        const errEdge = findEdge(this.scenario.edges, node.id, "error");
        if (errEdge) { this.currentNodeId = errEdge; continue; }
        this.done = true;
      }
    }
  }

  async _processNode(node) {
    const data = node.data || {};
    switch (node.type) {
      case "start": {
        this.currentNodeId = findEdge(this.scenario.edges, node.id);
        return;
      }

      case "say":
      case "message": {
        const text = replacePlaceholders(data.text || data.message || "", this.context.variables);
        if (text) {
          // Inject as an assistant message the model should speak verbatim
          this.bridge.addConversationItem({
            type: "message",
            role: "assistant",
            content: [{type: "text", text}],
          });
          this.bridge.triggerResponse();
        }
        this.currentNodeId = findEdge(this.scenario.edges, node.id);
        return;
      }

      case "ask":
      case "gather": {
        const question = replacePlaceholders(data.question || data.prompt || data.text || "", this.context.variables);
        if (question) {
          this.bridge.addConversationItem({
            type: "message",
            role: "assistant",
            content: [{type: "text", text: question}],
          });
          this.bridge.triggerResponse();
        }
        // Pause here — onUserTranscript will resume us
        this.waitingForUser = true;
        this.gatherNode = node;
        return;
      }

      case "condition": {
        const matched = matchesConditions(this.context.lastTranscript, data.conditions || []);
        const nextId = matched
          ? findEdge(this.scenario.edges, node.id, matched.label || matched.value)
          : findEdge(this.scenario.edges, node.id);
        this.currentNodeId = nextId;
        return;
      }

      case "setVariable": {
        const name = data.variable || data.name;
        const value = replacePlaceholders(String(data.value ?? ""), this.context.variables);
        if (name) this.context.variables[name] = value;
        this.currentNodeId = findEdge(this.scenario.edges, node.id);
        return;
      }

      case "apiCall": {
        const url = replacePlaceholders(data.url || "", this.context.variables);
        const method = (data.method || "POST").toUpperCase();
        const headers = {};
        for (const [k, v] of Object.entries(data.headers || {})) {
          headers[k] = replacePlaceholders(v, this.context.variables);
        }
        let body = data.body;
        if (typeof body === "string") {
          body = replacePlaceholders(body, this.context.variables);
          try { body = JSON.parse(body); } catch (_) {}
        }
        let success = true;
        let responseData = null;
        try {
          const resp = await axios({method, url, headers, data: body, timeout: 10000});
          responseData = resp.data;
          success = resp.status >= 200 && resp.status < 300;
        } catch (e) {
          success = false;
          responseData = {error: e.message};
        }
        if (data.saveResponseTo) this.context.variables[data.saveResponseTo] = responseData;
        const nextLabel = success ? "success" : "error";
        this.currentNodeId = findEdge(this.scenario.edges, node.id, nextLabel) || findEdge(this.scenario.edges, node.id);
        this._log(`apiCall ${method} ${url} → ${success ? "success" : "error"}`);
        return;
      }

      case "transfer": {
        const to = replacePlaceholders(data.destination || data.to || "", this.context.variables);
        if (to) {
          // Delegate to the realtime session's transfer_call tool (already defined)
          this.bridge.emit("_scenario_tool", {name: "transfer_call", args: {to, reason: "scenario"}});
        }
        this.currentNodeId = findEdge(this.scenario.edges, node.id);
        return;
      }

      case "wait": {
        const ms = (data.seconds ? data.seconds * 1000 : data.ms) || 1000;
        await new Promise((r) => setTimeout(r, ms));
        this.currentNodeId = findEdge(this.scenario.edges, node.id);
        return;
      }

      case "end": {
        const text = replacePlaceholders(data.text || data.message || "", this.context.variables);
        if (text) {
          this.bridge.addConversationItem({
            type: "message",
            role: "assistant",
            content: [{type: "text", text}],
          });
          this.bridge.triggerResponse();
        }
        this.done = true;
        this.bridge.emit("_scenario_tool", {name: "end_call", args: {}});
        this.currentNodeId = null;
        return;
      }

      // Node types that don't translate to realtime — just advance
      case "record":
      case "scheduleCallback":
      case "updateLead":
      default: {
        this.currentNodeId = findEdge(this.scenario.edges, node.id);
        return;
      }
    }
  }
}

module.exports = {RealtimeScenarioRunner};
