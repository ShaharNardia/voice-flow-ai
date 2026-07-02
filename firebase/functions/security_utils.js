/**
 * Security utilities for input sanitization, rate limiting, and validation.
 *
 * Production-grade protection for a premium phone bot platform.
 */

const {logger} = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");
const admin = require("firebase-admin");

// ── HTML / XSS Sanitization ──────────────────────────────────────────

/**
 * Strip dangerous HTML tags and attributes from a string value.
 * Does NOT use a full parser – this is a defence-in-depth layer.
 * Firestore Security Rules provide the first barrier.
 */
function stripHtml(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value
    // Remove <script> blocks entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove event-handler attributes (onclick, onerror, onload …). Require a
    // whitespace boundary BEFORE "on" — real HTML attributes always have one —
    // so this can't false-match "on<word>=" INSIDE a data value and truncate it
    // (e.g. a URL param "...&phoneBotUse=true" contains "…ph‹oneBotUse=›…" which
    // the old `\s*on\w+=` matched, silently cutting the saved URL at "&ph").
    .replace(/(?<=\s)on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Remove <style> blocks
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Remove remaining HTML tags
    .replace(/<\/?[^>]+(>|$)/g, "")
    // Remove javascript: URLs
    .replace(/javascript\s*:/gi, "")
    // Trim whitespace
    .trim();
}

/**
 * Recursively sanitise every string value in an object or array.
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === "string") {
    return stripHtml(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (typeof obj === "object") {
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      clean[key] = sanitizeObject(value);
    }
    return clean;
  }
  return obj; // numbers, booleans, etc.
}

// ── Rate Limiting (in-memory + Firestore fallback) ───────────────────

/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for single-instance Firebase Functions.
 * For multi-instance deployments, use Firestore-backed rate limiting.
 */
const _buckets = new Map();
const BUCKET_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min

// Periodic cleanup of stale buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of _buckets) {
    if (now - bucket.windowStart > bucket.windowMs * 2) {
      _buckets.delete(key);
    }
  }
}, BUCKET_CLEANUP_INTERVAL).unref();

/**
 * Check rate limit for a given key.
 *
 * @param {string} key - Unique identifier (IP, user ID, etc.)
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowMs - Window size in milliseconds
 * @returns {{allowed: boolean, remaining: number, retryAfterMs: number}}
 */
function checkRateLimit(key, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  let bucket = _buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = {count: 0, windowStart: now, windowMs};
    _buckets.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > maxRequests) {
    const retryAfterMs = windowMs - (now - bucket.windowStart);
    return {allowed: false, remaining: 0, retryAfterMs};
  }

  return {
    allowed: true,
    remaining: maxRequests - bucket.count,
    retryAfterMs: 0,
  };
}

/**
 * Express-style rate limiting middleware for Firebase onRequest functions.
 *
 * @param {Object} req - Firebase request
 * @param {Object} res - Firebase response
 * @param {Object} [options]
 * @param {number} [options.maxRequests=60] - Max requests per window
 * @param {number} [options.windowMs=60000] - Window size in ms
 * @returns {boolean} true if request is allowed, false if rate limited
 */
function applyRateLimit(req, res, options = {}) {
  const {maxRequests = 60, windowMs = 60000} = options;
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    "unknown";

  const result = checkRateLimit(`ip:${ip}`, maxRequests, windowMs);

  res.set("X-RateLimit-Limit", String(maxRequests));
  res.set("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    res.set(
      "Retry-After",
      String(Math.ceil(result.retryAfterMs / 1000)),
    );
    res.status(429).json({
      status: "error",
      message: "Too many requests. Please try again later.",
      retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
    });
    return false;
  }

  return true;
}

// ── Input Validation Helpers ─────────────────────────────────────────

const PHONE_REGEX = /^\+?[\d\s\-()]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_STRING_REGEX = /^[\p{L}\p{N}\p{P}\p{Z}\p{S}]{0,5000}$/u;

/**
 * Validate a phone number format.
 */
function isValidPhone(value) {
  return typeof value === "string" && PHONE_REGEX.test(value.trim());
}

/**
 * Validate an email format.
 */
function isValidEmail(value) {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim());
}

/**
 * Validate a string is safe (no control characters, reasonable length).
 */
function isSafeString(value, maxLength = 5000) {
  if (typeof value !== "string") return false;
  if (value.length > maxLength) return false;
  return SAFE_STRING_REGEX.test(value);
}

/**
 * Validate required fields exist and are non-empty strings.
 *
 * @param {Object} payload - The request payload
 * @param {string[]} fields - Required field names
 * @returns {{valid: boolean, missing: string[]}}
 */
function validateRequired(payload, fields) {
  const missing = fields.filter((f) => {
    const val = payload[f];
    return val === undefined || val === null || val === "";
  });
  return {valid: missing.length === 0, missing};
}

// ── CORS Hardened ────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://voiceflow-ai-202509231639.web.app",
  "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
];

// Allow localhost only in development
if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push("http://localhost:3000", "http://localhost:5000");
}

/**
 * Set CORS headers. Returns 403 for disallowed origins (no wildcard fallback).
 *
 * @param {Object} req
 * @param {Object} res
 * @returns {boolean} true if origin is allowed, false if blocked
 */
function setCorsHeadersSafe(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  } else if (origin) {
    // Blocked origin – don't set any CORS header
    logger.warn(`Blocked CORS request from origin: ${origin}`);
    return false;
  }
  // No origin header (server-to-server, Twilio webhooks) – allowed

  res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
  return true;
}

/**
 * Handle CORS preflight + origin check.
 * Returns true if the request was handled (preflight or blocked).
 */
function handleCorsSafe(req, res) {
  const originAllowed = setCorsHeadersSafe(req, res);

  if (req.method === "OPTIONS") {
    if (originAllowed) {
      res.status(204).send("");
    } else {
      res.status(403).json({status: "error", message: "Origin not allowed."});
    }
    return true; // Request handled
  }

  if (!originAllowed && req.headers.origin) {
    res.status(403).json({status: "error", message: "Origin not allowed."});
    return true; // Request blocked
  }

  return false; // Continue processing
}

// ── Auth Token Extraction ─────────────────────────────────────────────

/**
 * Extract and verify a Firebase UID from the Authorization: Bearer header.
 * Returns null if missing, invalid, or expired.
 */
async function extractUidFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch (e) {
    logger.warn("extractUidFromRequest: invalid token", e.message);
    return null;
  }
}

/**
 * Get user document from Firestore, checking both `users` (new) and `user` (legacy) collections.
 * Returns the DocumentSnapshot (may or may not exist).
 */
async function getUserDoc(db, uid) {
  const newSnap = await db.collection("users").doc(uid).get();
  if (newSnap.exists) return newSnap;
  return db.collection("user").doc(uid).get();
}

module.exports = {
  stripHtml,
  sanitizeObject,
  checkRateLimit,
  applyRateLimit,
  isValidPhone,
  isValidEmail,
  isSafeString,
  validateRequired,
  ALLOWED_ORIGINS,
  setCorsHeadersSafe,
  handleCorsSafe,
  extractUidFromRequest,
  getUserDoc,
};
