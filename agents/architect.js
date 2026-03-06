"use strict";

// ─────────────────────────────────────────────────────────────
// ARCHITECT AGENT
// Designs the full system BEFORE coding starts.
// Outputs: file list, module responsibilities, API contracts,
// data models, dependency order.
// Prevents coders from guessing architecture.
// ─────────────────────────────────────────────────────────────

const { postJSON } = require("../llm/client");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

// Designs the full architecture for a given spec
const designArchitecture = async (spec, projectContext = "") => {
  const goal = spec?.clarifiedPrompt || spec?.goal || spec;

  const prompt = `You are a senior software architect. Design the complete system architecture for:

"${goal}"

Language/Framework: ${spec?.language || "auto-detect"}
${projectContext ? `Existing project:\n${projectContext}\n` : ""}

Respond ONLY with this exact JSON (no other text):
{
  "modules": [
    {
      "file": "path/to/file.ext",
      "role": "<what this file does>",
      "exports": ["<function1>", "<function2>"],
      "imports": ["<other module or package>"],
      "priority": <1=first to write, higher=later>
    }
  ],
  "dataModels": [
    { "name": "<ModelName>", "fields": { "<field>": "<type>" } }
  ],
  "apiContracts": [
    { "method": "POST", "path": "/api/example", "body": {}, "response": {} }
  ],
  "writingOrder": ["file1.js", "file2.js"],
  "notes": "<any important architectural decisions>"
}`;

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.15, num_predict: 2000 },
    });

    const raw = (res.response || "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (_) {
    return null;
  }
};

// Displays the architecture plan
const displayArchitecture = (arch) => {
  if (!arch) return;
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  🏗️  ARCHITECT AGENT — System Design         ║");
  console.log("╚══════════════════════════════════════════════╝");

  if (arch.modules?.length) {
    console.log("\n📦 Modules (in writing order):");
    const ordered = [...arch.modules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    ordered.forEach((m) => {
      console.log(`   [${m.priority || "?"}] ${m.file}`);
      console.log(`       → ${m.role}`);
    });
  }

  if (arch.dataModels?.length) {
    console.log("\n🗄️  Data Models:");
    arch.dataModels.forEach((m) => {
      console.log(`   ${m.name}: ${Object.entries(m.fields || {}).map(([k, v]) => `${k}:${v}`).join(", ")}`);
    });
  }

  if (arch.apiContracts?.length) {
    console.log("\n🔌 API Contracts:");
    arch.apiContracts.forEach((a) => console.log(`   ${a.method} ${a.path}`));
  }

  if (arch.notes) console.log(`\n💡 Notes: ${arch.notes}`);
  console.log();
};

// Converts architecture into an ordered list of coding tasks
const archToSteps = (arch) => {
  if (!arch?.modules) return [];
  return [...arch.modules]
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .map((m, i) => ({
      id: i + 1,
      file: m.file,
      title: `Write ${m.file}`,
      focus: `Create ${m.file}. Role: ${m.role}. Exports: ${(m.exports || []).join(", ")}. Imports: ${(m.imports || []).join(", ")}.`,
    }));
};

module.exports = { designArchitecture, displayArchitecture, archToSteps };
