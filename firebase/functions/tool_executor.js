/**
 * tool_executor.js — execute a custom API tool (HTTP) for the test sandbox.
 *
 * Mirrors cloud-run/mediastream's executeCustomApiTool placeholder + dispatch
 * behavior, but returns the RAW (truncated) response rather than a heavy
 * summary — when you're verifying a tool works, you want to see what the API
 * actually returned. Self-contained (axios only) so functions can use it.
 */
"use strict";

const axios = require("axios");

// {{param}} and {param} placeholder substitution; URL-encode only inside query strings.
function substitutePlaceholders(template, values) {
  if (!template || typeof template !== "string") return template;
  const enc = (s) => (template.includes("?") ? encodeURIComponent(s) : s);
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => { const v = values?.[k]; return v == null ? "" : enc(String(v)); })
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => { const v = values?.[k]; return v == null ? m : enc(String(v)); });
}

// OpenAI tool/function names allow [a-zA-Z0-9_-]{1,64}; match cloud-run's sanitizer.
function toolFnName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64);
}

/**
 * Execute one tool. Returns { ok, status, ms, result, url } — result is the
 * response body as a string, truncated. Never throws.
 */
async function executeCustomApiTool(tool, args, opts = {}) {
  const t0 = Date.now();
  try {
    const url = substitutePlaceholders(tool.url, args);
    const method = (tool.method || "GET").toUpperCase();
    const headers = {};
    for (const [k, v] of Object.entries(tool.headers || {})) headers[k] = substitutePlaceholders(v, args);
    if (!headers["Content-Type"] && method !== "GET") headers["Content-Type"] = "application/json";

    const r = await axios({
      method, url, headers,
      data: method !== "GET" ? args : undefined,
      timeout: opts.timeout || 15000,
      validateStatus: () => true,
      maxContentLength: 5 * 1024 * 1024,
    });
    const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, ms: Date.now() - t0, result: (body || "").slice(0, 3000), url };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, result: `Error: ${e.message}`, url: tool.url };
  }
}

/** Convert a CustomTool to an OpenAI function-tool schema (null if not an HTTP tool). */
function toOpenAiTool(ct) {
  if (!ct || !ct.name || !ct.url) return null;
  if (ct.type && ct.type !== "api_call") return null;   // skip built-in toggles (save_lead, etc.)
  const properties = {};
  const required = [];
  (ct.parameters || []).forEach((p) => {
    if (!p || !p.name) return;
    properties[p.name] = { type: p.type === "integer" ? "number" : (p.type || "string"), description: p.description || "" };
    if (p.required) required.push(p.name);
  });
  return {
    type: "function",
    function: { name: toolFnName(ct.name), description: ct.description || ct.displayName || ct.name, parameters: { type: "object", properties, required } },
  };
}

module.exports = { substitutePlaceholders, executeCustomApiTool, toolFnName, toOpenAiTool };
