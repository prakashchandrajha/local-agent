"use strict";

// ─────────────────────────────────────────────────────────────
// OPTIMIZATION AGENT
// Runs AFTER code passes QA. Looks for:
//   - Loops that can be replaced with map/filter/reduce
//   - Duplicate logic to extract into functions
//   - Unnecessary DB/API calls to batch or cache
//   - Memory leaks (unclosed connections, event listeners)
//   - Dead code and unused variables
// ─────────────────────────────────────────────────────────────

const { postJSON } = require("../llm/client");
const { readFile, writeFile, fileExists } = require("../tools/file");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

const OPTIMIZATION_CHECKLIST = {
  js: [
    "Replace for-loops with map/filter/reduce where appropriate",
    "Extract repeated code blocks into named functions",
    "Replace var with const/let",
    "Add missing error handling on async calls",
    "Remove console.log left from debugging",
    "Batch multiple DB/API calls using Promise.all",
    "Close database connections and streams in finally blocks",
  ],
  py: [
    "Use list comprehensions instead of for-append loops",
    "Use generators for large datasets to save memory",
    "Replace repeated dict.get chains with dataclasses",
    "Add type hints to all public functions",
    "Use context managers (with) for file/db operations",
    "Replace multiple if-elif with dict dispatch",
  ],
  java: [
    "Replace imperative loops with Stream API",
    "Use Optional instead of null checks",
    "Extract magic strings/numbers into constants",
    "Replace StringBuffer concatenation in loops with StringBuilder",
    "Close resources with try-with-resources",
    "Remove unused imports",
  ],
  go: [
    "Use goroutines + channels for parallelizable work",
    "Defer close/cleanup calls immediately after open",
    "Replace repeated error wrapping with helper function",
    "Use sync.Pool for frequently allocated objects",
  ],
  default: [
    "Extract duplicate code into reusable functions",
    "Remove dead code and unused variables",
    "Add missing error handling",
    "Improve naming clarity",
  ],
};

// Analyzes and optimizes a single file
const optimizeFile = async (filePath, lang = "default") => {
  if (!fileExists(filePath)) return null;
  const content   = readFile(filePath);
  const checklist = (OPTIMIZATION_CHECKLIST[lang] || OPTIMIZATION_CHECKLIST.default).join("\n- ");

  const prompt = `You are a senior performance engineer. Optimize this file.

FILE: ${filePath}
---
${content}
---

OPTIMIZATION CHECKLIST:
- ${checklist}

Rules:
1. Only apply optimizations that clearly improve the code
2. Do NOT change behavior or logic — only style/performance
3. Write the complete optimized file

If the code is already well-optimized, respond with exactly: ALREADY_OPTIMAL

Otherwise respond with the complete optimized file only. No explanation.`;

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 5000 },
    });

    const raw = (res.response || "").trim();
    if (raw === "ALREADY_OPTIMAL" || raw.includes("ALREADY_OPTIMAL")) return null;

    const optimized = raw.replace(/^```[\w]*\n?/gm, "").replace(/^```$/gm, "").trim();
    if (optimized && optimized.length > 50 && optimized !== content) {
      writeFile(filePath, optimized);
      return filePath;
    }
    return null;
  } catch (_) {
    return null;
  }
};

// Runs optimization pass on all written files
const runOptimizationPass = async (writtenFiles, detectLangFn) => {
  console.log("\n⚡ Optimization Agent running...");
  const optimized = [];

  for (const fp of writtenFiles) {
    const lang = detectLangFn?.(fp) || "default";
    process.stdout.write(`   Optimizing ${fp}...`);
    const result = await optimizeFile(fp, lang);
    if (result) {
      process.stdout.write(" ✅ improved\n");
      optimized.push(fp);
    } else {
      process.stdout.write(" — already optimal\n");
    }
  }

  if (optimized.length) {
    console.log(`\n   ✨ Optimized ${optimized.length} file(s): ${optimized.join(", ")}\n`);
  } else {
    console.log("   ✅ All files already optimal.\n");
  }

  return optimized;
};

module.exports = { runOptimizationPass, optimizeFile };
