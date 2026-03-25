/**
 * smokeTestFrontend.js — HTTP smoke tests for deployed frontend pages
 * Usage: node smokeTestFrontend.js
 */

const https = require("https");

const BASE = "https://voiceflow-ai-202509231639.web.app";

const PAGES = [
  { path: "/", desc: "Root (should redirect to /dashboard/ or /login/)" },
  { path: "/login/", desc: "Login page" },
  { path: "/dashboard/", desc: "Dashboard" },
  { path: "/assistants/", desc: "Assistants list" },
  { path: "/calls/", desc: "Calls list" },
  { path: "/scenarios/", desc: "Scenarios list" },
  { path: "/leads/", desc: "Leads list" },
  { path: "/analytics/", desc: "Analytics page" },
  { path: "/settings/", desc: "Settings page" },
  { path: "/calls/detail?id=nonexistent", desc: "Call detail (query param route)" },
  { path: "/assistants/edit?id=nonexistent", desc: "Assistant edit (query param route)" },
  { path: "/scenarios/edit?id=nonexistent", desc: "Scenario edit (query param route)" },
];

let passed = 0;
let failed = 0;

function get(url, followRedirects = true) {
  return new Promise((resolve) => {
    https
      .get(url, { timeout: 10000 }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          const result = { status: res.statusCode, headers: res.headers, body };
          // Follow redirect if needed (handles trailingSlash redirect)
          if (followRedirects && (res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            const location = res.headers.location.startsWith("http")
              ? res.headers.location
              : `https://voiceflow-ai-202509231639.web.app${res.headers.location}`;
            get(location, false).then(resolve);
          } else {
            resolve(result);
          }
        });
      })
      .on("error", (err) => resolve({ status: 0, error: err.message }))
      .on("timeout", () => resolve({ status: 0, error: "timeout" }));
  });
}

async function checkPage(path, desc) {
  const url = `${BASE}${path}`;
  const res = await get(url);

  // SPA: Firebase Hosting serves index.html for all paths (via ** -> /index.html rewrite)
  // So we expect 200 and HTML content for all routes
  const isOk = res.status === 200 || (res.status >= 301 && res.status <= 302);
  const isHtml =
    res.body &&
    (res.body.includes("<!DOCTYPE html") ||
      res.body.includes("<html") ||
      res.body.includes("<!doctype html"));

  if (isOk && isHtml) {
    console.log(`  ✓ [${res.status}] ${desc}`);
    console.log(`         ${url}`);
    passed++;
  } else if (isOk && !isHtml) {
    console.log(`  ⚠ [${res.status}] ${desc} — response is not HTML`);
    console.log(`         ${url}`);
    console.log(`         body preview: ${(res.body || "").slice(0, 200)}`);
    failed++;
  } else if (res.status === 404) {
    console.log(`  ✗ [404] ${desc} — NOT FOUND (SPA rewrite not working?)`);
    console.log(`         ${url}`);
    failed++;
  } else {
    console.log(
      `  ✗ [${res.status || "ERR"}] ${desc} — ${res.error || "unexpected status"}`
    );
    console.log(`         ${url}`);
    failed++;
  }
}

async function checkFirebaseConfig() {
  console.log("\n--- Checking Firebase config in HTML ---");
  const url = `${BASE}/`;
  const res = await get(url);

  // Follow redirect if needed
  let html = res.body;
  if ((res.status === 301 || res.status === 302) && res.headers.location) {
    const redirectRes = await get(res.headers.location);
    html = redirectRes.body;
  }

  if (!html) {
    console.log("  ✗ Could not fetch HTML to check Firebase config");
    failed++;
    return;
  }

  // Check for Next.js static export markers
  // Static export doesn't embed __NEXT_DATA__ in HTML — it uses _next/static JS bundles
  const checks = [
    { marker: "_next/static", desc: "Static assets referenced" },
    { marker: "<html", desc: "Valid HTML document" },
    { marker: "<meta", desc: "HTML meta tags present" },
  ];

  for (const { marker, desc } of checks) {
    if (html.includes(marker)) {
      console.log(`  ✓ ${desc}`);
      passed++;
    } else {
      console.log(`  ✗ ${desc} — marker not found: ${marker}`);
      failed++;
    }
  }
}

async function main() {
  console.log("=== Frontend Smoke Test ===");
  console.log(`Target: ${BASE}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  console.log("--- Page availability ---");
  for (const { path, desc } of PAGES) {
    await checkPage(path, desc);
  }

  await checkFirebaseConfig();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
