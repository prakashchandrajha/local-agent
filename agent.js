"use strict";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  SUPERCHARGED LOCAL CODING AGENT  v5                            ║
// ║                                                                  ║
// ║  Full Software Company Simulation:                               ║
// ║  CEO → Architect → Parallel Coders → Integrator → QA → Optim   ║
// ║                                                                  ║
// ║  + Failure Intelligence (instant recall of past fixes)          ║
// ║  + Context Compression Engine (7B works on huge repos)          ║
// ║  + Knowledge Patterns (JS / Python / Spring Boot)               ║
// ║  + Speculative Coding (multi-candidate, pick best)              ║
// ║  + Web Search Fallback                                           ║
// ║  + Persistent Memory across sessions                            ║
// ╚══════════════════════════════════════════════════════════════════╝

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

// ── Context Compression Engine ───────────────────────────────
const { buildIndex }                                           = require("./core/repo-indexer");
const { getCompressedContext, logCCEStats, displayCCEInfo }    = require("./core/cce");

// ── Execution & Recovery Engine ──────────────────────────────
const { executeAndRecover, displayEREStats }                   = require("./core/ere");

// ── File Guard & Security ────────────────────────────────────
const { isSafePath, enforceSafePath }                         = require("./core/fileGuard");

// ── Telemetry ────────────────────────────────────────────────
const { logEvent }                                            = require("./core/telemetry");

// ── Prompts ──────────────────────────────────────────────────
const { buildRetryPrompt, TOOL_EXAMPLES }                     = require("./config/prompts");

// ── Browser ──────────────────────────────────────────────────
const { searchForFix, crystallizeSolution, isOnline }         = require("./browser/search");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL         = process.env.OLLAMA_URL    || "http://localhost:11434/api/generate";
const MODEL              = process.env.AGENT_MODEL   || "deepseek-coder:6.7b";
const FAST_MODEL         = process.env.AGENT_FAST_MODEL || MODEL;
const MAX_RETRIES        = 3;
const MAX_HISTORY        = 30;
const MAX_AGENT_TURNS    = 8;
const MAX_FIX_ATTEMPTS   = 3;
const ENABLE_REVIEW      = process.env.AGENT_REVIEW     !== "0";
const ENABLE_SPECULATIVE = process.env.AGENT_SPECULATIVE === "1"; // opt-in (slower)
const ENABLE_QA          = process.env.AGENT_QA         !== "0";
const ENABLE_OPTIMIZE    = process.env.AGENT_OPTIMIZE   !== "0";
const DEBUG              = process.env.AGENT_DEBUG      === "1";
const ENABLE_STREAM      = process.env.AGENT_STREAM     !== "0";

// Keep LLM responses snappy: cap generation and enforce request timeout
const MAX_TOKENS         = Number(process.env.AGENT_MAX_TOKENS || 1200);
const LLM_TIMEOUT_MS     = Number(process.env.AGENT_TIMEOUT_MS || 65000); // align with runAgentLoop timeout

// ─────────────────────────────────────────────────────────────
// SESSION HISTORY
// ─────────────────────────────────────────────────────────────
const history = [];
const rememberTurn = (role, content) => {
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
};
const formatHistory = () => !history.length ? "" :
  "\n\nCONVERSATION HISTORY:\n" + history.map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content}`).join("\n");

// ─────────────────────────────────────────────────────────────
// LLM CALL
// ─────────────────────────────────────────────────────────────

const callLLM = async (prompt, systemPrompt, { tier = "NORMAL", numPredict = MAX_TOKENS, model = MODEL } = {}) => {
  let lastRaw  = null;
  // systemPrompt is passed in — built ONCE before this call, never rebuilt here
  const temps = [0.1, 0.2, 0.3];
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // On retry, use a concrete example prompt — not a scolding
    const userTurn = attempt === 1
      ? prompt
      : buildRetryPrompt(prompt, attempt - 1);

    try {
      const promptText = formatHistory() + `\n\nUser: ${userTurn}\n\nRespond with ONLY valid TOOL blocks.`;
      const temperature = temps[Math.min(attempt - 1, temps.length - 1)];
      const body = {
        model,
        system:  systemPrompt,   // stable — not rebuilt per attempt
        prompt:  promptText,
        stream:  ENABLE_STREAM,
        options: { temperature, num_predict: numPredict },
      };

      let raw = "";
      if (ENABLE_STREAM) {
        const res = await postJSONStream(OLLAMA_URL, body, {
          timeoutMs: LLM_TIMEOUT_MS,
          onToken: (t) => { raw += t; },
          shouldStop: (buf) => {
            const ops = parseToolBlocks(buf);
            return ops.length && isLikelyComplete(buf);
          },
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
      console.log(`⚠️  Attempt ${attempt}/${MAX_RETRIES}: bad format, retrying with example...`);

    } catch (err) {
      console.error(`❌ LLM error (attempt ${attempt}):`, err.message);
      if (attempt === MAX_RETRIES) return null;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Last-chance parse of whatever we got
  if (lastRaw) {
    const ops = parseToolBlocks(lastRaw);
    if (ops.length) return { raw: lastRaw, ops };
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────
const buildSystemPrompt = ({ langProfile, atomBlock, memoryBlock, projectBlock, patternBlock, fisBlock, readmeContent } = {}, { includeExamples = true } = {}) => {
  const base = `You are an elite coding agent — part of a full software engineering team. You write complete, production-ready code in any language. You never truncate, never use placeholders.`;

  const tools = `
