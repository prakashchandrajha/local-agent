"use strict";

// ─────────────────────────────────────────────────────────────
// COGNITIVE LOAD CONTROLLER (CLC) v2
// Now powered by the Context Compression Engine (CCE).
//
// Previously: keyword-scored file ranking + raw file loading
// Now: 4-level compression (summaries, arch graph, signatures,
//      smart file selection) with context caching
//
// Legacy utilities (scoreRelevance, detectBudget) preserved
// for backward compatibility.
// ─────────────────────────────────────────────────────────────

const path = require("path");
const { getCompressedContext, logCCEStats, detectBudget, estimateTokens } = require("./cce");
const { readFile, fileExists } = require("../tools/file");

// ─────────────────────────────────────────────────────────────
// BUILD COMPRESSED CONTEXT (v2 — CCE-powered)
// Given a task and model name, returns compressed context
// that fits within the token budget using 4-level compression
// ─────────────────────────────────────────────────────────────
const buildCompressedContext = (task, allFiles = [], modelName = "") => {
  // Use CCE for intelligent multi-level compression
  const result = getCompressedContext(task, modelName);
  return result;
};

// ─────────────────────────────────────────────────────────────
// LEGACY: FILE RELEVANCE SCORING
// Kept for backward compatibility — CCE uses its own scorer
// ─────────────────────────────────────────────────────────────
const scoreRelevance = (filePath, fileContent, taskKeywords) => {
  let score = 0;
  const nameTokens   = path.basename(filePath).toLowerCase().split(/[\-_.]/);
  const contentLower = (fileContent || "").toLowerCase().slice(0, 500);

  for (const kw of taskKeywords) {
    const k = kw.toLowerCase();
    if (nameTokens.some((t) => t.includes(k))) score += 10;
    const occurrences = (contentLower.match(new RegExp(k, "g")) || []).length;
    score += occurrences * 2;
  }

  if (fileContent && fileContent.length > 100 && fileContent.length < 3000) score += 2;
  return score;
};

// ─────────────────────────────────────────────────────────────
// LOG BUDGET USAGE
// ─────────────────────────────────────────────────────────────
const logBudget = (stats) => {
  if (stats.relevant !== undefined) {
    // New CCE stats format
    logCCEStats(stats);
  } else {
    // Legacy format
    const pct = Math.round((stats.usedTokens / stats.budget) * 100);
    console.log(`\n🧠 Context: ${stats.usedTokens}/${stats.budget} tokens (${pct}%) | Full: ${stats.full} | Summary: ${stats.summarized} | Skipped: ${stats.ignored}`);
  }
};

module.exports = { buildCompressedContext, scoreRelevance, detectBudget, logBudget };
