"use strict";

const fs   = require("fs");
const path = require("path");

// ── Core tools ───────────────────────────────────────────────
const { postJSON, postJSONStream }                             = require("./llm/client");
const { question, keyInYN }                                    = require("./tools/input");
const { readFile, writeFile, listFiles, runFile,
        getDiffSummary, fileExists,
        deleteFile, renameFile }                               = require("./tools/file");

// ── Knowledge ────────────────────────────────────────────────
const { getProfile, buildKnowledgeBlock, detectLangFromFile }  = require("./knowledge/lang-profiles");
const { buildPatternBlock }                                    = require("./knowledge/pattern-loader");

// ── Memory ───────────────────────────────────────────────────
const memory                                                   = require("./memory/index");
const kstore                                                   = require("./memory/knowledge-store");
const fis                                                      = require("./memory/fis");

// ── Agents ───────────────────────────────────────────────────
const { interpretPrompt, isVague, displaySpec }                = require("./agents/ceo");
const { designArchitecture, displayArchitecture, archToSteps } = require("./agents/architect");
const { runIntegrationPass }                                   = require("./agents/integrator");
const { runQAPass }                                            = require("./agents/qa");
const { runOptimizationPass }                                  = require("./agents/optimizer");
const { pickBestSolution }                                     = require("./agents/speculative");

// ── Core ─────────────────────────────────────────────────────
const { planTask, displayPlan }                                = require("./core/planner");
const { reviewCode, traceStep, getRecentTrace }                = require("./core/reviewer");
const { buildCompressedContext, logBudget }                    = require("./core/clc");
const { buildIndex }                                           = require("./core/repo-indexer");
const { getCompressedContext, logCCEStats, displayCCEInfo }    = require("./core/cce");
const { executeAndRecover, displayEREStats }                   = require("./core/ere");
const { isSafePath, enforceSafePath }                         = require("./core/fileGuard");
const { logEvent }                                            = require("./core/telemetry");
const { buildRetryPrompt, TOOL_EXAMPLES }                     = require("./config/prompts");
const { searchForFix }                                        = require("./browser/search");
const { classify }                                            = require("./core/error-classifier");
const { buildDependencyGraph }                                = require("./core/project-graph");
const { analyzeRootCause }                                    = require("./core/root-cause-analyzer");
const { formatPlanForPrompt, simulateFix }                    = require("./core/fix-planner");
const { runGuardedFix, snapshotFile, restoreSnapshot }        = require("./core/regression-guard");
const patternLearner                                          = require("./memory/pattern-learner");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL         = process.env.OLLAMA_URL    || "http://localhost:11434/api/generate";
const MODEL              = process.env.AGENT_MODEL   || "deepseek-coder:6.7b";
const FAST_MODEL         = process.env.AGENT_FAST_MODEL || MODEL;
const MAX_RETRIES        = 3;
const MAX_HISTORY        = 30;
const MAX_AGENT_TURNS    = 5;
const ENABLE_REVIEW      = process.env.AGENT_REVIEW     !== "0";
const ENABLE_SPECULATIVE = process.env.AGENT_SPECULATIVE === "1";
const ENABLE_QA          = process.env.AGENT_QA         !== "0";
const ENABLE_OPTIMIZE    = process.env.AGENT_OPTIMIZE   !== "0";
const DEBUG              = process.env.AGENT_DEBUG      === "1";
const ENABLE_STREAM      = process.env.AGENT_STREAM     !== "0";
const MAX_TOKENS         = Number(process.env.AGENT_MAX_TOKENS || 1200);
const LLM_TIMEOUT_MS     = Number(process.env.AGENT_TIMEOUT_MS || 65000);
const ALLOW_SHORT_WRITES = process.env.AGENT_ALLOW_SHORT_WRITES === "1";

// ─────────────────────────────────────────────────────────────
// SESSION STATE
// ─────────────────────────────────────────────────────────────
const history = [];
const rememberTurn = (role, content) => {
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
};
const formatHistory = () => !history.length ? "" :
  "\n\nRECENT CONVERSATION:\n" + history.slice(-6).map((t) =>
    `${t.role === "user" ? "User" : "Agent"}: ${t.content}`
  ).join("\n");

// Session context — persists between turns for follow-ups
let sessionCtx = {
  lastFile: null,
  lastError: null,
  lastOutput: null,
  lastAction: null,
  failedAttempts: 0,
  originalContent: null,
};

const resetSession = () => {
  sessionCtx = { lastFile: null, lastError: null, lastOutput: null, lastAction: null, failedAttempts: 0, originalContent: null };
};

