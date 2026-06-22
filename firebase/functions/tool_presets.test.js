/**
 * tool_presets.test.js — every preset tool must be a valid, executable CustomTool.
 * Run: node --test firebase/functions/tool_presets.test.js
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { _packs } = require("./tool_presets.js");

test("at least one pack, each with id/title/tools", () => {
  assert.ok(_packs.length >= 1);
  for (const pack of _packs) {
    assert.ok(pack.id && pack.title, `pack needs id+title`);
    assert.ok(Array.isArray(pack.tools) && pack.tools.length > 0, `${pack.id} needs tools`);
  }
});

test("Moran pack has the 9 documented tools", () => {
  const moran = _packs.find((p) => p.id === "moran_transit_siri");
  assert.ok(moran, "moran pack present");
  const names = moran.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "check_moran_services", "get_general_messages", "get_line_status",
    "get_situation_exchange", "get_stop_arrivals", "get_stop_arrivals_voice",
    "get_stop_by_operator", "get_stop_delays", "get_vehicle_location",
  ]);
});

test("every tool is a well-formed, executable CustomTool", () => {
  const PLACEHOLDER = /\{\{(\w+)\}\}/g;
  for (const pack of _packs) {
    for (const t of pack.tools) {
      // snake_case name the model calls by
      assert.match(t.name, /^[a-z0-9_]+$/, `bad name: ${t.name}`);
      assert.ok(t.description && t.description.length > 5, `${t.name} needs a description`);
      assert.match(t.method, /^(GET|POST|PUT|PATCH|DELETE)$/, `${t.name} bad method`);
      assert.match(t.url, /^https:\/\//, `${t.name} url must be absolute https`);
      assert.ok(Array.isArray(t.parameters), `${t.name} parameters must be array`);

      // Every {{placeholder}} in the URL must map to a declared parameter.
      const declared = new Set(t.parameters.map((p) => p.name));
      const used = new Set();
      let m; while ((m = PLACEHOLDER.exec(t.url))) used.add(m[1]);
      for (const u of used) assert.ok(declared.has(u), `${t.name}: url uses {{${u}}} but no such param`);

      // Every required param must actually appear in the URL (else it can't bind).
      for (const par of t.parameters) {
        assert.match(par.type, /^(string|integer|number|boolean|object)$/, `${t.name}.${par.name} bad type`);
        if (par.required) assert.ok(used.has(par.name), `${t.name}: required ${par.name} not used in url`);
      }
    }
  }
});
