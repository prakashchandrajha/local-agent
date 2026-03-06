"use strict";

// ─────────────────────────────────────────────────────────────
// SPECULATIVE CODER
// Generates MULTIPLE candidate solutions for the same task,
// runs them all, scores each on: passes tests, code quality,
// brevity. Returns the winner.
//
// Approach styles tried in parallel (sequentially on small LLMs):
//   A → functional / pipeline style
//   B → class-based / OOP style
//   C → library-leveraging style
//
// Why: small models produce very inconsistent output.
// Running 2-3 candidates and picking the best one dramatically
// improves final quality without needing a bigger model.
// ─────────────────────────────────────────────────────────────

const { postJSON }  = require("../llm/client");
const { writeFile, runFile } = require("../tools/file");
const path = require("path");
const fs   = require("fs");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

const STYLES = [
  {
    id: "A",
    label: "Functional",
    instruction: "Write using a functional programming style: pure functions, no mutation, map/filter/reduce, composable units.",
  },
  {
    id: "B",
    label: "Class-based",
    instruction: "Write using OOP: classes with clear responsibilities, encapsulation, methods that read naturally.",
  },
  {
    id: "C",
    label: "Pragmatic",
    instruction: "Write the most straightforward practical solution: minimal abstractions, uses well-known libraries/built-ins, easy to read and maintain.",
  },
];

// Generates one candidate solution with a given style instruction
const generateCandidate = async (task, style, lang, existingFiles = {}) => {
  const fileContext = Object.entries(existingFiles)
    .slice(0, 3)
    .map(([fp, c]) => `FILE: ${fp}\n---\n${c.slice(0, 400)}\n---`)
    .join("\n\n");

  const prompt = `Write a solution for this task:

"${task}"

Style: ${style.instruction}
Language: ${lang}
${fileContext ? `\nExisting files:\n${fileContext}` : ""}

Write the complete, working code only. No explanation. No markdown fences.`;

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 4000 },
    });
    const code = (res.response || "").trim()
      .replace(/^```[\w]*\n?/gm, "").replace(/^```$/gm, "").trim();
    return code;
  } catch (_) {
    return null;
  }
};

// Scores a candidate: lower is better
// Scoring: syntax errors (-10), passes run (+5), shorter (+1 per 50 lines saved)
const scoreCandidate = (code, runResult) => {
  let score = 0;
  if (!code || code.length < 20) return -100;

  // Penalize obvious issues
  const openBraces  = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 2) score -= 5;

  if (code.includes("TODO") || code.includes("placeholder")) score -= 10;
  if (code.includes("...")) score -= 3; // truncation

  // Reward passing execution
  if (runResult?.success) score += 20;
  if (runResult && !runResult.success) score -= 5;

  // Reward conciseness (fewer lines = better, up to a point)
  const lines = code.split("\n").length;
  if (lines < 100) score += 3;
  if (lines < 60)  score += 2;

  return score;
};

// Runs all candidate styles, scores them, returns the winner
const pickBestSolution = async (task, filePath, lang, existingFiles = {}) => {
  const ext = path.extname(filePath);
  console.log(`\n🎲 Speculative Coder generating ${STYLES.length} candidates for ${filePath}...`);

  const candidates = [];

  for (const style of STYLES) {
    process.stdout.write(`   Candidate ${style.id} (${style.label})...`);
    const code = await generateCandidate(task, style, lang, existingFiles);
    if (!code) { process.stdout.write(" failed\n"); continue; }

    // Write to a temp file to run it
    const tmpPath = `${filePath}.candidate${style.id}${ext}`;
    writeFile(tmpPath, code);

    let runResult = null;
    const isRunnable = [".js", ".py", ".go", ".rb", ".sh"].includes(ext);
    if (isRunnable) {
      runResult = runFile(tmpPath);
    }

    const score = scoreCandidate(code, runResult);
    process.stdout.write(` score: ${score}${runResult?.success ? " ✅" : ""}\n`);
    candidates.push({ style, code, score, tmpPath });

    // Clean up temp file
    try { fs.unlinkSync(path.join(process.cwd(), tmpPath)); } catch (_) {}
  }

  if (!candidates.length) return null;

  // Pick highest score
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];
  console.log(`   🏆 Winner: Candidate ${winner.style.id} (${winner.style.label}) — score ${winner.score}\n`);
  return winner.code;
};

module.exports = { pickBestSolution, generateCandidate, scoreCandidate };
