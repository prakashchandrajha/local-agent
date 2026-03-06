"use strict";

// ─────────────────────────────────────────────────────────────
// FAILURE INTELLIGENCE SYSTEM (FIS)
// Every time the agent fails and fixes something:
//   → stores: error, context, code, fix, timestamp
//
// Next time the SAME error appears:
//   → instant fix, no LLM call needed
//
// Over time the agent becomes faster than humans on known errors.
// Example stored pattern:
//   error: "Cannot read property of undefined"
//   cause: "missing null check before nested access"
//   fix:   "add optional chaining: obj?.prop?.nested"
// ─────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");

const MEMORY_DIR = path.join(process.cwd(), ".agent-memory");
const FIS_FILE   = path.join(MEMORY_DIR, "failures.json");
const MAX_ENTRIES = 1000;

// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────
const load = () => {
  try { return JSON.parse(fs.readFileSync(FIS_FILE, "utf8")); }
  catch (_) { return []; }
};

const save = (entries) => {
  try {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.writeFileSync(FIS_FILE, JSON.stringify(entries, null, 2));
  } catch (_) {}
};

// ─────────────────────────────────────────────────────────────
// FINGERPRINT
// Normalizes an error message into a stable lookup key.
// Strips line numbers, file paths, memory addresses.
// "TypeError: Cannot read properties of undefined (reading 'id') at line 42"
// → "typeerror cannot read properties of undefined reading id"
// ─────────────────────────────────────────────────────────────
const fingerprint = (errorText) =>
  (errorText || "")
    .toLowerCase()
    .replace(/at\s+[\w.<>]+\s*\([^)]+\)/g, "")   // strip stack frames
    .replace(/line\s+\d+/g, "")                    // strip line numbers
    .replace(/:\d+:\d+/g, "")                      // strip col:row refs
    .replace(/0x[0-9a-f]+/g, "")                   // strip hex addresses
    .replace(/['"\/\\]/g, " ")                      // strip quotes/paths
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);

// ─────────────────────────────────────────────────────────────
// RECORD A FAILURE + FIX
// Called after a successful fix cycle
// ─────────────────────────────────────────────────────────────
const recordFailure = ({ lang, file, errorText, cause, fix, codeAfter }) => {
  const entries = load();
  const key     = fingerprint(errorText);

  // Update if we've seen this exact error before (raise confidence)
  const existing = entries.find((e) => e.key === key);
  if (existing) {
    existing.seenCount++;
    existing.lastSeen = new Date().toISOString();
    existing.fix      = fix; // update with newest fix
    save(entries);
    return;
  }

  entries.push({
    id:        `fis-${Date.now()}`,
    key,
    lang,
    file,
    errorText: errorText?.slice(0, 300),
    cause:     cause?.slice(0, 200),
    fix:       fix?.slice(0, 500),
    codeAfter: codeAfter?.slice(0, 400),
    seenCount: 1,
    firstSeen: new Date().toISOString(),
    lastSeen:  new Date().toISOString(),
  });

  // Keep under limit
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  save(entries);
};

// ─────────────────────────────────────────────────────────────
// INSTANT LOOKUP
// Returns a known fix if we've seen this error before.
// Uses fingerprint similarity — not exact match.
// ─────────────────────────────────────────────────────────────
const instantLookup = (errorText, lang = "") => {
  const entries = load();
  if (!entries.length) return null;

  const key    = fingerprint(errorText);
  const tokens = key.split(" ").filter((w) => w.length > 3);

  const scored = entries.map((e) => {
    let score = 0;
    if (e.lang === lang) score += 5;

    // Count shared tokens between fingerprints
    const eTokens = e.key.split(" ");
    for (const t of tokens) {
      if (eTokens.includes(t)) score += 2;
    }

    // Exact fingerprint match = very high score
    if (e.key === key) score += 50;

    return { entry: e, score };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 8) return null;

  return best.entry;
};

// ─────────────────────────────────────────────────────────────
// BUILD CONTEXT BLOCK
// Returns a formatted hint block if we know this error
// ─────────────────────────────────────────────────────────────
const buildFISBlock = (errorText, lang = "") => {
  const known = instantLookup(errorText, lang);
  if (!known) return "";

  return `KNOWN ERROR (seen ${known.seenCount}x before):
  Error:  ${known.errorText?.slice(0, 100)}
  Cause:  ${known.cause || "see fix"}
  Fix:    ${known.fix?.slice(0, 300)}`.trim();
};

// ─────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────
const getStats = () => {
  const entries = load();
  const byLang  = {};
  for (const e of entries) {
    byLang[e.lang] = (byLang[e.lang] || 0) + 1;
  }
  return { total: entries.length, byLang, topErrors: entries.sort((a, b) => b.seenCount - a.seenCount).slice(0, 5) };
};

module.exports = { recordFailure, instantLookup, buildFISBlock, getStats };