// ─────────────────────────────────────────────────────────────
// LLM CALL
// ─────────────────────────────────────────────────────────────
const callLLM = async (prompt, systemPrompt, { tier = "NORMAL", numPredict = MAX_TOKENS, model = MODEL } = {}) => {
  let lastRaw = null;
  const temps = [0.1, 0.2, 0.35];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const userTurn = attempt === 1 ? prompt : buildRetryPrompt(prompt, attempt - 1);

    try {
      const promptText = formatHistory() + `\n\nUser: ${userTurn}\n\nRespond with ONLY valid TOOL blocks.`;
      const temperature = temps[Math.min(attempt - 1, temps.length - 1)];
      const body = {
        model,
        system: systemPrompt,
        prompt: promptText,
        stream: ENABLE_STREAM,
        options: { temperature, num_predict: numPredict },
      };

      let raw = "";
      if (ENABLE_STREAM) {
        const res = await postJSONStream(OLLAMA_URL, body, {
          timeoutMs: LLM_TIMEOUT_MS,
          onToken: (t) => { raw += t; },
          shouldStop: (buf) => parseToolBlocks(buf).length && isLikelyComplete(buf),
        });
        raw = (res.response || raw || "").trim();
      } else {
        const res = await postJSON(OLLAMA_URL, body, LLM_TIMEOUT_MS);
        raw = (res.response || "").trim();
      }

      if (DEBUG) console.log(`\n[DEBUG attempt ${attempt}]:\n${raw.slice(0, 500)}\n`);

      const ops = parseToolBlocks(raw);
      if (ops.length) return { raw, ops };

      lastRaw = raw;
      console.log(`⚠️  Attempt ${attempt}/${MAX_RETRIES}: bad format, retrying...`);
    } catch (err) {
      console.error(`❌ LLM error (attempt ${attempt}):`, err.message);
      if (attempt === MAX_RETRIES) return null;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (lastRaw) {
    const ops = parseToolBlocks(lastRaw);
    if (ops.length) return { raw: lastRaw, ops };
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────
const buildSystemPrompt = (blocks = {}, { includeExamples = true } = {}) => {
  const { langProfile, atomBlock, memoryBlock, projectBlock, patternBlock, fisBlock, readmeContent } = blocks;

  const base = `You are an elite coding agent. You write complete, production-ready code.

CRITICAL FIX BEHAVIOR:
- When fixing: Write the COMPLETE fixed file immediately using write_file. Do NOT just explain.
- "Cannot read properties of undefined" = something is undefined before you access it. Fix the access.
- NaN = a math operation received undefined/null. Trace backwards to find WHERE.
- ENOENT = file doesn't exist. Remove the dependency or create the file inline.
- After writing a fix, ALWAYS include run_file to verify.
- NEVER rewrite a file into something completely different. Fix the EXISTING code.
- NEVER add external file dependencies (like tasks.json) that don't exist.
- ALWAYS respond with write_file when asked to fix. NEVER respond with only chat.`;

  const tools = `
TOOL FORMAT — only these blocks:

TOOL: chat
MESSAGE:
<message>
END_MESSAGE

TOOL: read_file
PATH: <filepath>

TOOL: write_file
PATH: <filepath>
CONTENT:
<complete file>
END_CONTENT

TOOL: run_file
PATH: <filepath>

TOOL: list_files
TOOL: delete_file
PATH: <filepath>
TOOL: rename_file
FROM: <old>
TO: <new>
TOOL: search_web
ERROR: <error>
LANG: <language>`.trim();

  const toolSection = includeExamples && TOOL_EXAMPLES ? `${tools}\n\n${TOOL_EXAMPLES}` : tools;

  const parts = [base];
  if (readmeContent) parts.push(`CUSTOM INSTRUCTIONS:\n${readmeContent}`);
  if (patternBlock)  parts.push(patternBlock);
  if (langProfile)   parts.push(langProfile);
  if (atomBlock)     parts.push(atomBlock);
  if (fisBlock)      parts.push(fisBlock);
  if (memoryBlock)   parts.push(memoryBlock);
  if (projectBlock)  parts.push(projectBlock);

  parts.push(`RULES:
1. Read file BEFORE writing — unless brand new.
2. 100% complete code — no TODO, no placeholders, no "rest unchanged".
3. Fix root cause, not symptoms. Trace data flow.
4. ONLY TOOL blocks. No prose outside them.
5. NEVER use list_files when asked to fix/create.
6. After fixing, include run_file to verify.
7. NEVER introduce new file dependencies that don't exist.
8. NEVER write identical content back.
9. Keep the file's PURPOSE the same — don't rewrite a calculator into a task manager.
10. When asked to fix: respond with write_file FIRST, then run_file. Do NOT just explain in chat.`);

  parts.push(toolSection);
  return parts.join("\n\n");
};

// ─────────────────────────────────────────────────────────────
// DYNAMIC PROMPT
// ─────────────────────────────────────────────────────────────
const buildDynamicPrompt = (userInput, readmeContent, activeFile = null, errorContext = "", tier = "NORMAL") => {
  const content     = activeFile && fileExists(activeFile) ? readFile(activeFile) : "";
  const profile     = activeFile ? getProfile(activeFile, content) : null;
  const lang        = activeFile ? (detectLangFromFile(activeFile) || "") : "";
  const includeCtx  = tier !== "INSTANT";
  const includeFull = tier === "FULL";

  const fisBlock     = errorContext && includeCtx ? fis.buildFISBlock(errorContext, lang) : "";
  const patternBlock = includeCtx ? buildPatternBlock(lang, userInput) : "";
  const atomBlock    = includeCtx ? kstore.buildAtomBlock(userInput, lang) : "";
  const memoryBlock  = includeFull ? memory.buildMemoryBlock(lang, userInput) : "";

  let projectBlock = includeFull ? memory.buildProjectBlock() : "";
  if (includeFull) {
    try {
      const { context: cceCtx, stats } = getCompressedContext(userInput, MODEL);
      if (stats && stats.totalFiles > 0) logCCEStats(stats);
      projectBlock = cceCtx || projectBlock;
    } catch (_) {}
  }

  return buildSystemPrompt({
    langProfile:   profile && includeCtx ? buildKnowledgeBlock(profile) : "",
    atomBlock, memoryBlock, projectBlock, patternBlock, fisBlock,
    readmeContent: includeCtx ? readmeContent : "",
  }, { includeExamples: tier !== "INSTANT" });
};

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
const loadReadme = () => {
  try {
    const p = path.join(process.cwd(), "README.md");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  } catch (_) {}
  return null;
};

const cleanFences = (s) => s ? s.split("\n").filter((l) => !l.match(/^```/)).join("\n").trim() : "";

const extractFilename = (input) => {
  const patterns = [
    /(?:create|fix|read|run|delete|rename|debug|improve|update|edit)\s+(?:\w+\s+){0,2}["']?([\w\-\.\/]+\.[\w]+)["']?/i,
    /\b([\w\-\/]+\.(js|ts|py|java|go|rs|cpp|php|sh|rb|json|yaml|yml|md))\b/i,
  ];
  for (const rx of patterns) { const m = input.match(rx); if (m) return m[1]; }
  return null;
};

// ─────────────────────────────────────────────────────────────
// INTENT DETECTION v3
// ─────────────────────────────────────────────────────────────
const detectIntent = (input) => {
  const lo = input.toLowerCase().trim();

  if (/\b(output is wrong|wrong output|not (right|correct|working)|still (broken|wrong|failing|not)|NaN|undefined output|doesn'?t work|incorrect|broken)\b/i.test(lo))
    return { intent: "fix_output", confidence: 0.95 };

  if (/\b(TypeError|ReferenceError|SyntaxError|Error:|Cannot read|Cannot find|ENOENT|EACCES|node:internal|Traceback|at\s+\w+\.\w+\s+\()/i.test(lo))
    return { intent: "fix_error", confidence: 0.95 };

  if (/^(hi|hello|hey|how are you|thanks|good morning|hi there|sup)[\s!?.]*$/i.test(lo))
    return { intent: "chat", confidence: 0.9 };

  if (/\b(fix|debug|repair|solve|correct|patch)\b/i.test(lo))
    return { intent: "fix", confidence: 0.9 };

  if (/\b(run|execute|test|launch|start)\b/i.test(lo))
    return { intent: "run", confidence: 0.85 };

  if (/\b(create|build|write|implement|generate|make|scaffold|new)\b/i.test(lo))
    return { intent: "create", confidence: 0.85 };

  if (/\b(improve|optimize|refactor|clean|enhance|upgrade|modify|edit|transform|update|change|rewrite|add)\b/i.test(lo))
    return { intent: "improve", confidence: 0.8 };

  if (/\b(explain|why|review|analyze|audit|inspect)\b/i.test(lo))
    return { intent: "analysis", confidence: 0.8 };

  if (/\b(delete|remove|erase|trash|rename|move)\b/i.test(lo))
    return { intent: "file_op", confidence: 0.7 };

  return { intent: "clarify", confidence: 0.3 };
};

const detectComplexity = (input) => {
  const lo = input.toLowerCase();
  if (/\b(oauth|jwt|auth|spring boot|fastapi|kubernetes|microservice|full stack|database|schema|docker)\b/.test(lo)) return 0.9;
  if (/\b(api|server|crud|refactor|optimize|test suite)\b/.test(lo)) return 0.6;
  if (/\b(fix|bug|issue|error)\b/.test(lo)) return 0.3;
  return 0.1;
};

const classifyTask = (input) => {
  const complexity = detectComplexity(input);
  const wordCount = input.trim().split(/\s+/).length;
  if (wordCount <= 12 && complexity < 0.5) return { tier: "NORMAL", numPredict: 2000, model: FAST_MODEL, complexity };
  if (complexity > 0.6) return { tier: "FULL", numPredict: 4000, model: MODEL, complexity };
  return { tier: "NORMAL", numPredict: 3000, model: MODEL, complexity };
};

const isSolved = (s) => /^(done|fixed|good|great|perfect|ok|works?( now)?|looks good|yeah|yep|yes|sweet|correct|nice|awesome)[\s!.]*$/i.test(s.trim());
const isFollowUp = (s) => /\b(still|again|nope|wrong|more|also|fix (it|this|that)|try again|improve|update|change|add|refactor|output|doesn'?t|isn'?t|not)\b/i.test(s);

// ─────────────────────────────────────────────────────────────
// OUTPUT VALIDATOR
// ─────────────────────────────────────────────────────────────
const validateOutput = (output) => {
  const issues = [];
  if (!output || !output.trim()) issues.push("No output produced");
  if (/\bNaN\b/.test(output)) issues.push("Contains NaN — math on undefined/null");
  if (/\bundefined\b/.test(output) && !/["']undefined["']/.test(output)) issues.push("Contains 'undefined'");
  if (/\b(TypeError|ReferenceError|SyntaxError|Error:)\b/.test(output)) issues.push("Contains error messages");
  return { valid: issues.length === 0, issues };
};

// ─────────────────────────────────────────────────────────────
// CAPABILITY INTERCEPTOR
// ─────────────────────────────────────────────────────────────
const CAPS = [
  { match: /\b(what can you do|your capabilities|what are you)\b/i, ans: `I can:
  🔧 Fix bugs — run file, capture errors, trace root cause, fix & verify
  📝 Create files — complete production code in any language
  🚀 Run files — execute and validate output
  🗑️  Delete/rename files
  🔍 Analyze code
  🌐 Search web when stuck
  🧠 Remember past fixes` },
];

const interceptCapability = (input) => {
  const isQ = /\b(can you|are you able to|do you|what can|what are)\b/i.test(input);
  if (!isQ) return null;
  for (const { match, ans } of CAPS) { if (match.test(input)) return ans; }
  return null;
};

// ─────────────────────────────────────────────────────────────
// DIRECT FILE OPS
// ─────────────────────────────────────────────────────────────
const tryDirectDelete = async (input) => {
  const m = input.match(/\b(?:delete|remove|erase|trash)\s+["']?([\w\-\.\/]+\.[\w]+)["']?/i);
  if (!m) return { handled: false };
  const target = m[1];
  if (!fileExists(target)) return { handled: true, message: `❌ Not found: ${target}` };
  const ok = await keyInYN(`\n⚠️  Delete ${target}?`);
  if (!ok) return { handled: true, message: "⏭️  Cancelled." };
  const r = deleteFile(target);
  return { handled: true, message: r.success ? `🗑️  Deleted: ${target}` : `❌ ${r.message}` };
};

const tryDirectRename = async (input) => {
  const m = input.match(/\b(?:rename|move)\s+["']?([\w\-\.\/]+\.[\w]+)["']?\s+to\s+["']?([\w\-\.\/]+\.[\w]+)["']?/i);
  if (!m) return { handled: false };
  const [, from, to] = m;
  if (!fileExists(from)) return { handled: false };
  const ok = await keyInYN(`\n⚠️  Rename ${from} → ${to}?`);
  if (!ok) return { handled: true, message: "⏭️  Cancelled." };
  const r = renameFile(from, to);
  return { handled: true, message: r.success ? `✏️  ${r.message}` : `❌ ${r.message}` };
};

// ─────────────────────────────────────────────────────────────
// TOOL BLOCK PARSER
// ─────────────────────────────────────────────────────────────
const parseToolBlocks = (response) => {
  const ops = [], seen = new Set();
  const re = /^TOOL:\s*(\w+)/gm;
  let m;
  while ((m = re.exec(response)) !== null) {
    const tool = m[1].toLowerCase();
    const after = response.slice(m.index + m[0].length);

    if (tool === "chat") {
      const mm = after.match(/^\s*\nMESSAGE:\s*\n([\s\S]*?)(?:END_MESSAGE|(?=\nTOOL:)|$)/i);
      if (mm) ops.push({ tool: "chat", message: mm[1].trim() });
    } else if (tool === "list_files") {
      if (!ops.find(o => o.tool === "list_files")) ops.push({ tool: "list_files" });
    } else if (tool === "read_file") {
      const pm = after.match(/^\s*\nPATH:\s*([^\n]+)/i);
      if (pm) {
        const fp = pm[1].trim();
        if (!seen.has(`r:${fp}`)) {
          seen.add(`r:${fp}`);
          ops.push(fileExists(fp) ? { tool: "read_file", path: fp } : { tool: "chat", message: `⚠️ Not found: ${fp}` });
        }
      }
    } else if (tool === "write_file") {
      const pm = after.match(/^\s*\nPATH:\s*([^\n]+)/i);
      const cm = after.match(/\nCONTENT:\s*\n([\s\S]*?)(?:\nEND_CONTENT|(?=\nTOOL:)|$)/i);
      if (pm && cm) {
        const fp = pm[1].trim();
        if (!seen.has(`w:${fp}`)) {
          seen.add(`w:${fp}`);
          ops.push({ tool: "write_file", path: fp, content: cleanFences(cm[1].trim()) });
        }
      }
    } else if (tool === "delete_file") {
      const pm = after.match(/^\s*\nPATH:\s*([^\n]+)/i);
      if (pm) ops.push({ tool: "delete_file", path: pm[1].trim() });
    } else if (tool === "rename_file") {
      const fm = after.match(/\nFROM:\s*([^\n]+)/i);
      const tm = after.match(/\nTO:\s*([^\n]+)/i);
      if (fm && tm) ops.push({ tool: "rename_file", from: fm[1].trim(), to: tm[1].trim() });
    } else if (tool === "run_file") {
      const pm = after.match(/^\s*\nPATH:\s*([^\n]+)/i);
      if (pm) ops.push({ tool: "run_file", path: pm[1].trim() });
    } else if (tool === "search_web") {
      const em = after.match(/\nERROR:\s*([^\n]+)/i);
      const lm = after.match(/\nLANG:\s*([^\n]+)/i);
      ops.push({ tool: "search_web", error: em?.[1]?.trim() || "", lang: lm?.[1]?.trim() || "" });
    }
  }
  if (!ops.length && /^(const |function |import |def |public class |#!\/)/m.test(response))
    ops.push({ tool: "_raw_code", content: cleanFences(response) });
  return ops;
};

const isLikelyComplete = (buffer) => /END_(CONTENT|MESSAGE)\s*$/m.test(buffer.trim());

// ─────────────────────────────────────────────────────────────
// WRITE WITH REVIEW + GUARDS
// ─────────────────────────────────────────────────────────────
const writeWithReview = async (filePath, code, lang) => {
  if (!ENABLE_REVIEW) { writeFile(filePath, code); return code; }
  process.stdout.write(`   🔍 Reviewing ${path.basename(filePath)}...`);

  try {
    const { approved, issues, fixedCode } = await reviewCode(filePath, code, lang);
    if (approved) { process.stdout.write(" ✅\n"); writeFile(filePath, code); return code; }
    process.stdout.write(` ⚠️  ${issues.length} issue(s)\n`);
    issues.slice(0, 3).forEach(i => console.log(`     → ${i}`));
    const candidate = fixedCode || code;
    const ratio = candidate.length / Math.max(code.length, 1);
    const final = ratio >= 0.5 ? candidate : code;
    writeFile(filePath, final);
    return final;
  } catch (_) {
    process.stdout.write(" (review skipped)\n");
    writeFile(filePath, code);
    return code;
  }
};

// ���────────────────────────────────────────────────────────────
// SINGLE AGENT TURN
// ─────────────────────────────────────────────────────────────
const runAgentTurn = async (prompt, readmeContent, activeFile = null, errorCtx = "") => {
  const taskProfile = classifyTask(prompt);
  const sysPrompt = buildDynamicPrompt(prompt, readmeContent, activeFile, errorCtx, taskProfile.tier);
  const result = await callLLM(prompt, sysPrompt, taskProfile);
  if (!result) return { written: [], read: [], terminated: false, runError: null, runOutput: null };

  const written = [], read = [];
  let terminated = false, runError = null, runOutput = null;
  const readCounts = {};

  // Count how many ops total — used to decide if chat is terminal
  const totalOps = result.ops.length;
  const hasWriteOp = result.ops.some(op => op.tool === "write_file");

  for (const op of result.ops) {
    if (op.tool === "chat") {
      console.log(`\n🤖 ${op.message}\n`);
      // Only terminate on chat if it's the ONLY op (no write follows)
      // If LLM chatted AND wrote, don't terminate — let write happen
      if (totalOps === 1 || (!hasWriteOp && !result.ops.some(o => o.tool === "run_file"))) {
        terminated = true;
      }

    } else if (op.tool === "list_files") {
      console.log(`\n📂 Project:\n${listFiles()}\n`);
      terminated = true;

    } else if (op.tool === "read_file") {
      try { enforceSafePath(op.path); } catch (e) { console.log(`\n❌ Access denied: ${op.path}`); continue; }
      readCounts[op.path] = (readCounts[op.path] || 0) + 1;
      if (readCounts[op.path] > 2) {
        console.log(`\n⚠️  Skip redundant read of ${op.path}`);
        continue;
      }
      const content = readFile(op.path);
      console.log(`\n📖 Reading: ${op.path}`);
      read.push({ path: op.path, content });

    } else if (op.tool === "write_file") {
      try { enforceSafePath(op.path); } catch (e) { console.log(`\n❌ Write denied: ${op.path}`); continue; }
      const before = fileExists(op.path) ? readFile(op.path) : "";

      if (before && !before.startsWith("ERROR")) {
        // Skip identical writes
        if (op.content.trim() === before.trim()) {
          console.log(`\n⚠️  Skip write to ${op.path} — content identical`);
          continue;
        }

        const oldLen = before.length;
        const newLen = op.content.length;
        const ratio  = oldLen ? Math.round((newLen / oldLen) * 100) : 100;
        const ok = await keyInYN(
          `\n⚠️  ${op.path} exists (current ${oldLen} chars, new ${newLen} chars ≈ ${ratio}%). Overwrite with the agent-generated change?`
        );
        if (!ok) { console.log("⏭️  Skipped"); continue; }

        // Hallucination guard
        if (!ALLOW_SHORT_WRITES) {
          const ratio = op.content.length / before.length;
          if (ratio < 0.3) {
            console.log(`\n⚠️  Rejected write to ${op.path} — too short (${Math.round(ratio*100)}% of original)`);
            continue;
          }
          if (ratio > 5 && before.length > 100) {
            console.log(`\n⚠️  Rejected write to ${op.path} — suspiciously large (${Math.round(ratio*100)}%)`);
            continue;
          }
        }

        const hasCode = /\b(function|const|let|var|def |class |import |require|return|module\.exports)\b/.test(op.content);
        if (!hasCode && op.content.split("\n").length < 3) {
          console.log(`\n⚠️  Rejected write to ${op.path} — doesn't look like code`);
          continue;
        }
      }

      // Store original for rollback
      if (before && !sessionCtx.originalContent) {
        sessionCtx.originalContent = before;
      }

      const lang = detectLangFromFile(op.path) || "default";
      const final = await writeWithReview(op.path, op.content, lang);
      console.log(`\n✅ Written: ${op.path}  (${getDiffSummary(before, final) || "new file"})`);
      written.push(op.path);

    } else if (op.tool === "run_file") {
      try { enforceSafePath(op.path); } catch (e) { console.log(`\n❌ Run denied: ${op.path}`); continue; }
      console.log(`\n▶️  Running: ${op.path}...`);

      // Syntax check for JS
      if (op.path.endsWith('.js')) {
        try {
          require('child_process').execSync(`node -c "${op.path}"`, { stdio: 'ignore' });
        } catch (_) {
          console.log(`\n💥 Syntax Error in ${op.path}`);
          runError = { path: op.path, output: `Syntax error in ${op.path}`, lang: "js" };
          continue;
        }
      }

      const r = runFile(op.path);
      runOutput = r.output;
      if (r.success) {
        const v = validateOutput(r.output);
        if (v.valid) {
          console.log(`\n✅ Output:\n${r.output || "(no output)"}\n`);
          terminated = true;
        } else {
          console.log(`\n⚠️  Runs but output has issues:`);
          v.issues.forEach(i => console.log(`   • ${i}`));
          console.log(`   Output: ${r.output.slice(0, 200)}\n`);
          sessionCtx.lastOutput = r.output;
          sessionCtx.lastError = v.issues.join("; ");
        }
      } else {
        console.log(`\n💥 Error:\n${r.output.slice(0, 400)}\n`);
        runError = { path: op.path, output: r.output, lang: detectLangFromFile(op.path) || "" };
      }

    } else if (op.tool === "delete_file") {
      try { enforceSafePath(op.path); } catch (e) { console.log(`\n❌ Delete denied`); continue; }
      if (!fileExists(op.path)) { console.log(`\n❌ Not found: ${op.path}`); continue; }
      const ok = await keyInYN(`\n⚠️  Delete ${op.path}?`);
      if (ok) { const r = deleteFile(op.path); console.log(r.success ? `\n🗑️  ${r.message}` : `\n❌ ${r.message}`); }
      terminated = true;

    } else if (op.tool === "rename_file") {
      try { enforceSafePath(op.from); enforceSafePath(op.to); } catch (e) { console.log(`\n❌ Rename denied`); continue; }
      if (!fileExists(op.from)) { console.log(`\n⚠️  ${op.from} not found`); terminated = true; continue; }
      const ok = await keyInYN(`\n⚠️  Rename ${op.from} → ${op.to}?`);
      if (ok) { const r = renameFile(op.from, op.to); console.log(r.success ? `\n✏️  ${r.message}` : `\n❌ ${r.message}`); }
      terminated = true;

    } else if (op.tool === "search_web") {
      try {
        const r = await searchForFix(op.error, op.lang);
        if (r.found) console.log(`\n🌐 Web: ${r.query}\n`);
      } catch (_) {}
      terminated = true;

    } else if (op.tool === "_raw_code") {
      let fname = extractFilename("output") || "output.txt";
      console.log(`\n⚠️  Raw code detected, saving to ${fname}`);
      const lang = detectLangFromFile(fname) || "default";
      await writeWithReview(fname, op.content, lang);
      console.log(`\n✅ Written: ${fname}`);
      written.push(fname);
    }
  }
  return { written, read, terminated, runError, runOutput };
};

