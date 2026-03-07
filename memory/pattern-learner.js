"use strict";

// Lightweight pattern learner for recurring errors → fixes.
// Not wired into the agent yet; provides learn() and lookup() APIs.

const fs   = require("fs");
const path = require("path");

const MEMORY_DIR     = path.join(process.cwd(), ".agent-memory");
const PATTERNS_FILE  = path.join(MEMORY_DIR, "patterns.json");
const MAX_PATTERNS   = 500;

// Normalize error text into a stable fingerprint (similar to FIS).
const fingerprint = (errorText) =>
  (errorText || "")
    .toLowerCase()
    .replace(/at\s+[\w.<>]+\s*\([^)]+\)/g, "") // strip stack frames
    .replace(/line\s+\d+/g, "")               // strip line numbers
    .replace(/:\d+:\d+/g, "")                 // strip col:row refs
    .replace(/0x[0-9a-f]+/g, "")              // strip hex addresses
    .replace(/['"\/\\]/g, " ")                // strip quotes/paths
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

const load = () => {
  try { return JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf8")); }
  catch (_) { return []; }
};

const save = (entries) => {
  try {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.writeFileSync(PATTERNS_FILE, JSON.stringify(entries, null, 2));
  } catch (_) {}
};

// Cosine-like similarity using token overlap.
const fingerprintSimilarity = (a, b) => {
  const ta = new Set(fingerprint(a).split(" ").filter(Boolean));
  const tb = new Set(fingerprint(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const denom = Math.sqrt(ta.size * tb.size);
  return shared / denom;
};

/**
 * Learn from an error → fix pair.
 * @param {string} errorText
 * @param {string} fixText  - code or command used to fix
 * @param {object} meta     - optional { errorType }
 */
const learn = (errorText, fixText, meta = {}) => {
  if (!errorText || !fixText) return;

  const entries = load();
  const key = fingerprint(errorText);
  if (!key) return;

  const existing = entries.find((p) => p.key === key);
  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.confidence = Math.min(0.99, (existing.confidence || 0.6) + 0.05);
    existing.fix = fixText.slice(0, 800);
    existing.errorSample = errorText.slice(0, 400);
    existing.errorType = meta.errorType || existing.errorType;
    existing.lastSeen = new Date().toISOString();
    save(entries);
    return;
  }

  entries.push({
    id: `pat-${Date.now()}`,
    key,
    errorSample: errorText.slice(0, 400),
    fix: fixText.slice(0, 800),
    errorType: meta.errorType || null,
    confidence: 0.6,
    count: 1,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  });

  if (entries.length > MAX_PATTERNS) entries.splice(0, entries.length - MAX_PATTERNS);
  save(entries);
};

/**
 * Lookup a pattern for the given error text.
 * Returns null if confidence is too low.
 */
const lookup = (errorText, minConfidence = 0.7) => {
  const entries = load();
  if (!entries.length) return null;

  const key = fingerprint(errorText);
  if (!key) return null;

  // Simple similarity: shared tokens + exact key bonus.
  const tokens = key.split(" ").filter((w) => w.length > 3);
  const scored = entries.map((p) => {
    let score = p.confidence || 0.6;
    const pTokens = p.key.split(" ");
    for (const t of tokens) if (pTokens.includes(t)) score += 0.05;
    if (p.key === key) score += 0.2;
    return { entry: p, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minConfidence) return null;
  return { ...best.entry, score: best.score };
};

const stats = () => {
  const entries = load();
  const byType = {};
  for (const e of entries) {
    if (!e.errorType) continue;
    byType[e.errorType] = (byType[e.errorType] || 0) + 1;
  }
  return { total: entries.length, byType, top: entries.slice(-5) };
};

module.exports = { learn, lookup, stats, load, save, fingerprint, fingerprintSimilarity };
