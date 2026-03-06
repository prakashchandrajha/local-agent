"use strict";

// ╔══════════════════════════════════════════════════════════════╗
// ║  SUPERCHARGED LOCAL CODING AGENT  v3.1                      ║
// ║  Zero external dependencies — Node.js built-ins only        ║
// ║  Plan · Code · Review · Run · Fix · Web Search · Learn      ║
// ╚══════════════════════════════════════════════════════════════╝

const fs   = require("fs");
const path = require("path");

const { postJSON }                                            = require("./llm/client");
const { question, keyInYN }                                   = require("./tools/input");
const { readFile, writeFile, listFiles, runFile,
        getDiffSummary, fileExists,
        deleteFile, renameFile }                              = require("./tools/file");
const { getProfile, buildKnowledgeBlock, detectLangFromFile } = require("./knowledge/lang-profiles");
const memory                                                  = require("./memory/index");
const kstore                                                  = require("./memory/knowledge-store");
const { planTask, displayPlan }                               = require("./core/planner");
const { reviewCode, traceStep, getRecentTrace }               = require("./core/reviewer");
const { searchForFix, crystallizeSolution, isOnline }        = require("./browser/search");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL       = process.env.OLLAMA_URL   || "http://localhost:11434/api/generate";
const MODEL            = process.env.AGENT_MODEL  || "deepseek-coder:6.7b";
const MAX_RETRIES      = 3;
const MAX_HISTORY      = 30;
const MAX_AGENT_TURNS  = 8;
const MAX_FIX_ATTEMPTS = 3;
const ENABLE_REVIEW    = process.env.AGENT_REVIEW !== "0";
const DEBUG            = process.env.AGENT_DEBUG  === "1";

// ─────────────────────────────────────────────────────────────
// SESSION HISTORY
// ─────────────────────────────────────────────────────────────
const history = [];

const rememberTurn = (role, content) => {
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
};

