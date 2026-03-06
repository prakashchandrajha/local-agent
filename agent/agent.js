"use strict";

// ╔══════════════════════════════════════════════════════════════╗
// ║  SUPERCHARGED LOCAL CODING AGENT  v3                        ║
// ║                                                              ║
// ║  • Task Planner    — decomposes complex tasks into steps     ║
// ║  • Knowledge Atoms — TF-IDF semantic memory (vectorless)     ║
// ║  • Self-Review     — validates code before writing           ║
// ║  • Dependency Graph— tracks cross-file imports               ║
// ║  • Run+Fix Loop    — executes, catches errors, auto-fixes    ║
// ║  • Web Search      — finds solutions online when stuck       ║
// ║  • Crystallization — web solutions → permanent knowledge     ║
// ║  • Reasoning Trace — full audit log of every decision        ║
// ║  • Persistent Mem  — fix history + error patterns persist    ║
// ╚══════════════════════════════════════════════════════════════╝

const axios        = require("axios");
const readline     = require("readline-sync");
const fs           = require("fs");
const path         = require("path");

const { readFile, writeFile, listFiles, runFile, getDiffSummary, fileExists } = require("../tools/file");
const { getProfile, buildKnowledgeBlock, detectLangFromFile }                 = require("../knowledge/lang-profiles");
const memory       = require("../memory/index");
const kstore       = require("../memory/knowledge-store");
const { planTask, displayPlan }                                                = require("../core/planner");
const { reviewCode, traceStep, getRecentTrace }                               = require("../core/reviewer");
const { searchForFix, crystallizeSolution, isOnline }                        = require("../browser/search");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL        = process.env.OLLAMA_URL   || "http://localhost:11434/api/generate";
const MODEL             = process.env.AGENT_MODEL  || "deepseek-coder:6.7b";
const MAX_RETRIES       = 3;
const MAX_HISTORY       = 30;
const MAX_AGENT_TURNS   = 8;
const MAX_FIX_ATTEMPTS  = 3;   // before triggering web search
const ENABLE_REVIEW     = process.env.AGENT_REVIEW !== "0";   // self-review on by default
const DEBUG             = process.env.AGENT_DEBUG  === "1";

// ─────────────────────────────────────────────────────────────
// SESSION MEMORY (in-memory conversation history)
// ─────────────────────────────────────────────────────────────
const history = [];

