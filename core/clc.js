"use strict";

// ─────────────────────────────────────────────────────────────
// COGNITIVE LOAD CONTROLLER (CLC)
// Large projects break small models — too many files = lost context.
//
// This module:
//   1. Tracks token budget per request
//   2. Ranks files by relevance to current task
//   3. Loads only the most relevant files fully
//   4. Summarizes low-relevance files into 1-2 lines
//   5. Compresses project context to fit the budget
//
// Result: a 7B model can work on a 200-file repo.
// ─────────────────────────────────────────────────────────────

const { postJSON } = require("../llm/client");
const { readFile, fileExists } = require("../tools/file");
const path = require("path");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

// Token budget tiers (adjust based on your model's context window)
const BUDGETS = {
  "3b":  2000,
  "7b":  4000,
  "13b": 6000,
  "33b": 10000,
  "70b": 16000,
};

// Rough token estimator: ~4 chars per token
const estimateTokens = (text) => Math.ceil((text || "").length / 4);

// Detects model size from model name
const detectBudget = (modelName = "") => {
  const name = modelName.toLowerCase();
  if (name.includes("70b"))      return BUDGETS["70b"];
  if (name.includes("33b"))      return BUDGETS["33b"];
  if (name.includes("13b"))      return BUDGETS["13b"];
  if (name.includes("7b"))       return BUDGETS["7b"];
  if (name.includes("3b"))       return BUDGETS["3b"];
  return BUDGETS["7b"]; // safe default
};

// ─────────────────────────────────────────────────────────────
// FILE RELEVANCE SCORING
// Scores each file's relevance to the current task
// Uses keyword overlap — no LLM needed, instant
// ─────────────────────────────────────────────────────────────
const scoreRelevance = (filePath, fileContent, taskKeywords) => {
  let score = 0;
  const nameTokens    = path.basename(filePath).toLowerCase().split(/[\-_\.]/);
  const contentLower  = (fileContent || "").toLowerCase().slice(0, 500);

  for (const kw of taskKeywords) {
    const k = kw.toLowerCase();
    if (nameTokens.some((t) => t.includes(k))) score += 10; // filename match
    const occurrences = (contentLower.match(new RegExp(k, "g")) || []).length;
    score += occurrences * 2;
  }

  // Boost recently modified (if we had that info — use file size as proxy)
  if (fileContent && fileContent.length > 100 && fileContent.length < 3000) score += 2;

  return score;
};

// ─────────────────────────────────────────────────────────────
// SUMMARIZE A FILE
// Generates a 1-2 line summary of a file for context compression
// ─────────────────────────────────────────────────────────────
const summarizeFile = async (filePath, content) => {
  // Fast heuristic: just return the first meaningful comment or export line
  const lines = content.split("\n").filter((l) => l.trim());

  // Look for a module description comment
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const l = lines[i].trim();
    if (l.startsWith("//") || l.startsWith("#") || l.startsWith("*")) {
      const text = l.replace(/^[\/\*#\s]+/, "").trim();
      if (text.length > 15 && text.length < 120) {
        return `${filePath}: ${text}`;
      }
    }
  }

  // Fallback: count exports/functions
  const fnCount = (content.match(/\b(function|const|def|class|func)\s+\w+/g) || []).length;
  return `${filePath}: ${fnCount} functions/declarations, ${lines.length} lines`;
};

// ─────────────────────────────────────────────────────────────
// BUILD COMPRESSED CONTEXT
// Given a task and a list of project files, returns a context
// block that fits within the token budget
// ─────────────────────────────────────────────────────────────
const buildCompressedContext = async (task, allFiles, modelName = "") => {
  const budget   = detectBudget(modelName);
  const keywords = task.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  let usedTokens = estimateTokens(task) + 500; // reserve for task + rules

  // Score and rank all files
  const scored = [];
  for (const fp of allFiles) {
    if (!fileExists(fp)) continue;
    const content  = readFile(fp);
    const relScore = scoreRelevance(fp, content, keywords);
    scored.push({ fp, content, relScore });
  }
  scored.sort((a, b) => b.relScore - a.relScore);

  const fullFiles    = []; // loaded in full
  const summarized   = []; // summarized to 1 line
  const ignored      = []; // too low relevance

  for (const { fp, content, relScore } of scored) {
    const tokens = estimateTokens(content);

    if (relScore > 5 && usedTokens + tokens <= budget * 0.7) {
      // High relevance + fits budget → load in full
      fullFiles.push({ fp, content });
      usedTokens += tokens;
    } else if (relScore > 0 && usedTokens + 50 <= budget * 0.9) {
      // Some relevance → summarize
      const summary = await summarizeFile(fp, content);
      summarized.push(summary);
      usedTokens += 50;
    } else {
      ignored.push(fp);
    }
  }

  // Format context block
  const parts = [];

  if (fullFiles.length) {
    parts.push("RELEVANT FILES (full content):");
    fullFiles.forEach(({ fp, content }) =>
      parts.push(`FILE: ${fp}\n---\n${content}\n---`)
    );
  }

  if (summarized.length) {
    parts.push("OTHER PROJECT FILES (summaries):");
    summarized.forEach((s) => parts.push(`  • ${s}`));
  }

  return {
    context: parts.join("\n\n"),
    stats: {
      full: fullFiles.length,
      summarized: summarized.length,
      ignored: ignored.length,
      usedTokens,
      budget,
    },
  };
};

// ─────────────────────────────────────────────────────────────
// LOG BUDGET USAGE
// ─────────────────────────────────────────────────────────────
const logBudget = (stats) => {
  const pct = Math.round((stats.usedTokens / stats.budget) * 100);
  console.log(`\n🧠 Context: ${stats.usedTokens}/${stats.budget} tokens (${pct}%) | Full: ${stats.full} | Summary: ${stats.summarized} | Skipped: ${stats.ignored}`);
};

module.exports = { buildCompressedContext, scoreRelevance, detectBudget, logBudget };
