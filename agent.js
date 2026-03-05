"use strict";

const axios = require("axios");
const readline = require("readline-sync");
const { readFile, writeFile, listFiles } = require("./tools/file");
const memory = require("./tools/memory");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";
const MAX_RETRIES = 3;          // retry attempts on bad LLM output
const MAX_HISTORY = 20;         // max conversation turns to keep in memory
const DEBUG = false;            // set true to see raw LLM responses
const USE_MEMORY = true;        // enable persistent memory

// ─────────────────────────────────────────────────────────────
// CONVERSATION MEMORY
// ─────────────────────────────────────────────────────────────
const conversationHistory = [];

// Adds a turn to history, trimming oldest if over limit
const rememberTurn = (role, content) => {
  conversationHistory.push({ role, content, timestamp: Date.now() });
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
  }
};

// Formats history into a readable block for the prompt
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
      console.log("📖 Loaded instructions from README.md\n");
      return content;
    }
  } catch (_) {}
  return null;
};

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────
const buildSystemPrompt = (readmeContent) => {
  const base = `
You are an expert coding assistant with file operation capabilities.
You have memory of the entire conversation — use it to understand "that file", "add to it", "fix it", etc.

TOOL FORMAT — respond using ONLY these blocks, nothing else:

Just talk to the user (suggestions, explanations, questions):
TOOL: chat
MESSAGE:
<your message here>
END_MESSAGE

List files:
TOOL: list_files

Read a file:
TOOL: read_file
PATH: filename.js

Write or create a file:
TOOL: write_file
PATH: filename.js
CONTENT:
<complete working code — no placeholders>
END_CONTENT

For tasks that involve multiple files, stack blocks one after another.

CRITICAL RULES:
1. If the user says "check X" or "review X" or "tell me how to improve X" → read the file first, then respond with TOOL: chat listing your suggestions. Do NOT write the file unless the user says to.
2. If the user says "improve X", "fix X", "make it better" → read the file first, then write the improved version.
3. NEVER write a file without reading it first, unless it is a brand new file.
4. NEVER read files that were not mentioned. Only read files the user explicitly named.
5. Each file must appear ONCE only — never write the same file twice.
6. Always include 100% complete code in CONTENT — never truncate or use placeholders.
7. Do NOT add any text outside of tool blocks.
`.trim();

  return readmeContent
    ? base + `\n\n─────────────────────────────────────────\nCUSTOM INSTRUCTIONS (README.md):\n${readmeContent}\n─────────────────────────────────────────`
    : base;
};

// ─────────────────────────────────────────────────────────────
// MEMORY CONTEXT BUILDER
// Shows relevant past fixes when working on a file
// ─────────────────────────────────────────────────────────────
const buildMemoryContext = (file) => {
  if (!USE_MEMORY) return "";
  
  try {
    const suggestions = memory.getContextSuggestions(file);
    if (suggestions.length === 0) return "";
    
    let context = "\n\n📚 RELEVANT PAST FIXES:\n";
    suggestions.forEach((s, i) => {
      context += `\n[${i + 1}] ${s.function} in ${s.file}:\n`;
      context += `    ${s.description}\n`;
      context += `    Tags: ${s.tags.join(', ')}\n`;
      if (s.diff) {
        context += `    Before: ${s.diff.before.substring(0, 100)}${s.diff.before.length > 100 ? '...' : ''}\n`;
        context += `    After: ${s.diff.after.substring(0, 100)}${s.diff.after.length > 100 ? '...' : ''}\n`;
      }
    });
    context += "\n";
    
    return context;
  } catch (err) {
    if (DEBUG) console.error("Memory context error:", err.message);
    return "";
  }
};

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

