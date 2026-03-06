"use strict";

// ─────────────────────────────────────────────────────────────
// SUPERCHARGED LOCAL CODING AGENT
// Multi-language • Persistent Memory • Knowledge Wrapper
// Run-and-Fix Loop • Project Context • Pattern Learning
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const readline = require("readline-sync");
const fs = require("fs");
const path = require("path");

const { readFile, writeFile, listFiles, runFile, getDiffSummary, fileExists } = require("./tools/file");
const { getProfile, buildKnowledgeBlock, detectLangFromFile } = require("./knowledge/lang-profiles");
const memory = require("./memory/index");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = process.env.AGENT_MODEL || "deepseek-coder:6.7b";
const MAX_RETRIES = 3;
const MAX_HISTORY = 30;
const DEBUG = process.env.AGENT_DEBUG === "1";
const MAX_AGENT_TURNS = 6;
const RUN_AND_FIX_MAX_CYCLES = 3; // max auto-fix cycles after running a file

// ─────────────────────────────────────────────────────────────
// CONVERSATION MEMORY (in-session)
// ─────────────────────────────────────────────────────────────
const conversationHistory = [];

const rememberTurn = (role, content) => {
  conversationHistory.push({ role, content, timestamp: Date.now() });
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
  }
};

const formatHistory = () => {
  if (conversationHistory.length === 0) return "";
  const lines = conversationHistory.map(
    (t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`
  );
  return "\n\nCONVERSATION HISTORY (most recent at bottom):\n" + lines.join("\n");
};

// ─────────────────────────────────────────────────────────────
// README LOADER
// ─────────────────────────────────────────────────────────────
const loadReadme = () => {
  try {
    const readmePath = path.join(process.cwd(), "README.md");
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, "utf8");
      console.log("📖 Loaded custom instructions from README.md\n");
      return content;
    }
  } catch (_) {}
  return null;
};

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────
const buildSystemPrompt = (readmeContent, knowledgeBlock = "", memoryBlock = "", projectBlock = "") => {
  const base = `
You are an elite, multi-language coding agent with expert-level knowledge of JavaScript, TypeScript, Python, Java, Spring Boot, Go, Rust, C++, PHP, Bash, and more.
You have memory of the entire conversation and past fixes. You can read files, write files, run them, and fix errors across multiple files.

TOOL FORMAT — respond using ONLY these blocks:

Chat with the user:
TOOL: chat
MESSAGE:
<your message>
END_MESSAGE

List files:
TOOL: list_files

Read a file:
TOOL: read_file
PATH: filename.ext

Write or create a file:
TOOL: write_file
PATH: filename.ext
CONTENT:
<complete working code — no placeholders, no truncation>
END_CONTENT

Run a file and capture output:
TOOL: run_file
PATH: filename.ext

Fix an error (after running):
TOOL: fix_error
PATH: filename.ext
ERROR:
<error output>
END_ERROR

Search past fixes from memory:
TOOL: recall_fixes
LANG: python
KEYWORD: NullPointerException

CRITICAL RULES:
1. ALWAYS read a file before writing it (unless brand new).
2. NEVER truncate code — include 100% complete working code.
3. For multi-file tasks: stack multiple TOOL blocks in order.
4. Each file appears ONCE per response — no duplicate writes.
5. When you see an error after running: analyze it using the language knowledge context, apply fix, then offer to run again.
6. Use past memory fixes as reference — do not repeat known mistakes.
7. Do NOT add text outside tool blocks.
8. When fixing: fix ALL issues found, not just the first one.
9. For new files: add "use strict" (JS), proper imports, complete runnable code.
10. NEVER use placeholder comments like // TODO or // add logic here.
`.trim();

  const sections = [base];
  if (knowledgeBlock) sections.push(knowledgeBlock);
  if (memoryBlock) sections.push(memoryBlock);
  if (projectBlock) sections.push(projectBlock);
  if (readmeContent) {
    sections.push(`\n─────────────────────────────────────────\nCUSTOM INSTRUCTIONS (README.md):\n${readmeContent}\n─────────────────────────────────────────`);
  }

  return sections.join("\n\n");
};

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

// Cleans markdown code fences from content
const cleanCodeFences = (content) => {
  if (!content) return "";
  let lines = content.split("\n");
  while (lines.length > 0 && lines[0].match(/^```\w*$/)) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].match(/^```$/)) lines.pop();
  lines = lines.filter((l) => !l.match(/^```/));
  return lines.join("\n").trim();
};