const rememberTurn = (role, content) => {
  history.push({ role, content, ts: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
};

const formatHistory = () => {
  if (!history.length) return "";
  return "\n\nCONVERSATION HISTORY:\n" +
    history.map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.content}`).join("\n");
};

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT — optimised for local LLMs
// Rules at END (recency bias). Knowledge in MIDDLE. Base SHORT.
// ─────────────────────────────────────────────────────────────
const buildSystemPrompt = ({ langProfile, atomBlock, memoryBlock, projectBlock, readmeContent } = {}) => {
  // BASE — short, clear
  const base = `You are an elite coding agent. You work across all languages: JavaScript, TypeScript, Python, Java, Spring Boot, FastAPI, Go, Rust, C++, PHP, Bash, and more. You read files, write files, run them, fix errors, and handle complex multi-file tasks.`;

  // TOOLS — in the middle
  const tools = `
TOOL FORMAT (respond using ONLY these blocks):

TOOL: chat
MESSAGE:
<message to user>
END_MESSAGE

TOOL: list_files

TOOL: read_file
PATH: path/to/file.ext

TOOL: write_file
PATH: path/to/file.ext
CONTENT:
<100% complete code — no truncation, no placeholders>
END_CONTENT

TOOL: run_file
PATH: path/to/file.ext

TOOL: search_web
ERROR: <exact error message>
LANG: <language>

Stack multiple TOOL blocks for multi-file tasks.`.trim();

  // CONTEXT BLOCKS — in the middle
  const contextParts = [base, tools];
  if (langProfile)   contextParts.push(langProfile);
  if (atomBlock)     contextParts.push(atomBlock);
  if (memoryBlock)   contextParts.push(memoryBlock);
  if (projectBlock)  contextParts.push(projectBlock);
  if (readmeContent) contextParts.push(`CUSTOM INSTRUCTIONS:\n${readmeContent}`);

  // RULES — at the END for maximum attention by local LLMs
  const rules = `
RULES (follow exactly):
1. Read file BEFORE writing it, unless it is brand new.
2. Never truncate — 100% complete code always.
3. Never use placeholder comments (// TODO, # add logic, etc.).
4. Fix ALL issues in one pass — not just the first one.
5. For new files: correct imports, "use strict" (JS), proper entry point.
6. After writing: mentally verify imports resolve and all functions are complete.
7. No text outside TOOL blocks.
8. Multi-file tasks: stack write_file blocks in dependency order (dependencies first).`.trim();

  contextParts.push(rules);
  return contextParts.join("\n\n");
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
// INTENT DETECTION
// ─────────────────────────────────────────────────────────────
const detectIntent = (input) => {
  const lo = input.toLowerCase();
  if (/\b(run|execute|test|launch|start)\b/.test(lo))                                     return "run";
  if (/\b(fix|debug|repair|error|broken|crash|fail|wrong|issue|bug)\b/.test(lo))          return "fix";
  if (/\b(review|check|analyze|audit|inspect|look at|what.* wrong)\b/.test(lo))           return "review";
  if (/\b(create|make|write|generate|build|scaffold|implement|new)\b/.test(lo))            return "create";
  if (/\b(improve|optimize|refactor|clean|enhance|upgrade|better)\b/.test(lo))            return "improve";
  if (/\b(add|append|insert|extend|include|integrate)\b/.test(lo))                        return "modify";
  return "general";
};

const isSolved   = (s) => /\b(done|fixed|good|great|perfect|ok|works?( now)?|looks good|all good|yeah|sweet|nice|correct)\b/i.test(s);
const isFollowUp = (s) => /\b(still|again|not yet|nope|wrong|more|also|fix (it|this|that)|try again|improve|update|change|add|remove|refactor)\b/i.test(s);

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
const cleanFences = (s) => {
  if (!s) return "";
  return s.split("\n")
    .filter((l) => !l.match(/^```/))
    .join("\n")
    .trim();
};

