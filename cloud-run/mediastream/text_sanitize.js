/**
 * text_sanitize.js — the single source of truth for "what the bot is allowed to
 * speak". Extracted from index.js so it can be UNIT-TESTED (it guards every TTS
 * path; a silent regression here makes the bot read symbols aloud).
 *
 * Rule: strip markdown, URLs, code, quotes and stray symbols — keep the words.
 * The bot must never say "hashtag", "asterisk" or "quote".
 */
"use strict";

function sanitizeForSpeech(text) {
  if (!text) return text;
  return text
    // Remove markdown headers (### Title → Title)
    .replace(/^#{1,6}\s*/gm, "")
    // Remove bold/italic markers (**text** → text, *text* → text, __text__ → text)
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove raw URLs (https://... or http://...)
    .replace(/https?:\/\/[^\s)]+/g, "")
    // Remove bullet markers (- item, * item, + item)
    .replace(/^[\s]*[-*+]\s+/gm, "")
    // Remove numbered list markers (1. item)
    .replace(/^\s*\d+\.\s+/gm, "")
    // Remove code blocks (```...```)
    .replace(/```[^`]*```/gs, "")
    // Remove inline code (`code`)
    .replace(/`([^`]+)`/g, "$1")
    // Remove blockquotes (> text → text)
    .replace(/^>\s*/gm, "")
    // Remove horizontal rules (---, ***, ___)
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove remaining special chars that TTS / native-audio models might read
    // aloud (the native-audio model has been heard speaking quote marks).
    .replace(/[#*_~`|<>{}[\]\\]/g, "")
    // Strip every kind of quotation mark (straight + curly + guillemets) — the
    // words inside stay, the marks go. Caller never wants to hear "quote".
    .replace(/["'«»“”‘’„‟]/g, "")
    // Turn slashes and pipes into a spoken-safe space ("ו/או" → "ו או", not "סלאש")
    .replace(/[/\\]/g, " ")
    // Drop parentheses but keep their contents
    .replace(/[()]/g, " ")
    // Collapse multiple spaces/newlines
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

module.exports = { sanitizeForSpeech };