// Cleans markdown code fences from extracted content
const cleanCodeFences = (content) => {
  if (!content) return "";
  let lines = content.split("\n");
  while (lines.length > 0 && lines[0].match(/^```\w*$/)) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].match(/^```$/)) lines.pop();
  lines = lines.filter((l) => !l.match(/^```/));
  return lines.join("\n").trim();
};

// Extracts filename from natural language input
const extractFilename = (input) => {
  const patterns = [
    /(?:create|make|write|save|generate|fix|read|open|show)\s+(?:a\s+)?(?:file\s+)?(?:called\s+)?["']?([\w\-\.]+\.[\w]+)["']?/i,
    /(?:file|filename)\s+(?:called\s+)?["']?([\w\-\.]+\.[\w]+)["']?/i,
    /["']?([\w\-\.]+\.[\w]+)["']?\s+file/i,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// RESPONSE PARSER
// Parses one or more TOOL blocks from an LLM response
// Returns array of { tool, path?, content? } objects
// ─────────────────────────────────────────────────────────────
const parseToolBlocks = (response) => {
  const operations = [];
  const seenFiles = new Set(); // prevent duplicate reads/writes for same file

  // Single-pass: find each TOOL: marker in order and parse the block after it
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
      // Only add once
      if (!operations.find(o => o.tool === "list_files")) {
        operations.push({ tool: "list_files" });
      }

    } else if (tool === "read_file") {
      const pathMatch = afterMarker.match(/^\s*\nPATH:\s*([^\n]+)/i);
      if (pathMatch) {
        const filePath = pathMatch[1].trim();
        if (seenFiles.has(`read:${filePath}`)) continue;
        seenFiles.add(`read:${filePath}`);
        const fullPath = path.join(process.cwd(), filePath);
        if (!fs.existsSync(fullPath)) {
          if (DEBUG) console.log(`[DEBUG] Skip read — file not found: ${filePath}`);
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
        operations.push({ tool: "write_file", path: filePath, content: cleanCodeFences(contentMatch[1].trim()) });
      }
    }
  }

  // Fallback: if nothing parsed, check if raw response looks like code
  if (operations.length === 0) {
    const codePatterns = [/^const\s+/m, /^function\s+/m, /^import\s+/m, /^export\s+/m, /^class\s+/m, /^def\s+/m];
    if (codePatterns.some((p) => p.test(response))) {
      operations.push({ tool: "_raw_code", content: cleanCodeFences(response) });
    }
  }

  return operations;
};

// ─────────────────────────────────────────────────────────────
// SINGLE LLM CALL WITH RETRY
// Retries up to MAX_RETRIES times if output is unparseable
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
        options: { temperature: 0.1, max_tokens: 4000 },
      });

      const raw = res.data.response.trim();
      if (DEBUG) console.log(`\n[DEBUG attempt ${attempt}]:\n${raw.substring(0, 400)}\n`);

      const ops = parseToolBlocks(raw);
      if (ops.length > 0) return { raw, ops };

      lastResponse = raw;
      console.log(`⚠️  Attempt ${attempt}/${MAX_RETRIES}: Bad format, retrying...`);
      currentPrompt = `Your previous response was not in the correct TOOL format. Respond using ONLY the TOOL blocks. Original request: ${prompt}`;

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
// AGENTIC LOOP
// One request → read file if needed → act (write or chat)
// Returns { summaries, activeFile } so main loop can track context
// ─────────────────────────────────────────────────────────────
const MAX_AGENT_TURNS = 4;

const runAgentLoop = async (userInput, systemPrompt, contextFile = null) => {
  const allSummaries = [];

  // If we already know the active file, inject its content directly
  // so the LLM doesn't need to read_file again
  let currentPrompt = userInput;
  if (contextFile) {
    const existingContent = readFile(contextFile);
    if (!existingContent.startsWith("ERROR")) {
      currentPrompt =
        `User request: "${userInput}"\n\n` +
        `Active file is ${contextFile}. Current content:\n` +
        `---\n${existingContent}\n---\n\n` +
        `Complete the request. Do NOT use read_file — use write_file or chat directly.`;
    }
  }

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const result = await callLLM(currentPrompt, systemPrompt);
    if (!result) break;

    const { ops } = result;
    const readResults = [];
    const writeResults = [];
    let didTerminate = false;
    let lastWrittenFile = contextFile;

    for (const op of ops) {
      if (op.tool === "chat") {
        console.log(`\n🤖 ${op.message}\n`);
        allSummaries.push(`Agent said: ${op.message}`);
        didTerminate = true;

      } else if (op.tool === "list_files") {
        const files = listFiles();
        console.log("\n📂 Files in current directory:");
        console.log("─".repeat(40));
        console.log(files);
        allSummaries.push(`Listed files:\n${files}`);
        didTerminate = true;

      } else if (op.tool === "read_file") {
        const content = readFile(op.path);
        console.log(`\n📖 Read: ${op.path}`);
        readResults.push({ path: op.path, content });

      } else if (op.tool === "write_file") {
        const fullPath = path.join(process.cwd(), op.path);
        let oldContent = null;
        
        // Read old content for memory recording
        if (USE_MEMORY && fs.existsSync(fullPath)) {
          oldContent = fs.readFileSync(fullPath, "utf8");
        }
        
        if (fs.existsSync(fullPath)) {
          const confirm = readline.keyInYN(`\n⚠️  ${op.path} already exists. Overwrite?`);
          if (!confirm) {
            console.log(`⏭️  Skipped ${op.path}`);
            allSummaries.push(`Skipped ${op.path}`);
            continue;
          }
        }
        writeFile(op.path, op.content);
        console.log(`\n✅ Written: ${op.path}`);
        writeResults.push(op.path);
        lastWrittenFile = op.path;
        allSummaries.push(`Created/updated: ${op.path}`);
        
        // Record change in memory
        if (USE_MEMORY && oldContent && oldContent !== op.content) {
          try {
            memory.autoRecordChange(op.path, oldContent, op.content, "Agent-applied fix");
          } catch (err) {
            if (DEBUG) console.error("Memory recording error:", err.message);
          }
        }

      } else if (op.tool === "_raw_code") {
        const filename = extractFilename(userInput) || contextFile || "output.txt";
        const fullPath = path.join(process.cwd(), filename);
        let oldContent = null;
        
        // Read old content for memory recording
        if (USE_MEMORY && fs.existsSync(fullPath)) {
          oldContent = fs.readFileSync(fullPath, "utf8");
        }
        
        if (fs.existsSync(fullPath)) {
          const confirm = readline.keyInYN(`\n⚠️  ${filename} already exists. Overwrite?`);
          if (!confirm) { console.log(`⏭️  Skipped ${filename}`); continue; }
        }
        writeFile(filename, op.content);
        console.log(`\n✅ Written (fallback): ${filename}`);
        writeResults.push(filename);
        lastWrittenFile = filename;
        allSummaries.push(`Created: ${filename}`);
        
        // Record change in memory
        if (USE_MEMORY && oldContent && oldContent !== op.content) {
          try {
            memory.autoRecordChange(filename, oldContent, op.content, "Agent-applied fix");
          } catch (err) {
            if (DEBUG) console.error("Memory recording error:", err.message);
          }
        }
      }
    }

    // Writes done → return with active file so fix loop can continue
    if (writeResults.length > 0) {
      return { summaries: allSummaries, activeFile: lastWrittenFile };
    }

    // Chat/list with no reads → done
    if (didTerminate && readResults.length === 0) {
      return { summaries: allSummaries, activeFile: lastWrittenFile };
    }

    // Reads happened → inject content and ask LLM to act
    if (readResults.length > 0) {
      console.log(`\n🔄 Got file content, asking LLM to act on it...`);
      const fileBlocks = readResults
        .map(r => `FILE: ${r.path}\n---\n${r.content}\n---`)
        .join("\n\n");
      currentPrompt =
        `Original request: "${userInput}"\n\n` +
        `Here is the content of the file(s):\n\n${fileBlocks}\n\n` +
        `Now complete the original request. Do NOT use read_file again — ` +
        `use write_file to save changes, or chat to reply with suggestions.`;
      // Track the first read file as active context
      if (!lastWrittenFile && readResults.length > 0) {
        lastWrittenFile = readResults[0].path;
      }
      continue;
    }

    break;
  }

  return { summaries: allSummaries, activeFile: contextFile };
};

// Detects if the user is saying the problem is solved
const isSolved = (input) =>
  /\b(done|solved|fixed|good|great|perfect|ok|okay|looks good|all good|that'?s? (it|fine|good|correct|right)|no more|no issues?|works?( now)?|yeah)\b/i
    .test(input);

// Detects if user wants to keep fixing the same file
const isFollowUp = (input) =>
  /\b(recheck|re-check|check again|still|again|not yet|nope|wrong|another|more|also|now fix|fix (it|this|that|again)|try again|improve|make it better|update it|change it)\b/i
    .test(input);

// ─────────────────────────────────────────────────────────────
// MAIN CHAT LOOP with FIX LOOP
// Once a file is being worked on, the agent stays focused on
// it and keeps iterating until the user says it's solved.
// ─────────────────────────────────────────────────────────────
const run = async () => {
  const readmeContent = loadReadme();
  const SYSTEM_PROMPT = buildSystemPrompt(readmeContent);

  console.log("🤖 Agent ready!");
  console.log("   Commands: 'exit' · 'history' · 'clear' · 'memory'\n");

  let activeFile = null; // currently focused file across turns

  while (true) {
    const userInput = readline.question("You: ").trim();
    if (!userInput) continue;

    if (userInput.toLowerCase() === "exit") {
      console.log("\n👋 Goodbye!");
      break;
    }

    if (userInput.toLowerCase() === "history") {
      if (conversationHistory.length === 0) {
        console.log("\n📭 No history yet.\n");
      } else {
        console.log("\n📜 Conversation history:");
        console.log("─".repeat(40));
        conversationHistory.forEach((t, i) => {
          const role = t.role === "user" ? "You  " : "Agent";
          const preview = t.content.length > 80 ? t.content.substring(0, 80) + "..." : t.content;
          console.log(`[${String(i + 1).padStart(2)}] ${role}: ${preview}`);
        });
        console.log("─".repeat(40) + "\n");
      }
      continue;
    }

    if (userInput.toLowerCase() === "clear") {
      conversationHistory.length = 0;
      activeFile = null;
      console.log("\n🧹 Memory and active file cleared.\n");
      continue;
    }

    if (userInput.toLowerCase() === "memory") {
      if (USE_MEMORY) {
        const stats = memory.getStats();
        console.log("\n📊 Persistent Memory Statistics:");
        console.log("─".repeat(40));
        console.log(`Total entries: ${stats.totalEntries}`);
        console.log(`Unique files: ${stats.uniqueFiles}`);
        console.log(`Unique functions: ${stats.uniqueFunctions}`);
        console.log(`By type:`, JSON.stringify(stats.byType));
        console.log(`Top tags: ${stats.topTags.map(t => t.tag).join(", ") || "none"}`);
        console.log("─".repeat(40) + "\n");
      } else {
        console.log("\n⚠️  Persistent memory is disabled.\n");
      }
      continue;
    }

    // User confirms problem is solved → release active file
    if (activeFile && isSolved(userInput)) {
      console.log(`\n✨ Great! Finished working on ${activeFile}.\n`);
      rememberTurn("user", userInput);
      rememberTurn("assistant", `Confirmed done with ${activeFile}`);
      activeFile = null;
      continue;
    }

    console.log("\n🤔 Thinking...");
    rememberTurn("user", userInput);

    // Build enhanced system prompt with memory context if working on a file
    let enhancedPrompt = SYSTEM_PROMPT;
    if (USE_MEMORY && activeFile) {
      const memoryContext = buildMemoryContext(activeFile);
      if (memoryContext) {
        enhancedPrompt += memoryContext;
      }
    }

    // Pass activeFile as context so agent doesn't need to re-read on follow-ups
    const { summaries, activeFile: updatedFile } = await runAgentLoop(
      userInput,
      enhancedPrompt,
      isFollowUp(userInput) ? activeFile : null
    );

    // Update active file if a new one was written
    if (updatedFile) activeFile = updatedFile;

    if (summaries.length === 0) {
      const errMsg = "Sorry, I couldn't complete that after multiple attempts.";
      console.log(`\n❌ ${errMsg}\n`);
      rememberTurn("assistant", errMsg);
      continue;
    }

    const assistantSummary = summaries.join(" | ");
    rememberTurn("assistant", assistantSummary);

    // If actively working on a file, prompt the user to confirm or continue
    if (activeFile) {
      console.log(`\n💬 Still working on ${activeFile} — let me know if it looks good or what else to fix.\n`);
    } else {
      console.log();
    }
  }
};

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
});