// ─────────────────────────────────────────────────────────────
// FIX PROMPT BUILDER
// For 6.7B: error → content → WRITE NOW (last instruction wins)
// ─────────────────────────────────────────────────────────────
const buildFixPrompt = (filePath, content, errorDesc, userContext = "", errorClass = null, rootReport = null, fixPlanContext = "") => {
  const parts = [];

  parts.push(`ERROR in ${filePath}:`);
  if (errorDesc) parts.push(`\`\`\`\n${errorDesc.slice(0, 500)}\n\`\`\``);
  if (errorClass) {
    const hintDetail = errorClass.detail ? ` (${errorClass.detail})` : "";
    parts.push(`DETECTED ERROR TYPE: ${errorClass.type}${hintDetail} [${Math.round((errorClass.confidence || 0)*100)}%]`);
  }
  if (rootReport && !rootReport.error) {
    const chain = (rootReport.dependencyChain || []).slice(0, 5).map(f => path.basename(f)).join(" → ");
    parts.push(`ROOT ANALYSIS: Severity=${rootReport.severity}, BlastRadius=${rootReport.blastRadius}${chain ? `, Chain: ${chain}` : ""}`);
  }
  const mergedContext = [userContext, fixPlanContext].filter(Boolean).join("\n");
  if (mergedContext) parts.push(`USER FEEDBACK: ${mergedContext}`);

  if (sessionCtx.failedAttempts > 0) {
    parts.push(`⚠️ ${sessionCtx.failedAttempts} previous fix(es) FAILED. Use a COMPLETELY DIFFERENT approach.`);
  }

  // Detect missing file errors and add specific instruction
  const missingFileMatch = (errorDesc || "").match(/(?:ENOENT|no such file)[^']*'([^']+)'/i);
  if (missingFileMatch) {
    parts.push(`⚠️ CRITICAL: The file "${missingFileMatch[1]}" does NOT exist.
DO NOT try to create it. DO NOT add try/catch around it.
REMOVE the dependency on "${missingFileMatch[1]}" entirely.
Replace it with hardcoded/inline data so the file works standalone.`);
  }

  if (sessionCtx.failedAttempts > 1) {
    parts.push(`SIMPLIFY: Remove ALL external file dependencies. Use only inline data.`);
  }

  parts.push(`\nCURRENT FILE (${filePath}):\n\`\`\`\n${content}\n\`\`\``);

  parts.push(`
FIX THIS FILE NOW. Respond with EXACTLY:

TOOL: write_file
PATH: ${filePath}
CONTENT:
<the complete fixed file — every line, no truncation>
END_CONTENT

TOOL: run_file
PATH: ${filePath}

Do NOT just explain. WRITE the complete fixed file.
Keep the same purpose. Fix the bug in-place.`);

  return parts.join("\n\n");
};

// ─────────────────────────────────────────────────────────────
// SMART FIX — The core fix flow
// 1. Run file → capture actual error
// 2. Read file content
// 3. Build rich prompt with error + full content
// 4. Send to LLM
// 5. If LLM only chats, force a second turn demanding write
// 6. Verify fix by running again
// 7. If still broken → ERE pipeline
// ─────────────────────────────────────────────────────────────
const runSmartFix = async (filePath, readmeContent, userContext = "") => {
  if (!fileExists(filePath)) {
    console.log(`\n❌ File not found: ${filePath}\n`);
    return { summaries: [`Not found: ${filePath}`], activeFile: null };
  }

  const content = readFile(filePath);
  if (content.startsWith("ERROR")) {
    console.log(`\n❌ Cannot read: ${filePath}\n`);
    return { summaries: [`Cannot read: ${filePath}`], activeFile: null };
  }

  // Save original for rollback
  if (!sessionCtx.originalContent) {
    sessionCtx.originalContent = content;
  }

  const lang = detectLangFromFile(filePath) || "";

  // Step 1: RUN the file to capture ACTUAL error
  console.log(`\n🔍 Running ${filePath} to see what happens...`);
  const runResult = runFile(filePath);

  let errorDesc = "";
  let errorClass = null;
  let rootReport = null;

  if (!runResult.success) {
    errorDesc = runResult.output;
    errorClass = classify(errorDesc, lang);
    console.log(`\n💥 Error captured:\n${errorDesc.slice(0, 300)}\n`);
    if (errorClass) console.log(`🔎 Detected: ${errorClass.type}${errorClass.detail ? ` (${errorClass.detail})` : ""}`);
  } else {
    const v = validateOutput(runResult.output);
    if (v.valid && !userContext) {
      console.log(`\n��� ${filePath} runs fine. Output:\n${runResult.output.slice(0, 300)}\n`);
      if (runResult.output.trim()) {
        console.log(`💡 If output is wrong, tell me what you expect.\n`);
      }
      sessionCtx.lastFile = filePath;
      sessionCtx.lastOutput = runResult.output;
      return { summaries: [`${filePath} runs OK`], activeFile: filePath };
    }
    const outputIssues = v.issues.join("; ");
    errorDesc = `Output wrong: ${outputIssues}\nActual: ${runResult.output.slice(0, 200)}`;
    console.log(`\n⚠️  Output issues: ${outputIssues}\n`);
  }

  sessionCtx.lastFile = filePath;
  sessionCtx.lastError = errorDesc;
  sessionCtx.lastOutput = runResult.output;
  sessionCtx.lastAction = "fix";

  // Root-cause context
  if (global.projectGraph) {
    rootReport = analyzeRootCause(global.projectGraph, filePath);
    if (rootReport && !rootReport.error) {
      console.log(`🌐 Blast radius: ${rootReport.severity} (edges ${rootReport.blastRadius})`);
    }
  }
  const sim = simulateFix({ blastRadius: rootReport?.blastRadius || 0, errorType: errorClass?.type || "" });
  const fixPlanContext = formatPlanForPrompt(rootReport, sim?.predictedRisk);

  // Step 1.5: Try pattern learner shortcut with similarity + safe rollback via regression guard
  const pattern = patternLearner.lookup(errorDesc || "");
  if (pattern && pattern.confidence >= 0.7) {
    const sim = patternLearner.fingerprintSimilarity(errorDesc || "", pattern.errorSample || pattern.key || "");
    if (sim >= 0.75) {
      console.log(`🧠 Pattern match (${(sim * 100).toFixed(0)}%): ${pattern.errorSample?.slice(0, 60) || pattern.key}`);
      const guardCtx = { file: filePath, errorType: errorClass?.type || "", blastRadius: rootReport?.blastRadius || 0 };
      const guarded = await runGuardedFix(
        guardCtx,
        async () => { writeFile(filePath, pattern.fix); return { success: true }; },
        async () => {
          const verify = runFile(filePath);
          if (!verify.success) return { success: false, output: verify.output };
          const v = validateOutput(verify.output);
          return { success: v.valid, output: verify.output };
        }
      );
      if (guarded.success) {
        console.log(`✅ Pattern fix worked — skipping LLM (risk: ${guardCtx.predictedRisk || "n/a"})`);
        patternLearner.learn(errorDesc, pattern.fix, { errorType: errorClass?.type });
        sessionCtx.failedAttempts = 0;
        sessionCtx.lastError = null;
        return { summaries: [`Pattern fix: ${filePath}`], activeFile: filePath };
      }
      console.log(`↩️  Pattern fix reverted (Regression Guard)`);
    }
  }

  // Step 2: Build fix prompt and send to LLM
  const fixPrompt = buildFixPrompt(filePath, content, errorDesc, userContext, errorClass, rootReport, fixPlanContext);
  console.log(`🔧 Fixing ${filePath}...\n`);

  const llmSnapshot = snapshotFile(filePath);
  let t = await runAgentTurn(fixPrompt, readmeContent, filePath, errorDesc);

  // Step 3: If LLM only chatted (explained but didn't write), FORCE a write
  if (t.terminated && !t.written.length && !t.runError) {
    console.log(`⚠️  LLM explained but didn't write. Forcing write...\n`);

    const forceWritePrompt = `You explained the bug. Now WRITE THE FIX. No more explanation.

TOOL: write_file
PATH: ${filePath}
CONTENT:
<complete fixed file>
END_CONTENT

TOOL: run_file
PATH: ${filePath}

Current file:
\`\`\`
${content}
\`\`\`

Error:
\`\`\`
${errorDesc.slice(0, 300)}
\`\`\`

WRITE THE COMPLETE FIXED FILE NOW. Start with "TOOL: write_file"`;

    t = await runAgentTurn(forceWritePrompt, readmeContent, filePath, errorDesc);
  }

  // Step 4: If LLM still didn't write, go straight to ERE
  if (!t.written.length && !t.runError) {
    console.log(`⚠️  LLM could not produce a fix. Trying ERE...\n`);
    const ereResult = await executeAndRecover(filePath, lang);
    if (ereResult.success) {
      console.log(`✅ ERE fixed via ${ereResult.fixSource}`);
      sessionCtx.failedAttempts = 0;
      sessionCtx.lastError = null;
      return { summaries: [`ERE fixed: ${filePath} (${ereResult.fixSource})`], activeFile: filePath };
    }
    sessionCtx.failedAttempts++;
    return { summaries: [`Could not fix: ${filePath}`], activeFile: filePath };
  }

  // Step 5: Verify the fix by running
  if (t.written.length && !t.runError) {
    console.log(`\n🧪 Verifying fix...`);
    const verify = runFile(filePath);
    if (verify.success) {
      const v = validateOutput(verify.output);
      if (v.valid) {
        console.log(`✅ Fix verified! Output:\n${verify.output.slice(0, 300)}\n`);
        sessionCtx.failedAttempts = 0;
        sessionCtx.lastError = null;
        const finalCode = readFile(filePath);
        fis.recordFailure({ lang, file: filePath, errorText: errorDesc.slice(0, 200), fix: "Agent fixed", codeAfter: finalCode.slice(0, 400), errorType: errorClass?.type });

        // Safe learn: only when output is valid and code length is reasonable
        if (verify.output !== undefined) {
          const safeToLearn = v.valid && (finalCode.length > 40) && !/Error|TypeError|ReferenceError/.test(verify.output);
          if (safeToLearn) {
            patternLearner.learn(errorDesc, finalCode, { errorType: errorClass?.type });
          }
        }
        return { summaries: [`Fixed: ${filePath}`], activeFile: filePath };
      } else {
        console.log(`⚠️  Still has issues: ${v.issues.join(", ")}`);
        console.log(`   Output: ${verify.output.slice(0, 200)}\n`);
        restoreSnapshot(filePath, llmSnapshot.content);
        sessionCtx.lastOutput = verify.output;
        sessionCtx.lastError = v.issues.join("; ");
        sessionCtx.failedAttempts++;
      }
    } else {
      console.log(`💥 Still broken:\n${verify.output.slice(0, 200)}\n`);
      restoreSnapshot(filePath, llmSnapshot.content);
      sessionCtx.lastError = verify.output;
      sessionCtx.failedAttempts++;

      // Auto-trigger ERE on post-write failure
      console.log(`⚡ ERE: Auto-recovering...`);
      const ereResult = await executeAndRecover(filePath, lang);
      if (ereResult.success) {
        console.log(`✅ ERE fixed via ${ereResult.fixSource}`);
        sessionCtx.failedAttempts = 0;
        sessionCtx.lastError = null;
        return { summaries: [`ERE fixed: ${filePath} (${ereResult.fixSource})`], activeFile: filePath };
      }
    }
  }

  // Step 6: Handle run errors from LLM's own run_file
  if (t.runError) {
    console.log(`\n⚡ ERE: Auto-recovering ${filePath}...`);
    restoreSnapshot(filePath, llmSnapshot.content);
    const ereResult = await executeAndRecover(filePath, lang);
    if (ereResult.success) {
      console.log(`✅ ERE fixed via ${ereResult.fixSource}`);
      sessionCtx.failedAttempts = 0;
      return { summaries: [`ERE fixed: ${filePath} (${ereResult.fixSource})`], activeFile: filePath };
    }
    sessionCtx.failedAttempts++;
  }

  // Step 7: Rollback after repeated failures
  if (sessionCtx.failedAttempts >= 2 && sessionCtx.originalContent) {
    console.log(`\n⚠️  ${sessionCtx.failedAttempts} failed attempts.`);
    const rollback = await keyInYN(`   Restore original file?`);
    if (rollback) {
      writeFile(filePath, sessionCtx.originalContent);
      console.log(`   ↩️  Restored original ${filePath}\n`);
      sessionCtx.failedAttempts = 0;
    }
  }

  return {
    summaries: t.written.length ? [`Fix attempted: ${filePath}`] : [`Could not fix: ${filePath}`],
    activeFile: filePath,
  };
};

// ─────────────────────────────────────────────────────────────
// FULL PIPELINE
// ─────────────────────────────────────────────────────────────
const runFullPipeline = async (userInput, readmeContent, projectContext) => {
  const allWritten = [];
  let spec = null;

  if (isVague(userInput)) {
    console.log("\n🏢 CEO Agent interpreting...");
    spec = await interpretPrompt(userInput, projectContext);
    if (spec) {
      displaySpec(spec);
      const ok = await keyInYN("Proceed?");
      if (!ok) return { summaries: ["Aborted"], activeFile: null };
    }
  }

  const task = spec?.clarifiedPrompt || userInput;
  let steps = null;
  const plan = planTask(task);

  if (plan) {
    displayPlan(plan);
    const ok = await keyInYN(`Execute ${plan.steps.length}-step plan?`);
    if (ok) steps = plan.steps;
  }

  if (!steps && (spec || task.split(" ").length > 8)) {
    console.log("\n🏗️  Architect designing...");
    const arch = await designArchitecture(spec || task, projectContext);
    if (arch) {
      displayArchitecture(arch);
      const archSteps = archToSteps(arch);
      if (archSteps.length > 1) {
        const ok = await keyInYN(`Execute ${archSteps.length}-module plan?`);
        if (ok) steps = archSteps;
      }
    }
  }

  if (steps) {
    let lastFile = null;
    for (const step of steps) {
      console.log(`\n${"─".repeat(50)}\n📌 Step ${step.id}/${steps.length}: ${step.title}\n${"─".repeat(50)}`);
      const t = await runAgentTurn(
        `${step.focus}\n\nContext: "${task}"\n${allWritten.length ? `Existing: ${allWritten.join(", ")}` : ""}\nComplete production code.`,
        readmeContent, lastFile
      );
      if (t.written.length) { allWritten.push(...t.written); lastFile = t.written[t.written.length - 1]; }
    }
  } else {
    const t = await runAgentTurn(task, readmeContent, null);
    if (t.written.length) allWritten.push(...t.written);
  }

  if (!allWritten.length) return { summaries: ["No files written"], activeFile: null };

  await runIntegrationPass(allWritten);

  if (ENABLE_QA) {
    const qa = await runQAPass(allWritten, false);
    if (qa.failed.length) {
      for (const { file, error } of qa.failed) {
        await runSmartFix(file, readmeContent, error);
      }
    }
  }

  if (ENABLE_OPTIMIZE) await runOptimizationPass(allWritten, detectLangFromFile);

  const lastFile = allWritten[allWritten.length - 1];
  console.log(`\n✨ Pipeline done! ${allWritten.length} file(s):\n  ${allWritten.join("\n  ")}\n`);
  return { summaries: [`Pipeline: ${allWritten.join(", ")}`], activeFile: lastFile };
};

// ─────────────────────────────────────────────────────────────
// STANDARD AGENT LOOP
// ─────────────────────────────────────────────────────────────
const runAgentLoop = async (userInput, readmeContent, contextFile = null) => {
  const allWritten = [];
  let lastFile = contextFile;
  let currentPrompt = userInput;

  if (contextFile && fileExists(contextFile)) {
    const content = readFile(contextFile);
    if (!content.startsWith("ERROR")) {
      currentPrompt = `"${userInput}"\nActive file: ${contextFile}\n---\n${content}\n---`;
    }
  }

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const t = await runAgentTurn(currentPrompt, readmeContent, lastFile || contextFile);

    if (t.written.length) {
      allWritten.push(...t.written);
      lastFile = t.written[t.written.length - 1];
    }

    if (t.runError) {
      const { path: errFile, lang } = t.runError;
      console.log(`\n⚡ ERE: Recovering ${errFile}...`);
      const ere = await executeAndRecover(errFile, lang);
      if (ere.success) { console.log(`   ✅ ERE: ${ere.fixSource}`); allWritten.push(errFile); lastFile = errFile; }
      else console.log(`   💀 ERE failed`);
      break;
    }

    // If agent only read files, feed content back and force a write
    if (t.read.length && !t.written.length && !t.terminated) {
      const blocks = t.read.map(r => `FILE: ${r.path}\n---\n${r.content}\n---`).join("\n\n");
      currentPrompt = `Original request: "${userInput}"\n\n${blocks}\n\nNow WRITE the code using write_file. Do NOT re-read.`;
      if (!lastFile) lastFile = t.read[0].path;
      continue;
    }

    break;
  }

  return { summaries: allWritten.length ? [`Written: ${allWritten.join(", ")}`] : ["Done"], activeFile: lastFile };
};

// ─────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────
const run = async () => {
  memory.init();
  kstore.initAtoms();
  memory.buildProjectMap();

  // Build project dependency graph once at startup
  global.projectGraph = buildDependencyGraph(process.cwd());

  const idx = buildIndex();
  console.log(`📊 Repo indexed: ${idx.totalFiles} files (${idx.updated} updated, ${idx.cached} cached)`);

  const readmeContent = loadReadme();
  const projectContext = memory.buildProjectBlock();

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  🚀  SUPERCHARGED LOCAL CODING AGENT  v7.2               ║");
  console.log("║  Smart Fix · Output Validation · Anti-Loop · Rollback    ║");
  console.log(`║  Model: ${MODEL.padEnd(52)}║`);
  console.log(`║  Review:${ENABLE_REVIEW?"ON ":"OFF"} QA:${ENABLE_QA?"ON ":"OFF"} Optimize:${ENABLE_OPTIMIZE?"ON ":"OFF"}                           ║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  let activeFile = null;

  while (true) {
    const input = await question("You: ");
    if (!input) continue;
    const lo = input.toLowerCase().trim();

    // Commands
    if (lo === "exit")    { console.log("\n👋 Bye!\n"); break; }
    if (lo === "clear")   { history.length = 0; activeFile = null; resetSession(); console.log("\n🧹 Cleared.\n"); continue; }
    if (lo === "scan")    { memory.buildProjectMap(); console.log("✅ Scanned\n"); continue; }
    if (lo === "index")   { const r = buildIndex(true); console.log(`✅ ${r.totalFiles} indexed\n`); continue; }
    if (lo === "cce")     { displayCCEInfo(); continue; }
    if (lo === "ere")     { displayEREStats(); continue; }
    if (lo === "history") { history.forEach((t, i) => console.log(`[${i+1}] ${t.role}: ${t.content.slice(0, 80)}`)); console.log(); continue; }
    if (lo === "memory")  { const a = kstore.loadAtoms(); console.log(`🧠 ${a.length} atoms\n`); continue; }
    if (lo === "atoms")   { kstore.loadAtoms().slice(-10).forEach(a => console.log(`  [${a.lang}] ${a.fact.slice(0,80)}`)); console.log(); continue; }
    if (lo === "trace")   { getRecentTrace(10).forEach(e => console.log(`  [${e.ts?.slice(11,19)}] ${e.action}: ${e.detail?.slice(0,60)}`)); console.log(); continue; }
    if (lo === "fis")     { const s = fis.getStats(); console.log(`🔴 FIS: ${s.total} patterns`); s.topErrors?.forEach(e => console.log(`  [${e.lang}] ${e.errorText?.slice(0,60)} (${e.seenCount}x)`)); console.log(); continue; }

    // Solved
    if (isSolved(input)) {
      console.log(activeFile ? `\n✨ Done with ${activeFile}!\n` : `\n✨ What's next?\n`);
      resetSession(); activeFile = null; continue;
    }

    // Capability
    const cap = interceptCapability(input);
    if (cap) { console.log(`\n${cap}\n`); rememberTurn("user", input); rememberTurn("agent", cap); continue; }

    // Direct delete/rename
    if (/\b(?:delete|remove|erase)\s+["']?[\w\-\.\/]+\.[\w]+/i.test(input)) {
      const r = await tryDirectDelete(input);
      if (r.handled) { console.log(`\n${r.message}\n`); continue; }
    }
    if (/\b(?:rename|move)\s+["']?[\w\-\.\/]+\.[\w]+["']?\s+to\s+/i.test(input)) {
      const r = await tryDirectRename(input);
      if (r.handled) { console.log(`\n${r.message}\n`); continue; }
    }

    // Intent
    const intent = detectIntent(input);
    const complexity = detectComplexity(input);

    if (DEBUG) console.log(`[DEBUG] Intent: ${intent.intent} (${intent.confidence}), Complexity: ${complexity}`);
    logEvent({ type: "input", input, intent: intent.intent });

    // If intent is unclear, ask a concise clarifying question instead of guessing.
    if (intent.intent === "clarify" || intent.confidence < 0.55) {
      const maybeFile = extractFilename(input);
      const prompt = maybeFile
        ? `Should I create, fix, or run ${maybeFile}?`
        : `Tell me what to fix/create/run. Example: "fix demo.js" or "create demo.js with hello world".`;
      console.log(`\n🤔 I didn't fully catch that. ${prompt}\n`);
      continue;
    }

    // If user said "create <file>" with no spec, request the intended content/purpose.
    if (intent.intent === "create") {
      const maybeFile = extractFilename(input);
      const lacksSpec = !/\b(with|containing|print|log|hello|function|class|template|scaffold|code|write|table|api|server|component)\b/i.test(lo);
      if (maybeFile && lacksSpec) {
        console.log(`\n🤔 You asked to create ${maybeFile}, but didn't describe the content. Tell me what it should do (e.g., "create ${maybeFile} that prints hello").\n`);
        continue;
      }
    }

    // Chat
    if (intent.intent === "chat") {
      console.log(`\n🤖 Hi! Tell me what to build, fix, or run.\n`);
      rememberTurn("user", input); rememberTurn("agent", "greeting");
      continue;
    }

    console.log("\n🤔 Thinking...\n");
    rememberTurn("user", input);
    traceStep("input", input);

    // ── FOLLOW-UP: "output is wrong", "still broken", error paste ──
    if (intent.intent === "fix_output" || intent.intent === "fix_error") {
      const targetFile = sessionCtx.lastFile || activeFile || extractFilename(input);
      if (targetFile && fileExists(targetFile)) {
        const ctx = [
          input,
          sessionCtx.lastOutput ? `Previous output: ${sessionCtx.lastOutput.slice(0, 200)}` : "",
          sessionCtx.lastError ? `Known issue: ${sessionCtx.lastError.slice(0, 200)}` : "",
          sessionCtx.failedAttempts > 0 ? `Attempt #${sessionCtx.failedAttempts + 1} — try DIFFERENT approach.` : "",
        ].filter(Boolean).join("\n");

        const { summaries, activeFile: f } = await runSmartFix(targetFile, readmeContent, ctx);
        if (f) activeFile = f;
        rememberTurn("agent", summaries.join(" | "));
        continue;
      }
      console.log(`\n🤖 Which file? (e.g., "fix demo.js")\n`);
      continue;
    }

    // ── FIX ──
if (intent.intent === "fix") {
  let targetFile = extractFilename(input);

  // If user just says "fix" or "fix it" — use session context
  if (!targetFile) {
    targetFile = sessionCtx.lastFile || activeFile;
  }

  if (targetFile && fileExists(targetFile)) {
    const { summaries, activeFile: f } = await runSmartFix(targetFile, readmeContent);

    if (f) activeFile = f;
    sessionCtx.lastFile = targetFile;

    rememberTurn("agent", summaries.join(" | "));

    if (sessionCtx.failedAttempts > 0) {
      console.log(`🤖 Fix attempted. Tell me if it's still wrong.\n`);
    } else {
      const ok = await keyInYN(`\n🤖 Fix applied. Working correctly?`);
      if (!ok) {
        console.log(`\n🤖 What's wrong? (describe expected vs actual output)\n`);
      } else {
        resetSession();
        console.log(`\n✨ Great!\n`);
      }
    }

    continue;
  } else {
    console.log(`\n🤖 Which file should I fix? (e.g., "fix demo.js")\n`);
    continue;
  }
}

    // ── RUN ──
    if (intent.intent === "run") {
      const targetFile = extractFilename(input);
      if (targetFile && fileExists(targetFile)) {
        console.log(`\n▶️  Running ${targetFile}...\n`);
        const r = runFile(targetFile);
        if (r.success) {
          const v = validateOutput(r.output);
          console.log(`✅ Output:\n${r.output || "(no output)"}\n`);
          if (!v.valid) { console.log(`⚠️  Issues: ${v.issues.join(", ")}\n`); }
          sessionCtx.lastFile = targetFile;
          sessionCtx.lastOutput = r.output;
        } else {
          console.log(`💥 Error:\n${r.output.slice(0, 400)}\n`);
          sessionCtx.lastFile = targetFile;
          sessionCtx.lastError = r.output;
          const fix = await keyInYN(`Fix it?`);
          if (fix) {
            const { activeFile: f } = await runSmartFix(targetFile, readmeContent, r.output);
            if (f) activeFile = f;
          }
        }
        rememberTurn("agent", `Ran ${targetFile}`);
        continue;
      }
    }

    // ── CREATE / COMPLEX ──
    const usePipeline = complexity > 0.6 || (intent.intent === "create" && input.split(" ").length >= 6);

    const { summaries, activeFile: newFile } = usePipeline
      ? await runFullPipeline(input, readmeContent, projectContext)
      : await runAgentLoop(input, readmeContent, isFollowUp(input) ? activeFile : null);

    if (newFile) activeFile = newFile;
    sessionCtx.lastFile = activeFile;
    rememberTurn("agent", summaries.join(" | "));
    traceStep("done", summaries.join(", "));

    // Verify output for created files
    if (activeFile && fileExists(activeFile) && activeFile.match(/\.(js|py|ts|go|rb|sh)$/)) {
      const r = runFile(activeFile);
      if (r.success) {
        const v = validateOutput(r.output);
        if (v.valid && r.output.trim()) {
          console.log(`\n✅ ${activeFile} output:\n${r.output.slice(0, 300)}\n`);
        } else if (!v.valid) {
          console.log(`\n⚠️  ${activeFile} output issues: ${v.issues.join(", ")}`);
          console.log(`   Output: ${r.output.slice(0, 200)}\n`);
        }
      }
    }

    const confirm = await keyInYN(`\n🤖 Done. Correct?`);
    if (!confirm) {
      console.log(`\n🤖 What needs to change?\n`);
    } else {
      resetSession();
      console.log(`\n✨ Done!\n`);
    }
  }
};

run().catch((err) => {
  console.error("❌ Fatal:", err.message);
  if (DEBUG) console.error(err.stack);
  process.exit(1);
});
