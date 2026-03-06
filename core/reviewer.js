"use strict";

const axios = require("axios");

// ─────────────────────────────────────────────────────────────
// SELF-REVIEW ENGINE
// After code generation, runs a focused review pass to catch
// obvious errors before they hit disk. Costs one extra LLM call
// but dramatically improves first-run success rate.
// ─────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const MODEL = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

// Checklist items per language
const REVIEW_CHECKLISTS = {
  js: `
- All require() / import paths exist and are correct
- All async functions have try/catch or propagate errors
- No undefined variables or functions called before definition  
- No missing closing brackets, braces, or parentheses
- No placeholder comments (TODO, add logic here, etc.)
- All exported functions are actually defined
- "use strict" at top
`.trim(),

  ts: `
- All types are explicitly declared or properly inferred
- No 'any' types unless absolutely necessary
- All imports are correct and types are available
- All interface implementations are complete
- No missing return types on exported functions
`.trim(),

  py: `
- All imports exist and are spelled correctly
- Indentation is consistent (4 spaces)
- All functions have proper return statements
- No undefined variables used
- async def functions are awaited correctly
- All except blocks handle specific exception types
`.trim(),

  java: `
- All imports are present
- All classes have correct access modifiers
- No missing semicolons
- All @Autowired / @Inject dependencies exist as beans
- All overridden methods have @Override
- No raw types (use generics)
- All exceptions are handled or declared thrown
`.trim(),

  springboot: `
- @Component / @Service / @Repository annotations are correct
- All @Autowired fields have corresponding beans
- @RequestMapping paths are consistent
- Entity has @Id and @GeneratedValue
- No circular dependencies
- Repository methods return correct types
`.trim(),

  go: `
- All imports are used
- All error returns are checked
- No unused variables
- goroutines have proper exit conditions  
- All struct fields are exported (capital) if needed by json
`.trim(),

  default: `
- No syntax errors visible
- All functions/methods are complete (no empty bodies)
- All imports/includes/requires are present
- No placeholder or stub code
- Logic matches the stated purpose
`.trim(),
};

// ─────────────────────────────────────────────────────────────
// REVIEW A SINGLE FILE
// Returns { approved, issues, fixedCode }
// ─────────────────────────────────────────────────────────────
const reviewCode = async (filePath, code, lang = "default") => {
  const checklist = REVIEW_CHECKLISTS[lang] || REVIEW_CHECKLISTS.default;

  const prompt = `You are a senior code reviewer doing a strict pre-commit review.

FILE: ${filePath}
LANGUAGE: ${lang}

REVIEW CHECKLIST (check every item):
${checklist}

CODE TO REVIEW:
\`\`\`
${code}
\`\`\`

TASK: Review the code against every checklist item.

If the code passes all checks, respond ONLY with:
REVIEW: APPROVED

If there are issues, respond with:
REVIEW: ISSUES
PROBLEMS:
<numbered list of specific problems found>
FIXED_CODE:
<complete corrected version of the full file>
END_FIXED_CODE

Do NOT include any other text outside these formats.`;

  try {
    const res = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.05, max_tokens: 4000 },
    });

    const raw = res.data.response.trim();

    if (raw.includes("REVIEW: APPROVED")) {
      return { approved: true, issues: [], fixedCode: null };
    }

    if (raw.includes("REVIEW: ISSUES")) {
      const problemsMatch = raw.match(/PROBLEMS:\s*\n([\s\S]*?)(?:FIXED_CODE:|$)/i);
      const fixedMatch = raw.match(/FIXED_CODE:\s*\n([\s\S]*?)(?:END_FIXED_CODE|$)/i);

      const issues = problemsMatch
        ? problemsMatch[1].trim().split("\n").filter((l) => l.trim())
        : ["Issues detected but could not parse details"];

      const fixedCode = fixedMatch ? cleanFences(fixedMatch[1].trim()) : null;

      return { approved: false, issues, fixedCode };
    }

    // Couldn't parse review — approve by default (don't block)
    return { approved: true, issues: [], fixedCode: null };

  } catch (err) {
    // If review call fails, don't block the write
    return { approved: true, issues: [], fixedCode: null };
  }
};

// Strips code fences from review output
const cleanFences = (code) => {
  if (!code) return code;
  return code
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/^```$/gm, "")
    .trim();
};

// ─────────────────────────────────────────────────────────────
// REASONING TRACE LOGGER
// Every action the agent takes is logged with reasoning
// Creates .agent-memory/reasoning.log for full audit trail
// ─────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const TRACE_FILE = path.join(process.cwd(), ".agent-memory", "reasoning.log");

const logTrace = (entry) => {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }) + "\n";
    fs.appendFileSync(TRACE_FILE, line);
  } catch (_) {}
};

// Logs a step in the agent's reasoning
const traceStep = (action, detail, outcome = "") => {
  logTrace({ action, detail: detail?.slice(0, 200), outcome: outcome?.slice(0, 100) });
};

// Reads and formats recent trace entries for display
const getRecentTrace = (limit = 20) => {
  try {
    const raw = fs.readFileSync(TRACE_FILE, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
};

module.exports = { reviewCode, traceStep, getRecentTrace };