const extractFilename = (input) => {
  const patterns = [
    /(?:create|fix|read|run|improve|write|save)\s+(?:\w+\s+)?["']?([\w\-\.\/]+\.[\w]+)["']?/i,
    /\b([\w\-\/]+\.(js|ts|py|java|go|rs|cpp|php|sh|rb|kt|cs))\b/i,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// RESPONSE PARSER
// ─────────────────────────────────────────────────────────────
const parseToolBlocks = (response) => {
  const ops = [];
  const seen = new Set();
  const toolRe = /^TOOL:\s*(\w+)/gm;
  let m;

  while ((m = toolRe.exec(response)) !== null) {
    const tool = m[1].toLowerCase();
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
  if (!ops.length && /^(const |function |import |def |public class )/m.test(response)) {
    ops.push({ tool: "_raw_code", content: cleanFences(response) });
  }

  return ops;
};

// ─────────────────────────────────────────────────────────────
// LLM CALL
// ─────────────────────────────────────────────────────────────
const callLLM = async (prompt, systemPrompt) => {
  let last = null;
  let currentPrompt = prompt;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const full = systemPrompt + formatHistory() +
        `\n\nUser: ${currentPrompt}\n\nAgent (TOOL blocks only):`;

      const res = await axios.post(OLLAMA_URL, {
        model: MODEL,
        prompt: full,
        stream: false,
        options: { temperature: 0.1, max_tokens: 8000 },
      });

      const raw = res.data.response.trim();
      if (DEBUG) console.log(`\n[DEBUG #${attempt}]:\n${raw.slice(0, 500)}\n`);

      const ops = parseToolBlocks(raw);
      if (ops.length) return { raw, ops };

      last = raw;
      console.log(`⚠️  Attempt ${attempt}/${MAX_RETRIES}: bad format, retrying...`);
      currentPrompt = `WRONG FORMAT. Respond ONLY with TOOL blocks. Original request: ${prompt}`;

    } catch (err) {
      console.error(`❌ LLM error (attempt ${attempt}):`, err.message);
      if (attempt === MAX_RETRIES) return null;
    }
  }

  if (last) {
    const ops = parseToolBlocks(last);
    if (ops.length) return { raw: last, ops };
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// DYNAMIC PROMPT BUILDER
// Pulls context from knowledge store, memory, and project map
// ─────────────────────────────────────────────────────────────
const buildDynamicPrompt = (userInput, readmeContent, activeFile = null) => {
  const content = activeFile && fileExists(activeFile) ? readFile(activeFile) : "";
  const profile = activeFile ? getProfile(activeFile, content) : null;
  const lang    = activeFile ? detectLangFromFile(activeFile) : "";

  return buildSystemPrompt({
    langProfile:   profile ? buildKnowledgeBlock(profile) : "",
    atomBlock:     kstore.buildAtomBlock(userInput, lang),
    memoryBlock:   memory.buildMemoryBlock(lang, userInput),
    projectBlock:  memory.buildProjectBlock(),
    readmeContent,
  });
};

// ─────────────────────────────────────────────────────────────
// WRITE FILE WITH REVIEW
// Optionally runs a self-review pass before writing to disk
// ─────────────────────────────────────────────────────────────
const writeFileWithReview = async (filePath, code, lang) => {
  if (!ENABLE_REVIEW) {
    writeFile(filePath, code);
    return code;
  }

  process.stdout.write(`   🔍 Reviewing ${filePath}...`);
  const { approved, issues, fixedCode } = await reviewCode(filePath, code, lang);

  if (approved) {
    process.stdout.write(" ✅\n");
    writeFile(filePath, code);
    return code;
  }

  process.stdout.write(` ⚠️  ${issues.length} issue(s) found\n`);
  if (issues.length) {
    issues.forEach((i) => console.log(`     → ${i}`));
  }

  const finalCode = fixedCode || code;
  writeFile(filePath, finalCode);
  traceStep("review-fix", filePath, `Fixed ${issues.length} issues before write`);
  return finalCode;
};

// ─────────────────────────────────────────────────────────────
// PLAN EXECUTOR
// Runs each step of a complex plan as a focused agent call
// ─────────────────────────────────────────────────────────────
const executePlan = async (plan, userInput, readmeContent) => {
  const allWritten = [];
  let lastWrittenFile = null;

  displayPlan(plan);
  const confirm = readline.keyInYN(`\nExecute this ${plan.steps.length}-step plan?`);
  if (!confirm) {
    console.log("⏭️  Plan skipped. Running as single task.\n");
    return null;
  }

  for (const step of plan.steps) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`📌 Step ${step.id}/${plan.steps.length}: ${step.title}`);
    console.log("─".repeat(50));

    const stepPrompt = `
${step.focus}

Context: This is step ${step.id} of a larger task: "${userInput}".
${allWritten.length > 0 ? `Files already created: ${allWritten.join(", ")}` : ""}

Write complete, production-ready code. No placeholders.`.trim();

    const result = await runAgentTurn(stepPrompt, readmeContent, lastWrittenFile);
    if (result.written.length) {
      allWritten.push(...result.written);
      lastWrittenFile = result.written[result.written.length - 1];
    }

    traceStep(`plan-step-${step.id}`, step.title, result.written.join(", ") || "no write");
  }

  console.log(`\n✨ Plan complete! Files created:\n  ${allWritten.join("\n  ")}\n`);
  return { summaries: [`Plan executed: ${allWritten.join(", ")}`], activeFile: lastWrittenFile };
};

// ─────────────────────────────────────────────────────────────
// SINGLE AGENT TURN
// One LLM call → parse ops → execute → return what happened
// ─────────────────────────────────────────────────────────────
const runAgentTurn = async (prompt, readmeContent, activeFile = null) => {
  const systemPrompt = buildDynamicPrompt(prompt, readmeContent, activeFile);
  const result = await callLLM(prompt, systemPrompt);
  if (!result) return { written: [], read: [], terminated: false };

  const written = [], read = [];
  let terminated = false;
  let webSearchResult = null;

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
        const ok = readline.keyInYN(`\n⚠️  ${op.path} exists. Overwrite?`);
        if (!ok) { console.log(`⏭️  Skipped`); continue; }
      }

      const lang = detectLangFromFile(op.path) || "default";
      const finalCode = await writeFileWithReview(op.path, op.content, lang);
      const diff = getDiffSummary(before, finalCode);
      console.log(`\n✅ Written: ${op.path}  (${diff || "new file"})`);

      written.push(op.path);
      kstore.updateGraph(op.path, finalCode);

    } else if (op.tool === "run_file") {
      console.log(`\n▶️  Running: ${op.path}...`);
      const r = runFile(op.path);
      if (r.success) {
        console.log(`\n✅ Output:\n${r.output || "(no output)"}\n`);
        terminated = true;
      } else {
        console.log(`\n💥 Error:\n${r.output}\n`);
        const lang = detectLangFromFile(op.path) || "";
        if (lang) memory.recordPattern(lang, r.output);
        // Return the error for the outer loop to handle
        return { written, read, terminated: false, runError: { path: op.path, output: r.output, lang } };
      }

    } else if (op.tool === "search_web") {
      const r = await searchForFix(op.error, op.lang);
      webSearchResult = r;
      terminated = true;

    } else if (op.tool === "_raw_code") {
      const fname = extractFilename("output") || "output.txt";
      const lang = detectLangFromFile(fname) || "default";
      await writeFileWithReview(fname, op.content, lang);
      console.log(`\n✅ Written (fallback): ${fname}`);
      written.push(fname);
    }
  }

  return { written, read, terminated, webSearchResult };
};