TOOL FORMAT — only these blocks, nothing else:

TOOL: chat
MESSAGE:
<message>
END_MESSAGE

TOOL: list_files
TOOL: read_file
PATH: app.js
TOOL: write_file
PATH: app.js
CONTENT:
<complete code>
END_CONTENT
TOOL: delete_file
PATH: old.js
TOOL: rename_file
FROM: old.js
TO: new.js
TOOL: run_file
PATH: app.js
TOOL: search_web
ERROR: <error>
LANG: <language>`.trim();

  const toolSection = includeExamples && TOOL_EXAMPLES
    ? `${tools}\n\n${TOOL_EXAMPLES}`
    : tools;

  // Context blocks injected BEFORE rules — rules stay freshest in model memory
  const parts = [base];
  if (readmeContent) parts.push(`CUSTOM INSTRUCTIONS:\n${readmeContent}`);
  if (patternBlock)  parts.push(patternBlock);
  if (langProfile)   parts.push(langProfile);
  if (atomBlock)     parts.push(atomBlock);
  if (fisBlock)      parts.push(fisBlock);
  if (memoryBlock)   parts.push(memoryBlock);
  if (projectBlock)  parts.push(projectBlock);

  // RULES always second-to-last, TOOL FORMAT always last
  // Small models follow the most recent instruction — put format last
  parts.push(`RULES:
1. Read file BEFORE writing it (unless brand new).
2. 100% complete code — no truncation, no TODO, no placeholders.
3. Fix ALL errors in one pass.
4. Respond using ONLY TOOL blocks. No prose outside them.
5. NEVER use list_files when the user asked you to create or write something.
6. Write multi-file dependencies in order: imports first.
7. NEVER use placeholder paths like 'path/to/file' — use actual project paths.`);

  parts.push(toolSection);

  return parts.join("\n\n");
};

// ─────────────────────────────────────────────────────────────
// DYNAMIC PROMPT (v2 — with Context Compression Engine)
// ─────────────────────────────────────────────────────────────

const buildDynamicPrompt = (userInput, readmeContent, activeFile = null, errorContext = "", tier = "NORMAL") => {
  const content     = activeFile && fileExists(activeFile) ? readFile(activeFile) : "";
  const profile     = activeFile ? getProfile(activeFile, content) : null;
  const lang        = activeFile ? (detectLangFromFile(activeFile) || "") : "";
  const includeMem  = tier === "FULL";
  const includeProj = tier === "FULL";
  const includeCtx  = tier !== "INSTANT";

  const fisBlock    = errorContext && tier !== "INSTANT" ? fis.buildFISBlock(errorContext, lang) : "";
  const patternBlock = includeCtx ? buildPatternBlock(lang, userInput) : "";
  const atomBlock    = includeCtx ? kstore.buildAtomBlock(userInput, lang) : "";
  const memoryBlock  = includeMem ? memory.buildMemoryBlock(lang, userInput) : "";

  let projectBlock = includeProj ? memory.buildProjectBlock() : "";
  if (includeProj) {
    const { context: cceContext, stats: cceStats } = getCompressedContext(userInput, MODEL);
    if (cceStats && cceStats.totalFiles > 0) logCCEStats(cceStats);
    projectBlock = cceContext || projectBlock;
  }

  // Build ONCE — this result is passed to callLLM and reused
  // for ALL retry attempts without rebuilding
  return buildSystemPrompt({
    langProfile:   profile && includeCtx ? buildKnowledgeBlock(profile) : "",
    atomBlock,
    memoryBlock,
    projectBlock,
    patternBlock,
    fisBlock,
    readmeContent: includeCtx ? readmeContent : "",
  }, { includeExamples: tier !== "INSTANT" });
};

// ─────────────────────────────────────────────────────────────
// README LOADER
// ─────────────────────────────────────────────────────────────
const loadReadme = () => {
  try { const p = path.join(process.cwd(), "README.md"); if (fs.existsSync(p)) return fs.readFileSync(p, "utf8"); } catch (_) {}
  return null;
};

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
const cleanFences = (s) => s ? s.split("\n").filter((l) => !l.match(/^```/)).join("\n").trim() : "";

