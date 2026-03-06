"use strict";

// ─────────────────────────────────────────────────────────────
// CEO AGENT
// Translates messy/vague user prompts into a clear engineering
// spec before any code is written. Handles typos, ambiguity,
// and under-specified requirements.
//
// Input:  "make login better"
// Output: { goal, requirements[], filesToModify[], lang, scope }
// ─────────────────────────────────────────────────────────────

const { postJSON } = require("../llm/client");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

// Keywords that signal the prompt needs CEO interpretation
const VAGUE_SIGNALS = [
  /^make\s+\w+\s+better$/i,
  /^improve\s+\w+$/i,
  /^fix\s+\w+$/i,
  /^add\s+\w+$/i,
  /^update\s+\w+$/i,
  /^refactor$/i,
];

// Returns true if the input is too vague to act on directly
const isVague = (input) =>
  input.trim().split(/\s+/).length <= 5 ||
  VAGUE_SIGNALS.some((p) => p.test(input.trim()));

// Calls the LLM acting as CEO to interpret the prompt
const interpretPrompt = async (userInput, projectContext = "") => {
  const prompt = `You are the CEO of a software engineering team. A developer gave you this task:

"${userInput}"

${projectContext ? `Project context:\n${projectContext}\n` : ""}

Your job is to convert this into a clear engineering spec.

Respond ONLY with this exact JSON format (no other text):
{
  "goal": "<one sentence description of what needs to be built or fixed>",
  "requirements": ["<requirement 1>", "<requirement 2>", "<requirement 3>"],
  "filesToCreate": ["<file1>", "<file2>"],
  "filesToModify": ["<existing file1>", "<existing file2>"],
  "language": "<primary language>",
  "complexity": "<simple|medium|complex>",
  "clarifiedPrompt": "<full rewritten version of the user request with all details filled in>"
}`;

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 1000 },
    });

    const raw = (res.response || "").trim();
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const spec = JSON.parse(jsonMatch[0]);
    return spec;
  } catch (_) {
    return null;
  }
};

// Formats a spec for terminal display
const displaySpec = (spec) => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  🏢 CEO AGENT — Engineering Spec             ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n🎯 Goal: ${spec.goal}`);
  console.log(`📊 Complexity: ${spec.complexity}`);
  console.log(`💻 Language: ${spec.language}`);

  if (spec.requirements?.length) {
    console.log("\n📋 Requirements:");
    spec.requirements.forEach((r) => console.log(`   • ${r}`));
  }
  if (spec.filesToCreate?.length) {
    console.log("\n📄 Files to create:");
    spec.filesToCreate.forEach((f) => console.log(`   + ${f}`));
  }
  if (spec.filesToModify?.length) {
    console.log("\n✏️  Files to modify:");
    spec.filesToModify.forEach((f) => console.log(`   ~ ${f}`));
  }
  console.log(`\n📝 Clarified: "${spec.clarifiedPrompt}"\n`);
};

module.exports = { interpretPrompt, isVague, displaySpec };