// ─────────────────────────────────────────────────────────────
// MAIN AGENT LOOP
// Orchestrates the full fix cycle including web search fallback
// ─────────────────────────────────────────────────────────────
const runAgentLoop = async (userInput, readmeContent, contextFile = null) => {
  const intent = detectIntent(userInput);
  const allWritten = [];
  let lastWrittenFile = contextFile;
  let fixAttempts = 0;

  // ── STEP 1: Try task planning for complex requests ─────────
  const plan = planTask(userInput);
  if (plan) {
    const planResult = await executePlan(plan, userInput, readmeContent);
    if (planResult) return planResult;
    // User declined plan — fall through to single-shot
  }

  // ── STEP 2: Build initial prompt ──────────────────────────
  let currentPrompt = userInput;

  // Inject active file context so LLM doesn't need to re-read
  if (contextFile && fileExists(contextFile)) {
    const content = readFile(contextFile);
    if (!content.startsWith("ERROR")) {
      const lang = detectLangFromFile(contextFile) || "unknown";
      currentPrompt =
        `Request: "${userInput}"\nActive file: ${contextFile} (${lang})\n` +
        `Content:\n---\n${content}\n---\n` +
        `Complete the request. Use write_file or chat directly (no need to read_file again).`;
    }
  }

  // ── STEP 3: Agentic loop ──────────────────────────────────
  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const turnResult = await runAgentTurn(currentPrompt, readmeContent, lastWrittenFile || contextFile);

    // Track written files
    if (turnResult.written.length) {
      allWritten.push(...turnResult.written);
      lastWrittenFile = turnResult.written[turnResult.written.length - 1];

      // Record fix in persistent memory
      if (intent === "fix" || intent === "improve") {
        const lang = detectLangFromFile(lastWrittenFile) || "unknown";
        memory.recordFix({
          file: lastWrittenFile,
          lang,
          errorType: intent,
          description: userInput.slice(0, 150),
        });
      }
    }

    // ── RUN ERROR → AUTO-FIX LOOP ────────────────────────────
    if (turnResult.runError) {
      fixAttempts++;
      const { path: errFile, output: errOutput, lang } = turnResult.runError;
      memory.recordPattern(lang, errOutput);

      if (fixAttempts <= MAX_FIX_ATTEMPTS) {
        console.log(`\n🔧 Auto-fix attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS}...`);
        const errContent = readFile(errFile);
        const atomCtx = kstore.buildAtomBlock(errOutput, lang);

        currentPrompt =
          `File: ${errFile} failed with:\n\`\`\`\n${errOutput}\n\`\`\`\n\n` +
          `${atomCtx ? atomCtx + "\n\n" : ""}` +
          `File content:\n---\n${errContent}\n---\n\n` +
          `Fix ALL errors completely. Write the corrected file.`;
        continue;
      }

      // ── WEB SEARCH FALLBACK ────────────────────────────────
      console.log(`\n🌐 Local fix attempts exhausted. Searching web...`);
      const online = await isOnline();

      if (online) {
        const webResult = await searchForFix(errOutput, lang);

        if (webResult.found) {
          const errContent = readFile(errFile);
          currentPrompt =
            `File: ${errFile} has a persistent error:\n\`\`\`\n${errOutput}\n\`\`\`\n\n` +
            `${webResult.context}\n\n` +
            `File content:\n---\n${errContent}\n---\n\n` +
            `Using the web search context above, fix the error completely. Write the corrected file.`;

          const webFixResult = await runAgentTurn(currentPrompt, readmeContent, errFile);

          if (webFixResult.written.length) {
            allWritten.push(...webFixResult.written);
            lastWrittenFile = webFixResult.written[webFixResult.written.length - 1];

            // Crystallize the solution
            const solution = webResult.snippets[0]?.code || webResult.context.slice(0, 200);
            crystallizeSolution({ lang, query: errOutput.slice(0, 60), solution, source: "stackoverflow" });

            return { summaries: [`Web-assisted fix: ${allWritten.join(", ")}`], activeFile: lastWrittenFile };
          }
        }
      } else {
        console.log("   ⚠️  No internet connection. Cannot search web.\n");
      }

      return { summaries: [`Fix attempted ${fixAttempts}x — check error above`], activeFile: lastWrittenFile };
    }

    // ── READS HAPPENED → inject and continue ─────────────────
    if (turnResult.read.length) {
      console.log(`\n🔄 Got ${turnResult.read.length} file(s), acting...`);
      const blocks = turnResult.read
        .map((r) => `FILE: ${r.path}\n---\n${r.content}\n---`)
        .join("\n\n");
      currentPrompt =
        `Original request: "${userInput}"\n\n${blocks}\n\n` +
        `Complete the task. Use write_file or chat. Don't use read_file again.`;
      if (!lastWrittenFile && turnResult.read.length) lastWrittenFile = turnResult.read[0].path;
      continue;
    }

    // ── TERMINATED (chat/list/run success) ───────────────────
    if (turnResult.terminated) break;

    // ── WRITES DONE ───────────────────────────────────────────
    if (turnResult.written.length) break;

    break;
  }

  return {
    summaries: allWritten.length ? [`Written: ${allWritten.join(", ")}`] : ["Task complete"],
    activeFile: lastWrittenFile,
  };
};

