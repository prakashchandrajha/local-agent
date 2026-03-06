"use strict";

// ─────────────────────────────────────────────────────────────
// PATTERN LOADER
// Loads the right patterns JSON for the detected language
// and injects relevant patterns into the LLM context.
// This makes the model act like it knows frameworks deeply.
// ─────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");

const PATTERNS_DIR = path.join(__dirname, "patterns");

// Maps language name → patterns file
const LANG_MAP = {
  "js":         "node-patterns.json",
  "javascript": "node-patterns.json",
  "ts":         "node-patterns.json",
  "typescript": "node-patterns.json",
  "node":       "node-patterns.json",
  "py":         "python-patterns.json",
  "python":     "python-patterns.json",
  "fastapi":    "python-patterns.json",
  "java":       "springboot-patterns.json",
  "springboot": "springboot-patterns.json",
  "spring":     "springboot-patterns.json",
};

// Loads all patterns for a language
const loadPatterns = (lang = "") => {
  const file = LANG_MAP[lang.toLowerCase()];
  if (!file) return null;
  try {
    const full = path.join(PATTERNS_DIR, file);
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (_) {
    return null;
  }
};

// Scores a pattern's relevance to a task query
const scorePattern = (pattern, queryTokens) => {
  let score = 0;
  const tags = (pattern.tags || []).join(" ").toLowerCase();
  const name = (pattern.name || "").toLowerCase();

  for (const qt of queryTokens) {
    if (tags.includes(qt)) score += 5;
    if (name.includes(qt)) score += 3;
    for (const fact of (pattern.keyFacts || [])) {
      if (fact.toLowerCase().includes(qt)) score += 1;
    }
  }
  return score;
};

// Returns top N most relevant patterns for a query
const findRelevantPatterns = (lang, query, topN = 4) => {
  const data = loadPatterns(lang);
  if (!data?.patterns?.length) return [];

  const queryTokens = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return data.patterns
    .map((p) => ({ pattern: p, score: scorePattern(p, queryTokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ pattern }) => pattern);
};

// Builds a compact pattern context block for injection into prompts
const buildPatternBlock = (lang, query) => {
  const patterns = findRelevantPatterns(lang, query);
  if (!patterns.length) return "";

  const lines = patterns.map((p) => {
    const facts = (p.keyFacts || []).slice(0, 3).map((f) => `  • ${f}`).join("\n");
    return `[${p.name}]\n${facts}${p.snippet ? `\n  → ${p.snippet}` : ""}`;
  });

  return `FRAMEWORK PATTERNS (use these as reference):\n${lines.join("\n\n")}`;
};

// Lists all available pattern files
const listAvailablePatterns = () => {
  try {
    return fs.readdirSync(PATTERNS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace("-patterns.json", ""));
  } catch (_) {
    return [];
  }
};

module.exports = { loadPatterns, findRelevantPatterns, buildPatternBlock, listAvailablePatterns };