const extractFilename = (input) => {
  const p = [ /(?:create|fix|read|run|delete|rename)\s+(?:\w+\s+){0,2}["']?([\w\-\.\/]+\.[\w]+)["']?/i,
               /\b([\w\-\/]+\.(js|ts|py|java|go|rs|cpp|php|sh|rb|kt|cs|json|yaml|yml|md))\b/i ];
  for (const rx of p) { const m = input.match(rx); if (m) return m[1]; }
  return null;
};

const detectIntent = (input) => {
  const lo = input.toLowerCase();
  
  const chat = /\b(hi|hello|hey|how are you|thanks|good morning|hi there)\b/;
const coding = /\b(create|build|write|fix|implement|generate|make|scaffold|new|add|convert|change|update|rewrite)\b/;
  const analysis = /\b(explain|why|review|analyze|audit|inspect|debug)\b/;
  const fileOp = /\b(run|execute|test|launch|delete|remove|erase|trash|rename|move)\b/;
const improve = /\b(improve|optimize|refactor|clean|enhance|upgrade|modify|edit|transform)\b/;

  let intent = "clarify";
  let confidence = 0.3;

  if (chat.test(lo)) { intent = "chat"; confidence = 0.9; }
  else if (coding.test(lo)) { intent = "coding_task"; confidence = 0.85; }
  else if (analysis.test(lo)) { intent = "analysis"; confidence = 0.8; }
  else if (improve.test(lo)) { intent = "improve"; confidence = 0.8; }
  else if (fileOp.test(lo)) { intent = "file_op"; confidence = 0.7; }
  else if (/\b(fixed|done|works)\b/.test(lo)) { intent = "chat"; confidence = 0.6; }

  return { intent, confidence };
};

const detectComplexity = (input) => {
  const lo = input.toLowerCase();
  let complexity = 0.1; // Default low complexity
  
  if (/\b(oauth|jwt|auth|spring boot|fastapi|kubernetes|microservice|architecture|full stack|database|schema|migration|docker)\b/.test(lo)) {
    complexity = 0.9;
  } else if (/\b(api|server|crud|refactor|optimize|test suite)\b/.test(lo)) {
    complexity = 0.6;
  } else if (/\b(fix|bug|issue|error|broken)\b/.test(lo)) {
    complexity = 0.4;
  }
  
  return Object.assign(Number(complexity.toFixed(1)), {
      value: complexity
  }).value;
};

const classifyTask = (input) => {
  const lo        = input.toLowerCase();
  const wordCount = input.trim().split(/\s+/).length;
  const complexRx = /(server|api|auth|crud|pipeline|architect|architecture|database|docker|kubernetes|microservice|full stack|graphql|queue|kafka)/i;
  const complexity = detectComplexity(input);

  if (wordCount <= 12 && !complexRx.test(lo)) {
    return { tier: "INSTANT", numPredict: 1500, model: FAST_MODEL, complexity };
  }
  if (complexity > 0.6 || complexRx.test(lo)) {
    return { tier: "FULL", numPredict: 4000, model: MODEL, complexity };
  }
  return { tier: "NORMAL", numPredict: 3000, model: MODEL, complexity };
};

const isSolved   = (s) => /\b(done|fixed|good|great|perfect|ok|works?( now)?|looks good|yeah|sweet|correct)\b/i.test(s);
const isFollowUp = (s) => /\b(still|again|not yet|nope|wrong|more|also|fix (it|this|that)|try again|improve|update|change|add|refactor)\b/i.test(s);

// ─────────────────────────────────────────────────────────────
// CAPABILITY INTERCEPTOR
// ─────────────────────────────────────────────────────────────
const CAPS = [
  { match: /\b(delete|remove|erase)\s+(a\s+)?(file|files|it)\b/i,          ans: "✅ Yes — delete files. Say: \"delete filename.js\"" },
  { match: /\b(rename|move)\s+(a\s+)?(file|files|it)\b/i,                  ans: "✅ Yes — rename/move files. Say: \"rename old.js to new.js\"" },
  { match: /\b(fix|debug)\s+(error|bug|code|issue)\b/i,                    ans: "✅ Yes — read + analyze + fix. Auto-retries 3x then searches web." },
  { match: /\b(search|look).*(web|online|stackoverflow)\b/i,               ans: "✅ Yes — Stack Overflow + DuckDuckGo when stuck locally." },
  { match: /\b(remember|memory|learn)\b/i,                                 ans: "✅ Yes — persistent memory: fix history, knowledge atoms, failure patterns." },
  { match: /\b(what can you do|your capabilities|what are you)\b/i,        ans: `Full Software Company pipeline:
  🏢 CEO Agent    — interprets vague prompts into specs
  🏗️  Architect   — designs system before coding starts
  ⚡ Coders       — parallel module generation
  🔗 Integrator   — fixes cross-file import/signature mismatches
  🧪 QA Agent     — runs code, generates tests
  🚀 Optimizer    — performance + refactoring pass
  🎲 Speculative  — generates multiple candidates, picks best
  🧠 FIS Memory   — instant recall of past error fixes
  📚 Patterns     — injects JS/Python/Spring Boot framework patterns
  🌐 Web Search   — Stack Overflow fallback when stuck` },
];

const interceptCapability = (input) => {
  const isQ = /\b(can you|are you able to|do you|do you support|is it possible|will you)\b/i.test(input);
  if (!isQ) return null;
  for (const { match, ans } of CAPS) { if (match.test(input)) return ans; }
  return null;
};

// ─────────────────────────────────────────────────────────────
// DIRECT FILE OP INTERCEPTORS
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
  // Match: rename/move X to Y  OR  change X to Y (when both are filenames)
  const m = input.match(/\b(?:rename|move|change|convert)\s+["']?([\w\-\.\/]+\.[\w]+)["']?\s+to\s+["']?([\w\-\.\/]+\.[\w]+)["']?/i);
  if (!m) return { handled: false };
  const [, from, to] = m;
  // Only handle if source file actually exists — otherwise let LLM handle it
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
  const re  = /^TOOL:\s*(\w+)/gm;
  let m;
  while ((m = re.exec(response)) !== null) {
    const tool  = m[1].toLowerCase();
    const after = response.slice(m.index + m[0].length);

    if (tool === "chat") {
      const mm = after.match(/^\s*\nMESSAGE:\s*\n([\s\S]*?)(?:END_MESSAGE|(?=\nTOOL:)|$)/i);
      if (mm) ops.push({ tool: "chat", message: mm[1].trim() });
    } else if (tool === "list_files") {
      if (!ops.find((o) => o.tool === "list_files")) ops.push({ tool: "list_files" });
    } else if (tool === "read_file") {
      const pm = after.match(/^\s*\nPATH:\s*([^\n]+)/i);
      if (pm) { const fp = pm[1].trim(); if (!seen.has(`r:${fp}`)) { seen.add(`r:${fp}`); ops.push(fileExists(fp) ? { tool: "read_file", path: fp } : { tool: "chat", message: `⚠️ Not found: ${fp}` }); } }
    } else if (tool === "write_file") {
      const pm = after.match(/^\s*\nPATH:\s*([^\n]+)/i);
      const cm = after.match(/\nCONTENT:\s*\n([\s\S]*?)(?:\nEND_CONTENT|(?=\nTOOL:)|$)/i);
      if (pm && cm) { const fp = pm[1].trim(); if (!seen.has(`w:${fp}`)) { seen.add(`w:${fp}`); ops.push({ tool: "write_file", path: fp, content: cleanFences(cm[1].trim()) }); } }
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
// WRITE WITH OPTIONAL SELF-REVIEW
// Keeps original as backup — restores if review output looks wrong
// ─────────────────────────────────────────────────────────────
const writeWithReview = async (filePath, code, lang) => {
  if (!ENABLE_REVIEW) { writeFile(filePath, code); return code; }
  process.stdout.write(`   🔍 Reviewing ${path.basename(filePath)}...`);
  const { approved, issues, fixedCode } = await reviewCode(filePath, code, lang);
  if (approved) { process.stdout.write(" ✅\n"); writeFile(filePath, code); return code; }
  process.stdout.write(` ⚠️  ${issues.length} issue(s) — auto-fixed\n`);
  issues.slice(0, 3).forEach((i) => console.log(`     → ${i}`));

  const candidate = fixedCode || code;
  // Safety: reviewer must not shrink file to less than 60% — fall back to original code
  const ratio = candidate.length / code.length;
  const final = ratio >= 0.6 ? candidate : code;
  if (ratio < 0.6) console.log(`     ⚠️  Reviewer output too short — using original`);
  writeFile(filePath, final);
  return final;
};

// ─────────────────────────────────────────────────────────────
// SINGLE AGENT TURN
// ─────────────────────────────────────────────────────────────
const runAgentTurn = async (prompt, readmeContent, activeFile = null, errorCtx = "") => {
  const taskProfile = classifyTask(prompt);
  const sysPrompt   = buildDynamicPrompt(prompt, readmeContent, activeFile, errorCtx, taskProfile.tier);
  const result      = await callLLM(prompt, sysPrompt, taskProfile);
  if (!result) return { written: [], read: [], terminated: false, runError: null };

  const written = [], read = [];
  let terminated = false, runError = null;

  for (const op of result.ops) {
    if (op.tool === "chat") {
      console.log(`\n🤖 ${op.message}\n`); terminated = true;

    } else if (op.tool === "list_files") {
      console.log(`\n📂 Project:\n${listFiles()}\n`); terminated = true;

    } else if (op.tool === "read_file") {
      try { enforceSafePath(op.path); } catch (e) {
        console.log(`\n❌ Access denied: ${op.path}`);
        read.push({ path: op.path, content: "ERROR: Access denied by File Guard." });
        continue;
      }
      const content = readFile(op.path);
      console.log(`\n📖 Reading: ${op.path}`);
      read.push({ path: op.path, content });
      kstore.updateGraph(op.path, content);

    } else if (op.tool === "write_file") {
      try { enforceSafePath(op.path); } catch (e) {
        console.log(`\n❌ Write denied: ${op.path}`); continue;
      }
      const before = fileExists(op.path) ? readFile(op.path) : "";
      if (before && !before.startsWith("ERROR")) {
        const ok = await keyInYN(`\n⚠️  ${op.path} exists. Overwrite?`);
        if (!ok) { console.log("⏭️  Skipped"); continue; }

        // HALLUCINATION GUARD — protect existing files from being wiped
        // If new content is less than 60% of original length, LLM truncated — reject
        const ratio = op.content.length / before.length;
        if (ratio < 0.6) {
          console.log(`\n⚠️  Write rejected for ${op.path} — LLM output too short (${Math.round(ratio*100)}% of original). File preserved.`);
          continue;
        }
        // Reject if output has no code signals (pure prose hallucination)
        const hasCode = /\b(function|const|let|var|def |class |import |require|return|if |for )\b/.test(op.content);
        if (!hasCode && op.content.split("\n").length < 5) {
          console.log(`\n⚠️  Write rejected for ${op.path} — output looks like prose, not code. File preserved.`);
          continue;
        }
      }

      const lang  = detectLangFromFile(op.path) || "default";
      let   code  = op.content;

      // Speculative coding for new files (opt-in)
      if (ENABLE_SPECULATIVE && !before) {
        const existingFiles = {};
        written.forEach((fp) => { if (fileExists(fp)) existingFiles[fp] = readFile(fp); });
        const better = await pickBestSolution(prompt, op.path, lang, existingFiles);
        if (better) code = better;
      }

      const final = await writeWithReview(op.path, code, lang);
      console.log(`\n✅ Written: ${op.path}  (${getDiffSummary(before, final) || "new file"})`);
      written.push(op.path);
      kstore.updateGraph(op.path, final);

    } else if (op.tool === "delete_file") {
      try { enforceSafePath(op.path); } catch (e) {
        console.log(`\n❌ Delete denied: ${op.path}`); continue;
      }
      if (!fileExists(op.path)) { console.log(`\n❌ Not found: ${op.path}`); continue; }
      const ok = await keyInYN(`\n⚠️  Delete ${op.path}?`);
      if (ok) { const r = deleteFile(op.path); console.log(r.success ? `\n🗑️  ${r.message}` : `\n❌ ${r.message}`); }
      terminated = true;

    } else if (op.tool === "rename_file") {
      try { enforceSafePath(op.from); enforceSafePath(op.to); } catch (e) {
        console.log(`\n❌ Rename denied.`); continue;
      }
      // Guard: if source no longer exists (already renamed by direct interceptor), skip
      if (!fileExists(op.from)) {
        console.log(`\n⚠️  Skipped rename — ${op.from} not found (already renamed?)`);
        terminated = true;
        continue;
      }
      const ok = await keyInYN(`\n⚠️  Rename ${op.from} → ${op.to}?`);
      if (ok) { const r = renameFile(op.from, op.to); console.log(r.success ? `\n✏️  ${r.message}` : `\n❌ ${r.message}`); }
      terminated = true;

    } else if (op.tool === "run_file") {
      try { enforceSafePath(op.path); } catch (e) {
        console.log(`\n❌ Run denied: ${op.path}`); continue;
      }
      console.log(`\n▶️  Running: ${op.path}...`);
      
      // Static Validation for JS
      if (op.path.endsWith('.js')) {
        const { execSync } = require('child_process');
        try {
          execSync(`node -c ${op.path}`, { stdio: 'ignore' });
        } catch (syntaxErr) {
          console.log(`\n💥 Syntax Error (Static Check Failed)`);
          const r = { success: false, output: `Syntax Error: node -c check failed for ${op.path}. Please fix syntax structure before trying to execute logic.` };
          const lang = detectLangFromFile(op.path) || "";
          runError = { path: op.path, output: r.output, lang };
          return { written, read, terminated: false, runError };
        }
      }

      const r = runFile(op.path);
      if (r.success) { console.log(`\n✅ Output:\n${r.output || "(no output)"}\n`); terminated = true; }
      else {
        console.log(`\n💥 Error:\n${r.output}\n`);
        const lang = detectLangFromFile(op.path) || "";
        if (lang) memory.recordPattern(lang, r.output);
        runError = { path: op.path, output: r.output, lang };
        return { written, read, terminated: false, runError };
      }

    } else if (op.tool === "search_web") {
      const r = await searchForFix(op.error, op.lang);
      if (r.found) console.log(`\n🌐 Web context: ${r.query}\n`);
      terminated = true;

    } else if (op.tool === "_raw_code") {
      let fname = extractFilename("output");
      if (!fname) {
         fname = "output.txt";
         console.log(`\n⚠️  Model generated code without a target file.`);
         const providedName = await question(`   Where should this be saved? (Press Enter for output.txt): `);
         if (providedName.trim()) fname = providedName.trim();
      }
      const lang  = detectLangFromFile(fname) || "default";
      await writeWithReview(fname, op.content, lang);
      console.log(`\n✅ Written: ${fname}`); written.push(fname);
    }
  }
  return { written, read, terminated, runError };
};

// ─────────────────────────────────────────────────────────────
// FULL PIPELINE EXECUTOR
// CEO → Architect → Sequential Step Coders → Integration → QA → Optim
// ─────────────────────────────────────────────────────────────
const runFullPipeline = async (userInput, readmeContent, projectContext) => {
  const allWritten = [];

  // ── STAGE 1: CEO — interpret vague prompt ─────────────────
  let spec = null;
  if (isVague(userInput)) {
    console.log("\n🏢 CEO Agent interpreting prompt...");
    spec = await interpretPrompt(userInput, projectContext);
    if (spec) {
      displaySpec(spec);
      const ok = await keyInYN("Proceed with this spec?");
      if (!ok) { console.log("⏭️  Aborted.\n"); return { summaries: ["Aborted"], activeFile: null }; }
    }
  }

  const task = spec?.clarifiedPrompt || userInput;

  // ── STAGE 2: ARCHITECT — design system ────────────────────
  let steps = null;
  const plan = planTask(task);

  if (plan) {
    displayPlan(plan);
    const ok = await keyInYN(`Execute ${plan.steps.length}-step plan?`);
    if (ok) steps = plan.steps;
  }

  if (!steps) {
    // Ask architect for complex tasks
    if (spec || task.split(" ").length > 8) {
      console.log("\n🏗️  Architect Agent designing system...");
      const arch = await designArchitecture(spec || task, projectContext);
      if (arch) {
        displayArchitecture(arch);
        const archSteps = archToSteps(arch);
        if (archSteps.length > 1) {
          const ok = await keyInYN(`Execute ${archSteps.length}-module architecture?`);
          if (ok) steps = archSteps;
        }
      }
    }
  }

  // ── STAGE 3: CODE — execute steps or single shot ──────────
  if (steps) {
    let lastFile = null;
    for (const step of steps) {
      console.log(`\n${"─".repeat(52)}\n📌 Step ${step.id}/${steps.length}: ${step.title}\n${"─".repeat(52)}`);
      const stepPrompt =
        `${step.focus}\n\nTask context: "${task}"\n` +
        (allWritten.length ? `Files so far: ${allWritten.join(", ")}\n` : "") +
        `Write 100% complete production code.`;
      const t = await runAgentTurn(stepPrompt, readmeContent, lastFile);
      if (t.written.length) { allWritten.push(...t.written); lastFile = t.written[t.written.length - 1]; }
      traceStep(`step-${step.id}`, step.title, t.written.join(", ") || "no write");
    }
  } else {
    // Single-shot
    const t = await runAgentTurn(task, readmeContent, null);
    if (t.written.length) allWritten.push(...t.written);
  }

  if (!allWritten.length) return { summaries: ["No files written"], activeFile: null };

  // ── STAGE 4: INTEGRATION — cross-file check ───────────────
  await runIntegrationPass(allWritten);

  // ── STAGE 5: QA — run + generate tests ────────────────────
  if (ENABLE_QA) {
    const qaResults = await runQAPass(allWritten, false);
    if (qaResults.failed.length) {
      console.log(`\n🔧 QA found ${qaResults.failed.length} failure(s), fixing...`);
      for (const { file, error } of qaResults.failed) {
        const lang  = detectLangFromFile(file) || "";
        const known = fis.buildFISBlock(error, lang);
        const content = readFile(file);
        const fixPrompt =
          `${file} failed:\n\`\`\`\n${error}\n\`\`\`\n` +
          (known ? `\n${known}\n\n` : "") +
          `File:\n---\n${content}\n---\nFix completely.`;
        const fixTurn = await runAgentTurn(fixPrompt, readmeContent, file, error);
        if (fixTurn.written.length) {
          fis.recordFailure({ lang, file, errorText: error, fix: `Fixed by agent`, codeAfter: readFile(file) });
        }
      }
    }
  }

  // ── STAGE 6: OPTIMIZE ─────────────────────────────────────
  if (ENABLE_OPTIMIZE) {
    await runOptimizationPass(allWritten, detectLangFromFile);
  }

  const lastFile = allWritten[allWritten.length - 1];
  console.log(`\n✨ Pipeline complete! ${allWritten.length} file(s) written:\n  ${allWritten.join("\n  ")}\n`);
  return { summaries: [`Pipeline: ${allWritten.join(", ")}`], activeFile: lastFile };
};

// ─────────────────────────────────────────────────────────────
// STANDARD AGENT LOOP (for non-pipeline tasks)
// ─────────────────────────────────────────────────────────────
const runAgentLoop = async (userInput, readmeContent, contextFile = null, taskContext = {}) => {
  const intentObj  = detectIntent(userInput);
  const intent     = intentObj.intent;
  const complexity = detectComplexity(userInput);
  
  const allWritten = taskContext.files ? Object.keys(taskContext.files) : [];
  let lastFile     = contextFile;
  let fixAttempts  = 0;

  // Dynamic Speculative threshold — kicks in at medium complexity
  const useSpeculative = ENABLE_SPECULATIVE || complexity > 0.4;

  let currentPrompt = userInput;
  if (contextFile && fileExists(contextFile)) {
    const content = readFile(contextFile);
    if (!content.startsWith("ERROR")) {
      currentPrompt = `Request: "${userInput}"\nActive: ${contextFile}\nContent:\n---\n${content}\n---\nComplete directly.`;
    }
  }

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    // Inject error context for retry
    if (taskContext.failures && taskContext.failures.length > 0) {
       const lastError = taskContext.failures[taskContext.failures.length - 1];
       currentPrompt += `\n\nPREVIOUS ERROR:\n${lastError}`;
    }

    // Timeout protection for runAgentTurn
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000); // 1 minute timeout
    
    let t;
    try {
      t = await runAgentTurn(currentPrompt, readmeContent, lastFile || contextFile);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log(`\n⏱️ Execution timeout reached. Recovering...`);
        t = { written: [], read: [], terminated: true, runError: null };
      } else {
        throw err;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (t.written && t.written.length) {
      allWritten.push(...t.written);
      lastFile = t.written[t.written.length - 1];
      if (taskContext.files) {
        t.written.forEach(f => taskContext.files[f] = true);
      }
      if (intent === "fix" || intent === "improve") {
        const lang = detectLangFromFile(lastFile) || "unknown";
        memory.recordFix({ file: lastFile, lang, errorType: intent, description: userInput.slice(0, 150) });
      }
    }

    if (t.runError) {
      // ── ERE: Unified execution + recovery pipeline ──
      const { path: errFile, lang } = t.runError;
      console.log(`\n⚡ ERE: Auto-recovering ${errFile}...`);
      const ereResult = await executeAndRecover(errFile, lang);

      if (ereResult.success) {
        allWritten.push(errFile);
        lastFile = errFile;
        memory.recordFix({ file: errFile, lang, errorType: "auto-fix", description: `ERE: ${ereResult.fixSource} (${ereResult.attempts} attempts)` });
        console.log(`   ✅ ERE recovered via ${ereResult.fixSource} in ${ereResult.attempts} attempt(s)`);
      } else {
        console.log(`   💀 ERE: Could not recover. Error: ${ereResult.error?.split("\n")[0]?.slice(0, 80)}`);
        if (taskContext.failures) taskContext.failures.push(ereResult.error);
      }
      return { summaries: [`ERE: ${ereResult.fixSource} (${ereResult.attempts} attempts)`], activeFile: lastFile };
    }

    if (t.read && t.read.length) {
      const blocks  = t.read.map((r) => `FILE: ${r.path}\n---\n${r.content}\n---`).join("\n\n");
      currentPrompt = `Original: "${userInput}"\n\n${blocks}\n\nComplete with write_file or chat.`;
      if (!lastFile) lastFile = t.read[0].path;
      continue;
    }

    if (t.terminated || (t.written && t.written.length)) break;
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

  // CCE: Build repo index on startup
  const indexResult = buildIndex();
  console.log(`📊 Repo indexed: ${indexResult.totalFiles} files (${indexResult.updated} updated, ${indexResult.cached} cached)`);

  const readmeContent = loadReadme();
  const projectContext = memory.buildProjectBlock();

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  🚀  SUPERCHARGED LOCAL CODING AGENT  v6                  ║");
  console.log("║  CEO · Architect · Coders · Integrator · QA · Optimizer   ║");
  console.log("║  + Context Compression Engine (CCE)                       ║");
  console.log("║  + Execution & Recovery Engine (ERE)                      ║");
  console.log(`║  Model: ${MODEL.padEnd(52)}║`);
  console.log(`║  Review:${ENABLE_REVIEW?"ON ":"OFF"} Speculative:${ENABLE_SPECULATIVE?"ON ":"OFF"} QA:${ENABLE_QA?"ON ":"OFF"} Optimize:${ENABLE_OPTIMIZE?"ON ":"OFF"}        ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n  exit · history · clear · memory · atoms · trace · scan · fis · index · cce · ere\n");

  let activeFile = null;
  
  // Task Context Memory
  let globalTaskContext = { history: [], files: {}, failures: [] };

  while (true) {
    const input = await question("You: ");
    if (!input) continue;
    const lo = input.toLowerCase().trim();

    if (lo === "exit")    { console.log("\n👋 Bye!\n"); break; }
    if (lo === "clear")   { history.length = 0; activeFile = null; globalTaskContext = { history: [], files: {}, failures: [] }; console.log("\n🧹 Cleared.\n"); continue; }
    if (lo === "scan")    { const m = memory.buildProjectMap(); console.log(`\n✅ ${m.totalFiles} files mapped\n`); continue; }
    if (lo === "index")   { const r = buildIndex(true); console.log(`\n✅ ${r.totalFiles} files indexed (${r.updated} updated)\n`); continue; }
    if (lo === "cce")     { displayCCEInfo(); continue; }
    if (lo === "ere")     { displayEREStats(); continue; }

    if (lo === "history") {
      history.forEach((t, i) => console.log(`[${String(i+1).padStart(2)}] ${t.role==="user"?"You  ":"Agent"}: ${t.content.slice(0, 80)}`));
      console.log(); continue;
    }
    if (lo === "memory") {
      const atoms = kstore.loadAtoms(); const pats = memory.getTopPatterns("", 5);
      console.log(`\n🧠 ${atoms.length} atoms | fix history available`);
      pats.forEach((p) => console.log(`   • [${p.lang}] ${p.errorSnippet?.slice(0,50)} (${p.count}x)`));
      console.log(); continue;
    }
    if (lo === "atoms") {
      kstore.loadAtoms().slice(-12).forEach((a) => console.log(`  [${a.lang}] ${a.fact.slice(0, 80)}`));
      console.log(); continue;
    }
    if (lo === "trace") {
      getRecentTrace(10).forEach((e) => console.log(`  [${e.ts?.slice(11,19)}] ${e.action}: ${e.detail?.slice(0,60)}`));
      console.log(); continue;
    }
    if (lo === "fis") {
      const stats = fis.getStats();
      console.log(`\n🔴 Failure Intelligence: ${stats.total} patterns stored`);
      stats.topErrors?.forEach((e) => console.log(`   • [${e.lang}] ${e.errorText?.slice(0,60)} (${e.seenCount}x)`));
      console.log(); continue;
    }

    if (activeFile && isSolved(input)) {
      console.log(`\n✨ Done with ${activeFile}.\n`);
      rememberTurn("user", input); rememberTurn("agent", `Finished ${activeFile}`);
      activeFile = null; continue;
    }

    // Capability question
    const capAns = interceptCapability(input);
    if (capAns) { console.log(`\n${capAns}\n`); rememberTurn("user", input); rememberTurn("agent", capAns); continue; }

    // Direct delete/rename
    if (/\b(?:delete|remove|erase)\s+["']?[\w\-\.\/]+\.[\w]+/i.test(input)) {
      const r = await tryDirectDelete(input);
      if (r.handled) { console.log(`\n${r.message}\n`); rememberTurn("user", input); rememberTurn("agent", r.message); continue; }
    }
    if (/\b(?:rename|move|change|convert)\s+["']?[\w\-\.\/]+\.[\w]+["']?\s+to\s+["']?[\w\-\.\/]+\.[\w]+/i.test(input)) {
      const r = await tryDirectRename(input);
      if (r.handled) { console.log(`\n${r.message}\n`); rememberTurn("user", input); rememberTurn("agent", r.message); continue; }
    }

    // Intent Classifier & Task Planner
    const intentData = detectIntent(input);
    const complexity = detectComplexity(input);
    
    // Telemetry
    if (DEBUG) console.log(`[TELEMETRY] Intent: ${intentData.intent} (${intentData.confidence.toFixed(2)}), Complexity: ${complexity}`);
    logEvent({ timestamp: new Date().toISOString(), type: "user_input", input, intent: intentData.intent, confidence: intentData.confidence, complexity });

   if (intentData.intent === "chat") {
  console.log(`\n🤖 Hello! What would you like me to build?\n`);
  rememberTurn("user", input);
  rememberTurn("agent", "Chat");
  continue;
}

    console.log("\n🤔 Thinking...\n");
    rememberTurn("user", input);
    traceStep("input", input);
    
    globalTaskContext.history.push({ input, intent: intentData });

    const usePipeline = (intentData.intent === "create" && input.split(" ").length >= 4) || complexity > 0.6;
    
    logEvent({ type: "task_start", input, usePipeline, complexity });
    
    const { summaries, activeFile: newFile } = usePipeline
      ? await runFullPipeline(input, readmeContent, projectContext)
      : await runAgentLoop(input, readmeContent, isFollowUp(input) ? activeFile : null, globalTaskContext);

    if (newFile) activeFile = newFile;
    rememberTurn("agent", summaries.join(" | "));
    traceStep("done", summaries.join(", "), activeFile || "");
    
    logEvent({ type: "task_complete", input, summaries, activeFile });

    // Human Feedback Loop
    const confirm = await keyInYN(`\n🤖 I've completed the task. Is this correct?`);
    if (!confirm) {
      console.log(`\n🤖 Understood. Tell me what needs to be changed next.\n`);
      logEvent({ type: "user_feedback", input, confirmed: false });
    } else {
      logEvent({ type: "user_feedback", input, confirmed: true });
      if (activeFile) {
        const p = getProfile(activeFile);
        console.log(`\n💬 On ${activeFile}${p ? ` (${p.name})` : ""} — looks good?\n`);
      } else { console.log(); }
    }
  }
};

run().catch((err) => {
  console.error("❌ Fatal:", err.message);
  if (DEBUG) console.error(err.stack);
  process.exit(1);
});