// ─────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────
const run = async () => {
  // Boot sequence
  memory.init();
  kstore.initAtoms();
  memory.buildProjectMap();

  const readmeContent = loadReadme();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  🚀  SUPERCHARGED LOCAL CODING AGENT  v3             ║");
  console.log("║                                                      ║");
  console.log("║  Plan → Code → Review → Run → Fix → Learn           ║");
  console.log(`║  Model: ${MODEL.padEnd(44)}║`);
  console.log(`║  Review: ${ENABLE_REVIEW ? "ON " : "OFF"} │ Debug: ${DEBUG ? "ON " : "OFF"} │ Memory: PERSISTENT  ║`);
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("\n  Commands: exit · history · clear · memory · trace · scan · atoms\n");

  let activeFile = null;

  while (true) {
    const input = readline.question("You: ").trim();
    if (!input) continue;
    const lo = input.toLowerCase();

    // ── BUILT-IN COMMANDS ──────────────────────────────────
    if (lo === "exit") { console.log("\n👋 Bye! Memory saved.\n"); break; }

    if (lo === "history") {
      if (!history.length) { console.log("\n📭 No history.\n"); continue; }
      console.log("\n📜 History:");
      history.forEach((t, i) => {
        const role = t.role === "user" ? "You  " : "Agent";
        console.log(`[${String(i+1).padStart(2)}] ${role}: ${t.content.slice(0, 80)}`);
      });
      console.log();
      continue;
    }

    if (lo === "clear") {
      history.length = 0; activeFile = null;
      console.log("\n🧹 Session cleared.\n"); continue;
    }

    if (lo === "memory") {
      const fixes = memory.searchFixes();
      const patterns = memory.getTopPatterns("", 8);
      const atoms = kstore.loadAtoms();
      console.log(`\n🧠 Memory Status:`);
      console.log(`   Fix history:     ${fixes.length} entries`);
      console.log(`   Knowledge atoms: ${atoms.length} facts`);
      if (patterns.length) {
        console.log(`   Top error patterns:`);
        patterns.forEach((p) => console.log(`     • [${p.lang}] ${p.errorSnippet?.slice(0, 50)} (${p.count}x)`));
      }
      console.log();
      continue;
    }

    if (lo === "atoms") {
      const atoms = kstore.loadAtoms();
      console.log(`\n📚 Knowledge Atoms (${atoms.length} total):`);
      atoms.slice(-20).forEach((a) => {
        console.log(`  [${a.lang}/${a.tags?.slice(0,2).join(",")}] ${a.fact.slice(0, 80)}`);
      });
      console.log();
      continue;
    }

    if (lo === "trace") {
      const entries = getRecentTrace(15);
      if (!entries.length) { console.log("\n📋 No trace entries yet.\n"); continue; }
      console.log("\n📋 Reasoning Trace:");
      entries.forEach((e) => {
        console.log(`  [${e.ts?.slice(11,19)}] ${e.action}: ${e.detail?.slice(0,60)} → ${e.outcome?.slice(0,40)}`);
      });
      console.log();
      continue;
    }

    if (lo === "scan") {
      console.log("\n🔍 Scanning project...");
      const map = memory.buildProjectMap();
      console.log(`✅ ${map.totalFiles} files mapped\n`);
      continue;
    }

    // ── SOLVED CONFIRMATION ────────────────────────────────
    if (activeFile && isSolved(input)) {
      console.log(`\n✨ Great! Done with ${activeFile}.\n`);
      rememberTurn("user", input);
      rememberTurn("agent", `Done with ${activeFile}`);
      activeFile = null;
      continue;
    }

    // ── RUN AGENT ─────────────────────────────────────────
    console.log("\n🤔 Thinking...\n");
    rememberTurn("user", input);
    traceStep("user-input", input);

    const { summaries, activeFile: newFile } = await runAgentLoop(
      input,
      readmeContent,
      isFollowUp(input) ? activeFile : null
    );

    if (newFile) activeFile = newFile;
    rememberTurn("agent", summaries.join(" | "));
    traceStep("agent-done", summaries.join(", "), activeFile || "");

    if (!summaries.length) {
      console.log("❌ Couldn't complete that. Try rephrasing.\n");
    } else if (activeFile) {
      const profile = getProfile(activeFile);
      const langName = profile?.name || "code";
      console.log(`\n💬 Working on: ${activeFile} (${langName}) — looks good or more changes?\n`);
    } else {
      console.log();
    }
  }
};

run().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