// Extracts a filename from natural language
const extractFilename = (input) => {
  const patterns = [
    /(?:create|make|write|save|fix|read|open|show|run|improve)\s+(?:a\s+)?(?:file\s+)?(?:called\s+)?["']?([\w\-\.\/]+\.[\w]+)["']?/i,
    /["']?([\w\-\.\/]+\.[\w]+)["']?\s+file/i,
    /\b([\w\-]+\.(js|ts|py|java|go|rs|cpp|php|sh|rb|kt|cs|swift))\b/i,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
};

// Detects intent type from user message
const detectIntent = (input) => {
  const lower = input.toLowerCase();
  if (/\b(run|execute|test|launch|start)\b/.test(lower)) return "run";
  if (/\b(fix|debug|repair|error|broken|crash|fail|wrong|issue|bug)\b/.test(lower)) return "fix";
  if (/\b(review|check|analyze|audit|inspect|look at|tell me|what('?s| is) wrong)\b/.test(lower)) return "review";
  if (/\b(create|make|write|generate|build|scaffold|new file)\b/.test(lower)) return "create";
  if (/\b(improve|optimize|refactor|clean|enhance|upgrade|better)\b/.test(lower)) return "improve";
  if (/\b(add|append|insert|extend|include)\b/.test(lower)) return "modify";
  return "general";
};

// ─────────────────────────────────────────────────────────────
// RESPONSE PARSER
// Parses one or more TOOL blocks from LLM response
// ─────────────────────────────────────────────────────────────
const parseToolBlocks = (response) => {
  const operations = [];
  const seenFiles = new Set();
  const toolMarkerRegex = /^TOOL:\s*(\w+)/gm;
  let marker;

  while ((marker = toolMarkerRegex.exec(response)) !== null) {
    const tool = marker[1].toLowerCase();
    const afterMarker = response.slice(marker.index + marker[0].length);

    if (tool === "chat") {
      const msgMatch = afterMarker.match(/^\s*\nMESSAGE:\s*\n([\s\S]*?)(?:END_MESSAGE|(?=\nTOOL:)|$)/i);
      if (msgMatch) {
        operations.push({ tool: "chat", message: msgMatch[1].trim() });
      }

    } else if (tool === "list_files") {
      if (!operations.find((o) => o.tool === "list_files")) {
        operations.push({ tool: "list_files" });
      }

    } else if (tool === "read_file") {
      const pathMatch = afterMarker.match(/^\s*\nPATH:\s*([^\n]+)/i);
      if (pathMatch) {
        const filePath = pathMatch[1].trim();
        if (seenFiles.has(`read:${filePath}`)) continue;
        seenFiles.add(`read:${filePath}`);
        if (!fileExists(filePath)) {
          if (DEBUG) console.log(`[DEBUG] Skip read — not found: ${filePath}`);
          continue;
        }
        operations.push({ tool: "read_file", path: filePath });
      }

    } else if (tool === "write_file") {
      const pathMatch = afterMarker.match(/^\s*\nPATH:\s*([^\n]+)/i);
      const contentMatch = afterMarker.match(/\nCONTENT:\s*\n([\s\S]*?)(?:\nEND_CONTENT|(?=\nTOOL:)|$)/i);
      if (pathMatch && contentMatch) {
        const filePath = pathMatch[1].trim();
        if (seenFiles.has(`write:${filePath}`)) continue;
        seenFiles.add(`write:${filePath}`);
        operations.push({
          tool: "write_file",
          path: filePath,
          content: cleanCodeFences(contentMatch[1].trim()),
        });
      }

    } else if (tool === "run_file") {
      const pathMatch = afterMarker.match(/^\s*\nPATH:\s*([^\n]+)/i);
      if (pathMatch) {
        operations.push({ tool: "run_file", path: pathMatch[1].trim() });
      }

    } else if (tool === "fix_error") {
      const pathMatch = afterMarker.match(/^\s*\nPATH:\s*([^\n]+)/i);
      const errorMatch = afterMarker.match(/\nERROR:\s*\n([\s\S]*?)(?:\nEND_ERROR|(?=\nTOOL:)|$)/i);
      if (pathMatch) {
        operations.push({
          tool: "fix_error",
          path: pathMatch[1].trim(),
          error: errorMatch ? errorMatch[1].trim() : "",
        });
      }

    } else if (tool === "recall_fixes") {
      const langMatch = afterMarker.match(/\nLANG:\s*([^\n]+)/i);
      const kwMatch = afterMarker.match(/\nKEYWORD:\s*([^\n]+)/i);
      operations.push({
        tool: "recall_fixes",
        lang: langMatch ? langMatch[1].trim() : "",
        keyword: kwMatch ? kwMatch[1].trim() : "",
      });
    }
  }

  // Fallback: raw code block
  if (operations.length === 0) {
    const codePatterns = [/^const\s+/m, /^function\s+/m, /^import\s+/m, /^def\s+/m, /^public\s+class\s+/m];
    if (codePatterns.some((p) => p.test(response))) {
      operations.push({ tool: "_raw_code", content: cleanCodeFences(response) });
    }
  }

  return operations;
};

// ─────────────────────────────────────────────────────────────
// LLM CALL WITH RETRY
// ─────────────────────────────────────────────────────────────
const callLLM = async (prompt, systemPrompt) => {
  let lastResponse = null;
  let currentPrompt = prompt;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fullPrompt =
        systemPrompt +
        formatHistory() +
        `\n\nUser: ${currentPrompt}` +
        `\n\nAssistant (respond ONLY in tool format):`;

      const res = await axios.post(OLLAMA_URL, {
        model: MODEL,
        prompt: fullPrompt,
        stream: false,
        options: { temperature: 0.1, max_tokens: 6000 },
      });

      const raw = res.data.response.trim();
      if (DEBUG) console.log(`\n[DEBUG attempt ${attempt}]:\n${raw.substring(0, 600)}\n`);

      const ops = parseToolBlocks(raw);
      if (ops.length > 0) return { raw, ops };

      lastResponse = raw;
      console.log(`⚠️  Attempt ${attempt}/${MAX_RETRIES}: Unexpected format, retrying...`);
      currentPrompt = `Your previous response was not in the correct TOOL format. Use ONLY TOOL blocks. Original: ${prompt}`;
    } catch (err) {
      console.error(`❌ Ollama error (attempt ${attempt}):`, err.message);
      if (attempt === MAX_RETRIES) return null;
    }
  }

  if (lastResponse) {
    const ops = parseToolBlocks(lastResponse);
    if (ops.length > 0) return { raw: lastResponse, ops };
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// DYNAMIC SYSTEM PROMPT — rebuilds per request with context
// ─────────────────────────────────────────────────────────────
const buildDynamicPrompt = (readmeContent, filePath, fileContent) => {
  const profile = filePath ? getProfile(filePath, fileContent) : null;
  const knowledgeBlock = profile ? buildKnowledgeBlock(profile) : "";
  const lang = profile ? detectLangFromFile(filePath) : "";
  const memoryBlock = lang ? memory.buildMemoryRecallBlock(lang) : "";
  const projectBlock = memory.buildProjectContextBlock();
  return buildSystemPrompt(readmeContent, knowledgeBlock, memoryBlock, projectBlock);
};

// ─────────────────────────────────────────────────────────────
// AGENTIC LOOP
// Multi-turn: read → act → run → fix (until stable or limit)
// ─────────────────────────────────────────────────────────────
const runAgentLoop = async (userInput, readmeContent, contextFile = null) => {
  const allSummaries = [];
  let lastWrittenFile = contextFile;
  let currentPrompt = userInput;
  const intent = detectIntent(userInput);

  // If we have context, inject file content directly to save a read turn
  if (contextFile && fileExists(contextFile)) {
    const existingContent = readFile(contextFile);
    if (!existingContent.startsWith("ERROR")) {
      const profile = getProfile(contextFile, existingContent);
      const lang = profile ? detectLangFromFile(contextFile) : "unknown";
      currentPrompt =
        `User request: "${userInput}"\n` +
        `Active file: ${contextFile} (${lang})\nCurrent content:\n---\n${existingContent}\n---\n` +
        `Complete the request directly. Do NOT use read_file — use write_file or chat.`;
    }
  }

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    // Build a fresh system prompt with knowledge and memory
    const activeFile = lastWrittenFile || contextFile;
    const activeContent = activeFile && fileExists(activeFile) ? readFile(activeFile) : "";
    const systemPrompt = buildDynamicPrompt(readmeContent, activeFile, activeContent);

    const result = await callLLM(currentPrompt, systemPrompt);
    if (!result) break;

    const { ops } = result;
    const readResults = [];
    const writeResults = [];
    let didTerminate = false;

    for (const op of ops) {
      // ── CHAT ──────────────────────────────────────────
      if (op.tool === "chat") {
        console.log(`\n🤖 ${op.message}\n`);
        allSummaries.push(`Agent: ${op.message}`);
        didTerminate = true;

      // ── LIST FILES ────────────────────────────────────
      } else if (op.tool === "list_files") {
        const files = listFiles();
        console.log("\n📂 Project structure:");
        console.log("─".repeat(40));
        console.log(files);
        allSummaries.push("Listed project files.");
        didTerminate = true;

      // ── READ FILE ─────────────────────────────────────
      } else if (op.tool === "read_file") {
        const content = readFile(op.path);
        console.log(`\n📖 Reading: ${op.path}`);
        readResults.push({ path: op.path, content });

      // ── WRITE FILE ────────────────────────────────────
      } else if (op.tool === "write_file") {
        const beforeContent = fileExists(op.path) ? readFile(op.path) : "";

        if (beforeContent && !beforeContent.startsWith("ERROR")) {
          const confirm = readline.keyInYN(`\n⚠️  ${op.path} exists. Overwrite?`);
          if (!confirm) {
            console.log(`⏭️  Skipped ${op.path}`);
            continue;
          }
        }

        writeFile(op.path, op.content);
        const lang = detectLangFromFile(op.path) || "unknown";
        const diff = getDiffSummary(beforeContent, op.content);
        console.log(`\n✅ Written: ${op.path} ${diff ? `(${diff})` : ""}`);
        writeResults.push(op.path);
        lastWrittenFile = op.path;
        allSummaries.push(`Updated: ${op.path}`);

        // Record the fix in persistent memory if this was a fix intent
        if (intent === "fix" || intent === "improve") {
          memory.recordFix({
            file: op.path,
            lang,
            errorType: intent,
            before: beforeContent,
            after: op.content,
            description: userInput.slice(0, 120),
          });
        }

      // ── RUN FILE ──────────────────────────────────────
      } else if (op.tool === "run_file") {
        console.log(`\n▶️  Running: ${op.path}...`);
        const result = runFile(op.path);
        if (result.success) {
          console.log(`\n✅ Output:\n${result.output || "(no output)"}\n`);
          allSummaries.push(`Ran ${op.path}: success`);
          didTerminate = true;
        } else {
          console.log(`\n💥 Error output:\n${result.output}\n`);
          allSummaries.push(`Ran ${op.path}: failed`);

          // Auto-fix loop: re-prompt with the error
          const fileLang = detectLangFromFile(op.path);
          if (fileLang) memory.recordErrorPattern(fileLang, result.output.slice(0, 80));

          const shouldAutoFix = readline.keyInYN(`\n🔧 Auto-fix this error?`);
          if (shouldAutoFix) {
            currentPrompt =
              `The file ${op.path} failed with this error:\n\`\`\`\n${result.output}\n\`\`\`\n\n` +
              `Read the file, analyze the error, fix it completely, and write the fixed version.`;
            continue; // next agent turn will fix it
          } else {
            didTerminate = true;
          }
        }

      // ── FIX ERROR ─────────────────────────────────────
      } else if (op.tool === "fix_error") {
        console.log(`\n🔧 Analyzing error in ${op.path}...`);
        const content = readFile(op.path);
        readResults.push({ path: op.path, content });
        currentPrompt =
          `Fix this error in ${op.path}:\n\`\`\`\n${op.error}\n\`\`\`\n` +
          `File content:\n---\n${content}\n---\n` +
          `Fix ALL issues. Write the complete corrected file.`;
        continue;

      // ── RECALL FIXES ──────────────────────────────────
      } else if (op.tool === "recall_fixes") {
        const fixes = memory.searchFixes(op.lang, op.keyword);
        if (fixes.length > 0) {
          const lines = fixes.map((f) => `  • [${f.lang}] ${f.description}`).join("\n");
          console.log(`\n🧠 Memory recall (${fixes.length} matches):\n${lines}\n`);
          allSummaries.push(`Recalled ${fixes.length} past fixes.`);
        } else {
          console.log(`\n🧠 No matching past fixes found.\n`);
        }
        didTerminate = true;

      // ── RAW CODE FALLBACK ─────────────────────────────
      } else if (op.tool === "_raw_code") {
        const filename = extractFilename(userInput) || contextFile || "output.txt";
        if (fileExists(filename)) {
          const confirm = readline.keyInYN(`\n⚠️  ${filename} exists. Overwrite?`);
          if (!confirm) { console.log(`⏭️  Skipped`); continue; }
        }
        writeFile(filename, op.content);
        console.log(`\n✅ Written (fallback): ${filename}`);
        writeResults.push(filename);
        lastWrittenFile = filename;
        allSummaries.push(`Created: ${filename}`);
      }
    }

    // Writes done → return
    if (writeResults.length > 0) {
      return { summaries: allSummaries, activeFile: lastWrittenFile };
    }

    // Chat/list with no reads → done
    if (didTerminate && readResults.length === 0) {
      return { summaries: allSummaries, activeFile: lastWrittenFile };
    }

    // Reads happened → inject content and continue
    if (readResults.length > 0) {
      console.log(`\n🔄 Got file content, acting on it...`);
      const fileBlocks = readResults
        .map((r) => `FILE: ${r.path}\n---\n${r.content}\n---`)
        .join("\n\n");
      currentPrompt =
        `Original request: "${userInput}"\n\n${fileBlocks}\n\n` +
        `Now complete the task. Do NOT use read_file again. Use write_file or chat.`;
      if (!lastWrittenFile) lastWrittenFile = readResults[0].path;
      continue;
    }

    break;
  }

  return { summaries: allSummaries, activeFile: lastWrittenFile };
};

// ─────────────────────────────────────────────────────────────
// INTENT HELPERS
// ─────────────────────────────────────────────────────────────
const isSolved = (input) =>
  /\b(done|solved|fixed|good|great|perfect|ok|okay|looks good|all good|that'?s?( it| fine| good| correct| right)|no more|no issues?|works?( now)?|yeah|nice|cool|sweet)\b/i
    .test(input);

const isFollowUp = (input) =>
  /\b(recheck|re-check|check again|still|again|not yet|nope|wrong|another|more|also|now fix|fix (it|this|that|again)|try again|improve|make it better|update it|change it|add|remove|refactor)\b/i
    .test(input);

// ─────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────
const run = async () => {
  // Initialize persistent memory
  memory.init();
  memory.buildProjectMap();

  const readmeContent = loadReadme();

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  🚀 SUPERCHARGED LOCAL CODING AGENT              ║");
  console.log("║  Multi-lang • Memory • Knowledge • Run+Fix       ║");
  console.log(`║  Model: ${MODEL.padEnd(40)}║`);
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("\nCommands: 'exit' · 'history' · 'clear' · 'memory' · 'scan'\n");

  let activeFile = null;

  while (true) {
    const userInput = readline.question("You: ").trim();
    if (!userInput) continue;

    // ── BUILT-IN COMMANDS ──────────────────────────────
    if (userInput.toLowerCase() === "exit") {
      console.log("\n👋 Goodbye! Memory saved.\n");
      break;
    }

    if (userInput.toLowerCase() === "history") {
      if (conversationHistory.length === 0) {
        console.log("\n📭 No history yet.\n");
      } else {
        console.log("\n📜 Conversation history:");
        console.log("─".repeat(50));
        conversationHistory.forEach((t, i) => {
          const role = t.role === "user" ? "You  " : "Agent";
          const preview = t.content.length > 90 ? t.content.slice(0, 90) + "..." : t.content;
          console.log(`[${String(i + 1).padStart(2)}] ${role}: ${preview}`);
        });
        console.log("─".repeat(50) + "\n");
      }
      continue;
    }

    if (userInput.toLowerCase() === "clear") {
      conversationHistory.length = 0;
      activeFile = null;
      console.log("\n🧹 Session memory and active file cleared.\n");
      continue;
    }

    if (userInput.toLowerCase() === "memory") {
      const fixes = memory.searchFixes();
      const patterns = memory.getTopPatterns("", 10);
      console.log(`\n🧠 Persistent Memory:`);
      console.log(`   Past fixes stored: ${fixes.length}`);
      if (patterns.length > 0) {
        console.log(`   Top error patterns:`);
        patterns.forEach((p) => console.log(`     • [${p.lang}] ${p.errorType} (seen ${p.count}x)`));
      }
      console.log();
      continue;
    }

    if (userInput.toLowerCase() === "scan") {
      console.log("\n🔍 Scanning project...");
      const map = memory.buildProjectMap();
      console.log(`✅ Scanned ${map.totalFiles} files\n`);
      continue;
    }

    // ── SOLVED CONFIRMATION ────────────────────────────
    if (activeFile && isSolved(userInput)) {
      console.log(`\n✨ Great! Finished with ${activeFile}.\n`);
      rememberTurn("user", userInput);
      rememberTurn("assistant", `Confirmed done with ${activeFile}`);
      activeFile = null;
      continue;
    }

    console.log("\n🤔 Thinking...");
    rememberTurn("user", userInput);

    const { summaries, activeFile: updatedFile } = await runAgentLoop(
      userInput,
      readmeContent,
      isFollowUp(userInput) ? activeFile : null
    );

    if (updatedFile) activeFile = updatedFile;

    if (summaries.length === 0) {
      const msg = "Sorry, I couldn't complete that. Please try rephrasing.";
      console.log(`\n❌ ${msg}\n`);
      rememberTurn("assistant", msg);
      continue;
    }

    rememberTurn("assistant", summaries.join(" | "));

    if (activeFile) {
      const profile = getProfile(activeFile);
      const langName = profile ? profile.name : "code";
      console.log(`\n💬 Still on ${activeFile} (${langName}). Looks good or more to fix?\n`);
    } else {
      console.log();
    }
  }
};

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