const formatHistory = () => {
  if (!history.length) return "";
  return "\n\nCONVERSATION HISTORY:\n" +
    history.map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content}`).join("\n");
};

// ─────────────────────────────────────────────────────────────
// LLM CALL
// ─────────────────────────────────────────────────────────────
const callLLM = async (prompt, systemPrompt) => {
  let lastRaw = null;
  let currentPrompt = prompt;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const full = systemPrompt + formatHistory() +
        `\n\nUser: ${currentPrompt}\n\nAgent (TOOL blocks only):`;

      const res = await postJSON(OLLAMA_URL, {
        model: MODEL,
        prompt: full,
        stream: false,
        options: { temperature: 0.1, num_predict: 8000 },
      });

      const raw = (res.response || "").trim();
      if (DEBUG) console.log(`\n[DEBUG #${attempt}]:\n${raw.slice(0, 600)}\n`);

      const ops = parseToolBlocks(raw);
      if (ops.length) return { raw, ops };

      lastRaw = raw;
      console.log(`⚠️  Attempt ${attempt}/${MAX_RETRIES}: bad format, retrying...`);
      currentPrompt = `WRONG FORMAT. Use only TOOL blocks. Original: ${prompt}`;

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
// SYSTEM PROMPT — rules at END for local LLM recency bias
// ─────────────────────────────────────────────────────────────
const buildSystemPrompt = ({ langProfile, atomBlock, memoryBlock, projectBlock, readmeContent } = {}) => {
  const base = `You are an elite coding agent with expert knowledge of JavaScript, TypeScript, Python, Java, Spring Boot, FastAPI, Go, Rust, C++, PHP, and Bash. You read files, write files, delete files, rename files, run code, fix errors, and build complete multi-file modules.`;

  const tools = `
TOOL FORMAT — respond using ONLY these exact blocks:

TOOL: chat
MESSAGE:
<message to user — be specific and direct>
END_MESSAGE

TOOL: list_files

TOOL: read_file
PATH: path/to/file.ext

TOOL: write_file
PATH: path/to/file.ext
CONTENT:
<100% complete working code — never truncate>
END_CONTENT

TOOL: delete_file
PATH: path/to/file.ext

TOOL: rename_file
FROM: old-name.ext
TO: new-name.ext

TOOL: run_file
PATH: path/to/file.ext

TOOL: search_web
ERROR: <exact error>
LANG: <language>

Stack multiple TOOL blocks for multi-file tasks.`.trim();

  const parts = [base, tools];
  if (langProfile)   parts.push(langProfile);
  if (atomBlock)     parts.push(atomBlock);
  if (memoryBlock)   parts.push(memoryBlock);
  if (projectBlock)  parts.push(projectBlock);
  if (readmeContent) parts.push(`CUSTOM INSTRUCTIONS:\n${readmeContent}`);

  parts.push(`RULES (follow exactly):
1. Read a file BEFORE writing it, unless it is brand new.
2. Write 100% complete code — no truncation, no TODO, no placeholders ever.
3. Fix ALL errors found — not just the first one.
4. No text outside TOOL blocks.
5. When asked "can you X?" — answer directly with TOOL: chat. Say YES or NO clearly.
6. NEVER use list_files when user asked a question — only list when explicitly asked.
7. You CAN delete files with delete_file and rename with rename_file.
8. Multi-file: write dependencies FIRST, then files that import them.`);

  return parts.join("\n\n");
};

// ─────────────────────────────────────────────────────────────
// DYNAMIC PROMPT per request
// ─────────────────────────────────────────────────────────────
const buildDynamicPrompt = (userInput, readmeContent, activeFile = null) => {
  const content = activeFile && fileExists(activeFile) ? readFile(activeFile) : "";
  const profile = activeFile ? getProfile(activeFile, content) : null;
  const lang    = activeFile ? (detectLangFromFile(activeFile) || "") : "";
  return buildSystemPrompt({
    langProfile:   profile ? buildKnowledgeBlock(profile) : "",
    atomBlock:     kstore.buildAtomBlock(userInput, lang),
    memoryBlock:   memory.buildMemoryBlock(lang, userInput),
    projectBlock:  memory.buildProjectBlock(),
    readmeContent,
  });
};

// ─────────────────────────────────────────────────────────────
// README LOADER
// ─────────────────────────────────────────────────────────────
const loadReadme = () => {
  try {
    const p = path.join(process.cwd(), "README.md");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  } catch (_) {}
  return null;
};

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
const cleanFences = (s) => {
  if (!s) return "";
  return s.split("\n").filter((l) => !l.match(/^```/)).join("\n").trim();
};

const extractFilename = (input) => {
  const patterns = [
    /(?:create|fix|read|run|improve|write|delete|remove|rename)\s+(?:\w+\s+){0,2}["']?([\w\-\.\/]+\.[\w]+)["']?/i,
    /\b([\w\-\/]+\.(js|ts|py|java|go|rs|cpp|php|sh|rb|kt|cs|json|yaml|yml|md))\b/i,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// INTENT DETECTION
// ─────────────────────────────────────────────────────────────
const detectIntent = (input) => {
  const lo = input.toLowerCase();
  if (/\b(run|execute|test|launch)\b/.test(lo))                                   return "run";
  if (/\b(fix|debug|repair|error|broken|crash|fail|wrong|bug)\b/.test(lo))        return "fix";
  if (/\b(review|check|analyze|audit|inspect)\b/.test(lo))                        return "review";
  if (/\b(delete|remove|erase|trash)\b/.test(lo))                                 return "delete";
  if (/\b(rename|move)\b/.test(lo))                                               return "rename";
  if (/\b(create|make|write|generate|build|scaffold|implement|new)\b/.test(lo))   return "create";
  if (/\b(improve|optimize|refactor|clean|enhance|upgrade)\b/.test(lo))           return "improve";
  if (/\b(add|append|insert|extend|include|integrate)\b/.test(lo))               return "modify";
  return "general";
};

const isSolved   = (s) => /\b(done|fixed|good|great|perfect|ok|works?( now)?|looks good|yeah|sweet|correct)\b/i.test(s);
const isFollowUp = (s) => /\b(still|again|not yet|nope|wrong|more|also|fix (it|this|that)|try again|improve|update|change|add|refactor)\b/i.test(s);

// ─────────────────────────────────────────────────────────────
// CAPABILITY INTERCEPTOR — answers "can you X?" before LLM
// ─────────────────────────────────────────────────────────────
const CAPABILITY_MAP = [
  { match: /\b(delete|remove|erase)\s+(a\s+)?(file|files|it)\b/i,           ans: "✅ Yes — I can delete files. Say: \"delete filename.js\"" },
  { match: /\b(rename|move)\s+(a\s+)?(file|files|it)\b/i,                   ans: "✅ Yes — I can rename/move files. Say: \"rename old.js to new.js\"" },
  { match: /\b(read|show|open)\s+(a\s+)?(file|files)\b/i,                   ans: "✅ Yes — I can read any file and show its content." },
  { match: /\b(write|create|make|generate)\s+(a\s+)?(file|files|code)\b/i,  ans: "✅ Yes — I create files in any language with complete working code." },
  { match: /\b(run|execute)\s+(a\s+)?(file|code|script)\b/i,                ans: "✅ Yes — I run JS, TS, Python, Go, Ruby, Bash, PHP and capture output." },
  { match: /\b(fix|debug)\s+(error|bug|code|issue)\b/i,                     ans: "✅ Yes — I read the file, analyze the error, and fix it. Auto-retries 3x then searches web." },
  { match: /\b(search|look).*(web|online|stackoverflow)\b/i,                ans: "✅ Yes — when stuck after 3 attempts I search Stack Overflow + DuckDuckGo automatically." },
  { match: /\b(remember|memory|save|store|learn)\b/i,                       ans: "✅ Yes — persistent memory in .agent-memory/. Every fix is remembered across sessions." },
  { match: /\b(multi.?file|multiple files|across files)\b/i,                ans: "✅ Yes — I track imports and coordinate changes across multiple files." },
  { match: /\b(what can you do|your capabilities|what are you|help)\b/i,    ans: `I can:
  📝 Read, write, create, delete, rename files
  ▶️  Run JS/TS/Python/Go/Ruby/Bash/PHP
  🔧 Fix bugs (auto-retry + web search fallback)
  🧠 Remember fixes permanently (.agent-memory/)
  📋 Plan complex tasks step-by-step (OAuth2, REST API, etc.)
  🗂️  Multi-file coordination
  🌐 Search Stack Overflow when stuck
  🔍 Self-review code before writing` },
];

const interceptCapability = (input) => {
  const isQ = /\b(can you|are you able to|do you|do you support|is it possible|will you|would you)\b/i.test(input);
  if (!isQ) return null;
  for (const { match, ans } of CAPABILITY_MAP) {
    if (match.test(input)) return ans;
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// DIRECT FILE OP INTERCEPTORS — skip LLM for simple ops
// ─────────────────────────────────────────────────────────────
const tryDirectDelete = async (input) => {
  const m = input.match(/\b(?:delete|remove|erase|trash)\s+["']?([\w\-\.\/]+\.[\w]+)["']?/i);
  if (!m) return { handled: false };
  const target = m[1];
  if (!fileExists(target)) return { handled: true, message: `❌ File not found: ${target}` };
  const ok = await keyInYN(`\n⚠️  Permanently delete ${target}?`);
  if (!ok) return { handled: true, message: "⏭️  Cancelled." };
  const r = deleteFile(target);
  return { handled: true, message: r.success ? `🗑️  Deleted: ${target}` : `❌ ${r.message}` };
};

const tryDirectRename = async (input) => {
  const m = input.match(/\b(?:rename|move)\s+["']?([\w\-\.\/]+\.[\w]+)["']?\s+to\s+["']?([\w\-\.\/]+\.[\w]+)["']?/i);
  if (!m) return { handled: false };
  const [, from, to] = m;
  const ok = await keyInYN(`\n⚠️  Rename ${from} → ${to}?`);
  if (!ok) return { handled: true, message: "⏭️  Cancelled." };
  const r = renameFile(from, to);
  return { handled: true, message: r.success ? `✏️  ${r.message}` : `❌ ${r.message}` };
};

// ─────────────────────────────────────────────────────────────
// TOOL BLOCK PARSER
// ─────────────────────────────────────────────────────────────
const parseToolBlocks = (response) => {
  const ops  = [];
  const seen = new Set();
  const re   = /^TOOL:\s*(\w+)/gm;
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
      if (pm) {
        const fp = pm[1].trim();
        if (!seen.has(`r:${fp}`)) {
          seen.add(`r:${fp}`);
          if (fileExists(fp)) ops.push({ tool: "read_file", path: fp });
          else ops.push({ tool: "chat", message: `⚠️ File not found: ${fp}` });
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

  // Raw code fallback
  if (!ops.length && /^(const |function |import |def |public class |#!\/)/m.test(response)) {
    ops.push({ tool: "_raw_code", content: cleanFences(response) });
  }

  return ops;
};

// ─────────────────────────────────────────────────────────────
// WRITE WITH OPTIONAL SELF-REVIEW
// ─────────────────────────────────────────────────────────────
const writeWithReview = async (filePath, code, lang) => {
  if (!ENABLE_REVIEW) { writeFile(filePath, code); return code; }
  process.stdout.write(`   🔍 Reviewing ${path.basename(filePath)}...`);
  const { approved, issues, fixedCode } = await reviewCode(filePath, code, lang);
  if (approved) { process.stdout.write(" ✅\n"); writeFile(filePath, code); return code; }
  process.stdout.write(` ⚠️  ${issues.length} issue(s) — auto-fixed\n`);
  issues.slice(0, 3).forEach((i) => console.log(`     → ${i}`));
  const final = fixedCode || code;
  writeFile(filePath, final);
  return final;
};

// ─────────────────────────────────────────────────────────────
// SINGLE AGENT TURN
// ─────────────────────────────────────────────────────────────
const runAgentTurn = async (prompt, readmeContent, activeFile = null) => {
  const sysPrompt = buildDynamicPrompt(prompt, readmeContent, activeFile);
  const result    = await callLLM(prompt, sysPrompt);
  if (!result) return { written: [], read: [], terminated: false, runError: null };

  const written = [], read = [];
  let terminated = false;
  let runError   = null;

  for (const op of result.ops) {

    if (op.tool === "chat") {
      console.log(`\n🤖 ${op.message}\n`);
      terminated = true;

    } else if (op.tool === "list_files") {
      console.log(`\n📂 Project:\n${listFiles()}\n`);
      terminated = true;

    } else if (op.tool === "read_file") {
      const content = readFile(op.path);
      console.log(`\n📖 Reading: ${op.path}`);
      read.push({ path: op.path, content });
      kstore.updateGraph(op.path, content);

    } else if (op.tool === "write_file") {
      const before = fileExists(op.path) ? readFile(op.path) : "";
      if (before && !before.startsWith("ERROR")) {
        const ok = await keyInYN(`\n⚠️  ${op.path} exists. Overwrite?`);
        if (!ok) { console.log(`⏭️  Skipped`); continue; }
      }
      const lang  = detectLangFromFile(op.path) || "default";
      const final = await writeWithReview(op.path, op.content, lang);
      console.log(`\n✅ Written: ${op.path}  (${getDiffSummary(before, final) || "new file"})`);
      written.push(op.path);
      kstore.updateGraph(op.path, final);

    } else if (op.tool === "delete_file") {
      if (!fileExists(op.path)) { console.log(`\n❌ Not found: ${op.path}`); continue; }
      const ok = await keyInYN(`\n⚠️  Permanently delete ${op.path}?`);
      if (ok) { const r = deleteFile(op.path); console.log(r.success ? `\n🗑️  ${r.message}` : `\n❌ ${r.message}`); }
      else console.log("⏭️  Skipped.");
      terminated = true;

    } else if (op.tool === "rename_file") {
      const ok = await keyInYN(`\n⚠️  Rename ${op.from} → ${op.to}?`);
      if (ok) { const r = renameFile(op.from, op.to); console.log(r.success ? `\n✏️  ${r.message}` : `\n❌ ${r.message}`); }
      else console.log("⏭️  Skipped.");
      terminated = true;

    } else if (op.tool === "run_file") {
      console.log(`\n▶️  Running: ${op.path}...`);
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
      if (r.found) console.log(`\n🌐 Found web context: ${r.query}\n`);
      terminated = true;

    } else if (op.tool === "_raw_code") {
      const fname = extractFilename("output") || "output.txt";
      const lang  = detectLangFromFile(fname) || "default";
      await writeWithReview(fname, op.content, lang);
      console.log(`\n✅ Written: ${fname}`);
      written.push(fname);
    }
  }

  return { written, read, terminated, runError };
};

// ─────────────────────────────────────────────────────────────
// PLAN EXECUTOR
// ─────────────────────────────────────────────────────────────
const executePlan = async (plan, userInput, readmeContent) => {
  displayPlan(plan);
  const ok = await keyInYN(`\nExecute this ${plan.steps.length}-step plan?`);
  if (!ok) { console.log("⏭️  Running as single task.\n"); return null; }

  const allWritten = [];
  let lastFile = null;

  for (const step of plan.steps) {
    console.log(`\n${"─".repeat(50)}\n📌 Step ${step.id}/${plan.steps.length}: ${step.title}\n${"─".repeat(50)}`);
    const stepPrompt =
      `${step.focus}\n\nContext: step ${step.id} of "${userInput}".\n` +
      (allWritten.length ? `Already created: ${allWritten.join(", ")}\n` : "") +
      `Write 100% complete production code.`;
    const t = await runAgentTurn(stepPrompt, readmeContent, lastFile);
    if (t.written.length) { allWritten.push(...t.written); lastFile = t.written[t.written.length - 1]; }
    traceStep(`step-${step.id}`, step.title, t.written.join(", ") || "no write");
  }

  console.log(`\n✨ Plan complete!\n  ${allWritten.join("\n  ")}\n`);
  return { summaries: [`Plan: ${allWritten.join(", ")}`], activeFile: lastFile };
};

// ─────────────────────────────────────────────────────────────
// MAIN AGENT LOOP
// ─────────────────────────────────────────────────────────────
const runAgentLoop = async (userInput, readmeContent, contextFile = null) => {
  const intent     = detectIntent(userInput);
  const allWritten = [];
  let lastFile     = contextFile;
  let fixAttempts  = 0;

  // Complex task planning
  const plan = planTask(userInput);
  if (plan) {
    const r = await executePlan(plan, userInput, readmeContent);
    if (r) return r;
  }

  // Build initial prompt
  let currentPrompt = userInput;
  if (contextFile && fileExists(contextFile)) {
    const content = readFile(contextFile);
    if (!content.startsWith("ERROR")) {
      const lang = detectLangFromFile(contextFile) || "unknown";
      currentPrompt =
        `Request: "${userInput}"\nActive: ${contextFile} (${lang})\n` +
        `Content:\n---\n${content}\n---\n` +
        `Complete directly with write_file or chat. No need to read_file.`;
    }
  }

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const t = await runAgentTurn(currentPrompt, readmeContent, lastFile || contextFile);

    if (t.written.length) {
      allWritten.push(...t.written);
      lastFile = t.written[t.written.length - 1];
      if (intent === "fix" || intent === "improve") {
        const lang = detectLangFromFile(lastFile) || "unknown";
        memory.recordFix({ file: lastFile, lang, errorType: intent, description: userInput.slice(0, 150) });
      }
    }

    // Run error → auto-fix loop
    if (t.runError) {
      fixAttempts++;
      const { path: errFile, output: errOut, lang } = t.runError;

      if (fixAttempts <= MAX_FIX_ATTEMPTS) {
        console.log(`\n🔧 Auto-fix attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS}...`);
        const content = readFile(errFile);
        const atoms   = kstore.buildAtomBlock(errOut, lang);
        currentPrompt =
          `${errFile} failed:\n\`\`\`\n${errOut}\n\`\`\`\n\n` +
          (atoms ? `${atoms}\n\n` : "") +
          `File:\n---\n${content}\n---\nFix ALL errors completely.`;
        continue;
      }

      // Web search fallback
      console.log(`\n🌐 Exhausted local fixes. Searching web...`);
      if (await isOnline()) {
        const web = await searchForFix(errOut, lang);
        if (web.found) {
          currentPrompt =
            `${errFile} has a persistent error:\n\`\`\`\n${errOut}\n\`\`\`\n\n` +
            `${web.context}\n\nFile:\n---\n${readFile(errFile)}\n---\n` +
            `Using the web context, fix completely.`;
          const wt = await runAgentTurn(currentPrompt, readmeContent, errFile);
          if (wt.written.length) {
            allWritten.push(...wt.written);
            lastFile = wt.written[wt.written.length - 1];
            crystallizeSolution({ lang, query: errOut.slice(0, 60), solution: web.snippets?.[0]?.code || "", source: "web" });
          }
        }
      } else {
        console.log("   ⚠️  Offline.\n");
      }
      return { summaries: [`${fixAttempts} fix attempts`], activeFile: lastFile };
    }

    // Reads → inject and continue
    if (t.read.length) {
      console.log(`\n🔄 Processing ${t.read.length} file(s)...`);
      const blocks  = t.read.map((r) => `FILE: ${r.path}\n---\n${r.content}\n---`).join("\n\n");
      currentPrompt = `Original: "${userInput}"\n\n${blocks}\n\nComplete with write_file or chat.`;
      if (!lastFile) lastFile = t.read[0].path;
      continue;
    }

    if (t.terminated || t.written.length) break;
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
  const readmeContent = loadReadme();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  🚀  SUPERCHARGED LOCAL CODING AGENT  v3.1           ║");
  console.log("║  Plan · Code · Review · Run · Fix · Learn            ║");
  console.log(`║  Model: ${MODEL.padEnd(44)}║`);
  console.log(`║  Review: ${ENABLE_REVIEW?"ON ":"OFF"} │ Debug: ${DEBUG?"ON ":"OFF"} │ No external deps     ║`);
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("\n  exit · history · clear · memory · atoms · trace · scan\n");

  let activeFile = null;

  while (true) {
    const input = await question("You: ");
    if (!input) continue;
    const lo = input.toLowerCase().trim();

    // Built-in commands
    if (lo === "exit")    { console.log("\n👋 Bye!\n"); break; }
    if (lo === "clear")   { history.length = 0; activeFile = null; console.log("\n🧹 Cleared.\n"); continue; }
    if (lo === "scan")    { console.log("\n🔍 Scanning..."); const m = memory.buildProjectMap(); console.log(`✅ ${m.totalFiles} files\n`); continue; }

    if (lo === "history") {
      if (!history.length) { console.log("\n📭 No history.\n"); continue; }
      console.log("\n📜 History:");
      history.forEach((t, i) => console.log(`[${String(i+1).padStart(2)}] ${t.role==="user"?"You  ":"Agent"}: ${t.content.slice(0, 80)}`));
      console.log(); continue;
    }

    if (lo === "memory") {
      const atoms = kstore.loadAtoms();
      const pats  = memory.getTopPatterns("", 6);
      console.log(`\n🧠 Memory: ${atoms.length} knowledge atoms`);
      pats.forEach((p) => console.log(`   • [${p.lang}] ${p.errorSnippet?.slice(0,50)} (${p.count}x)`));
      console.log(); continue;
    }

    if (lo === "atoms") {
      const atoms = kstore.loadAtoms();
      console.log(`\n📚 Atoms (${atoms.length} total — last 15):`);
      atoms.slice(-15).forEach((a) => console.log(`  [${a.lang}] ${a.fact.slice(0, 80)}`));
      console.log(); continue;
    }

    if (lo === "trace") {
      const entries = getRecentTrace(12);
      if (!entries.length) { console.log("\n📋 No trace.\n"); continue; }
      entries.forEach((e) => console.log(`  [${e.ts?.slice(11,19)}] ${e.action}: ${e.detail?.slice(0,60)}`));
      console.log(); continue;
    }

    // Solved?
    if (activeFile && isSolved(input)) {
      console.log(`\n✨ Done with ${activeFile}.\n`);
      rememberTurn("user", input); rememberTurn("agent", `Finished ${activeFile}`);
      activeFile = null; continue;
    }

    // Capability question — answer directly, no LLM
    const capAns = interceptCapability(input);
    if (capAns) {
      console.log(`\n${capAns}\n`);
      rememberTurn("user", input); rememberTurn("agent", capAns);
      continue;
    }

    // Direct delete — no LLM
    if (/\b(?:delete|remove|erase|trash)\s+["']?[\w\-\.\/]+\.[\w]+/i.test(input)) {
      const r = await tryDirectDelete(input);
      if (r.handled) { console.log(`\n${r.message}\n`); rememberTurn("user", input); rememberTurn("agent", r.message); continue; }
    }

    // Direct rename — no LLM
    if (/\b(?:rename|move)\s+["']?[\w\-\.\/]+\.[\w]+["']?\s+to\s+/i.test(input)) {
      const r = await tryDirectRename(input);
      if (r.handled) { console.log(`\n${r.message}\n`); rememberTurn("user", input); rememberTurn("agent", r.message); continue; }
    }

    // Send to agent
    console.log("\n🤔 Thinking...\n");
    rememberTurn("user", input);
    traceStep("input", input);

    const { summaries, activeFile: newFile } = await runAgentLoop(
      input, readmeContent, isFollowUp(input) ? activeFile : null
    );

    if (newFile) activeFile = newFile;
    rememberTurn("agent", summaries.join(" | "));
    traceStep("done", summaries.join(", "), activeFile || "");

    if (activeFile) {
      const p = getProfile(activeFile);
      console.log(`\n💬 On ${activeFile}${p ? ` (${p.name})` : ""} — looks good?\n`);
    } else {
      console.log();
    }
  }
};

run().catch((err) => {
  console.error("❌ Fatal:", err.message);
  if (DEBUG) console.error(err.stack);
  process.exit(1);
});
