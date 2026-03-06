"use strict";

// ─────────────────────────────────────────────────────────────
// EXECUTION & RECOVERY ENGINE (ERE)
//
// Unified pipeline for running code and fixing errors:
//   1. Quick-fix patterns (no LLM, <100ms)
//   2. FIS instant lookup (known errors)
//   3. LLM fix with error-only prompts (3 attempts)
//   4. Internet research (StackOverflow + DuckDuckGo)
//   5. Knowledge memory update
//
// Replaces the scattered fix logic in agent.js with a
// single executeAndRecover() call.
// ─────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { readFile, writeFile, fileExists, runFile } = require("../tools/file");
const { postJSON }         = require("../llm/client");
const fis                  = require("../memory/fis");
const { searchForFix, crystallizeSolution, isOnline } = require("../browser/search");
const { addAtom }          = require("../memory/knowledge-store");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

const MEMORY_DIR     = path.join(process.cwd(), ".agent-memory");
const FIX_CACHE_FILE = path.join(MEMORY_DIR, "fix-cache.json");

const MAX_FIX_ATTEMPTS = 3;

// ─────────────────────────────────────────────────────────────
// QUICK-FIX PATTERN ENGINE
// Fixes common errors WITHOUT calling the LLM.
// Each pattern returns a { fixed, action, patch } object.
// ─────────────────────────────────────────────────────────────
const QUICK_FIX_PATTERNS = [
  {
    // Missing npm module → install it
    name: "missing_npm_module",
    test: (err) => {
      const m = err.match(/Cannot find module '([^']+)'/);
      if (!m) return null;
      const mod = m[1];
      // Only fix external modules (not relative paths)
      if (mod.startsWith(".") || mod.startsWith("/")) return null;
      return mod;
    },
    fix: (mod, filePath) => {
      try {
        console.log(`   ⚡ Quick-fix: npm install ${mod}`);
        execSync(`npm install ${mod}`, {
          cwd: process.cwd(),
          timeout: 30000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return { fixed: true, action: `Installed missing module: ${mod}`, type: "quick-fix" };
      } catch (_) {
        return { fixed: false };
      }
    },
  },
  {
    // Missing Python module → pip install
    name: "missing_python_module",
    test: (err) => {
      const m = err.match(/ModuleNotFoundError: No module named '([^']+)'/);
      return m ? m[1] : null;
    },
    fix: (mod) => {
      try {
        console.log(`   ⚡ Quick-fix: pip install ${mod}`);
        execSync(`pip install ${mod}`, {
          cwd: process.cwd(),
          timeout: 30000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return { fixed: true, action: `Installed Python module: ${mod}`, type: "quick-fix" };
      } catch (_) {
        return { fixed: false };
      }
    },
  },
  {
    // Port already in use → kill process
    name: "port_in_use",
    test: (err) => {
      const m = err.match(/EADDRINUSE[^]*?(?:port\s*)?(\d{2,5})/i);
      return m ? m[1] : null;
    },
    fix: (port) => {
      try {
        console.log(`   ⚡ Quick-fix: killing process on port ${port}`);
        execSync(`fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
          cwd: process.cwd(),
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return { fixed: true, action: `Killed process on port ${port}`, type: "quick-fix" };
      } catch (_) {
        return { fixed: false };
      }
    },
  },
  {
    // Missing directory → create it
    name: "missing_directory",
    test: (err) => {
      const m = err.match(/ENOENT[^]*?'([^']+)'/);
      if (!m) return null;
      const p = m[1];
      // Only if it looks like a directory path
      if (path.extname(p)) return null;
      return p;
    },
    fix: (dirPath) => {
      try {
        console.log(`   ⚡ Quick-fix: creating directory ${dirPath}`);
        fs.mkdirSync(dirPath, { recursive: true });
        return { fixed: true, action: `Created missing directory: ${dirPath}`, type: "quick-fix" };
      } catch (_) {
        return { fixed: false };
      }
    },
  },
  {
    // Permission denied → chmod
    name: "permission_denied",
    test: (err) => {
      const m = err.match(/EACCES[^]*?'([^']+)'/);
      return m ? m[1] : null;
    },
    fix: (filePath) => {
      try {
        console.log(`   ⚡ Quick-fix: chmod +x ${filePath}`);
        execSync(`chmod +x "${filePath}"`, { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
        return { fixed: true, action: `Fixed permissions: ${filePath}`, type: "quick-fix" };
      } catch (_) {
        return { fixed: false };
      }
    },
  },
];

// Try all quick-fix patterns in order
const tryQuickFix = (errorOutput, filePath) => {
  for (const pattern of QUICK_FIX_PATTERNS) {
    const match = pattern.test(errorOutput);
    if (match) {
      const result = pattern.fix(match, filePath);
      if (result.fixed) return result;
    }
  }
  return { fixed: false };
};

// ─────────────────────────────────────────────────────────────
// ERROR-ONLY PROMPT BUILDER
// Instead of sending the entire file, send only:
//   - The error message
//   - The error line ± 5 lines of context
//   - File metadata (name, total lines)
//
// This is 5x smaller = 5x faster LLM response
// ─────────────────────────────────────────────────────────────
const extractErrorLine = (errorOutput) => {
  // Common patterns: "line 42", ":42:", "at line 42", "line: 42"
  const patterns = [
    /(?:line\s*[:=]?\s*)(\d+)/i,
    /:(\d+):\d+/,
    /at\s+.*?:(\d+)/,
    /\((\d+):\d+\)/,
  ];

  for (const p of patterns) {
    const m = errorOutput.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

const buildErrorOnlyPrompt = (filePath, errorOutput, fileContent) => {
  const lines    = (fileContent || "").split("\n");
  const errorLine = extractErrorLine(errorOutput);
  const totalLines = lines.length;

  // Extract the core error message (first meaningful line)
  const errorMsg = errorOutput.split("\n")
    .find((l) => l.trim() && /error|exception|fail|cannot|undefined|null/i.test(l))
    || errorOutput.split("\n")[0]
    || errorOutput.slice(0, 200);

  let context = "";
  if (errorLine && errorLine <= totalLines) {
    // Show ± 5 lines around the error
    const start = Math.max(0, errorLine - 6);
    const end   = Math.min(totalLines, errorLine + 5);
    const snippet = lines.slice(start, end).map((l, i) => {
      const lineNum = start + i + 1;
      const marker  = lineNum === errorLine ? ">>>" : "   ";
      return `${marker} ${lineNum}: ${l}`;
    }).join("\n");

    context = `ERROR in ${filePath} (${totalLines} lines total):
\`\`\`
${errorMsg.slice(0, 200)}
\`\`\`

Code around error (line ${errorLine}):
\`\`\`
${snippet}
\`\`\`

Fix the error. Return the COMPLETE fixed file content.`;
  } else {
    // No line number found — send first+last 10 lines as context
    const head = lines.slice(0, 10).join("\n");
    const tail = lines.length > 20 ? "\n...\n" + lines.slice(-10).join("\n") : "";

    context = `ERROR in ${filePath} (${totalLines} lines):
\`\`\`
${errorMsg.slice(0, 200)}
\`\`\`

File preview:
\`\`\`
${head}${tail}
\`\`\`

Fix the error. Return the COMPLETE fixed file content.`;
  }

  return context;
};

// ─────────────────────────────────────────────────────────────
// FIX CACHE
// If the same error fingerprint was fixed before, reuse it.
// ─────────────────────────────────────────────────────────────
const FIX_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const FIX_CACHE_MAX = 50;

const loadFixCache = () => {
  try { return JSON.parse(fs.readFileSync(FIX_CACHE_FILE, "utf8")); }
  catch (_) { return {}; }
};

const saveFixCache = (cache) => {
  try {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const keys = Object.keys(cache);
    if (keys.length > FIX_CACHE_MAX) {
      const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      for (let i = 0; i < sorted.length - FIX_CACHE_MAX; i++) delete cache[sorted[i]];
    }
    fs.writeFileSync(FIX_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (_) {}
};

const getCachedFix = (errorFingerprint) => {
  const cache = loadFixCache();
  const entry = cache[errorFingerprint];
  if (!entry) return null;
  if (Date.now() - entry.ts > FIX_CACHE_TTL) return null;
  return entry;
};

const cacheFix = (errorFingerprint, fixCode) => {
  const cache = loadFixCache();
  cache[errorFingerprint] = { fixCode, ts: Date.now() };
  saveFixCache(cache);
};

// ─────────────────────────────────────────────────────────────
// TARGETED TEST RUNNER
// Uses CCE to run only the relevant module, not the whole
// project. Uses language-specific test commands.
// ─────────────────────────────────────────────────────────────
const TEST_COMMANDS = {
  ".js":   (f) => {
    // Check if Jest/Mocha config exists
    const pkgPath = path.join(process.cwd(), "package.json");
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.scripts?.test) {
        const baseName = path.basename(f, ".js");
        return `npm test -- --testPathPattern="${baseName}" 2>&1 || true`;
      }
    } catch (_) {}
    return `node "${f}"`;
  },
  ".ts":   (f) => `npx ts-node "${f}"`,
  ".py":   (f) => {
    const testFile = f.replace(".py", "_test.py");
    if (fs.existsSync(testFile)) return `python3 -m pytest "${testFile}" -v`;
    return `python3 "${f}"`;
  },
  ".go":   (f) => {
    const dir = path.dirname(f);
    return `cd "${dir}" && go test -v -run . 2>&1 || go run "${path.basename(f)}"`;
  },
  ".java": (f) => {
    const baseName = path.basename(f, ".java");
    return `mvn test -Dtest=${baseName} -pl . 2>&1 || javac "${f}" && java "${baseName}"`;
  },
};

const runTargeted = (filePath, timeoutMs = 20000) => {
  // Use the standard runFile for now — it handles all languages
  const result = runFile(filePath, timeoutMs);
  return result;
};

// ─────────────────────────────────────────────────────────────
// LLM FIX (error-only prompt)
// Sends a compact prompt to the LLM to fix the error.
// ─────────────────────────────────────────────────────────────
const llmFix = async (filePath, errorOutput, attempt, known = "") => {
  const content = readFile(filePath);
  if (content.startsWith("ERROR")) return { fixed: false, code: "" };

  const prompt = buildErrorOnlyPrompt(filePath, errorOutput, content);
  const fullPrompt = known
    ? `${known}\n\n${prompt}`
    : prompt;

  console.log(`   🤖 LLM fix attempt ${attempt}/${MAX_FIX_ATTEMPTS}...`);

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt: fullPrompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 4000 },
    });

    let code = (res.response || "").trim();

    // Strip markdown code fences
    code = code.replace(/^```[\w]*\n?/gm, "").replace(/```$/gm, "").trim();

    if (code && code.length > 20) {
      return { fixed: true, code };
    }
    return { fixed: false, code: "" };
  } catch (err) {
    console.log(`   ⚠️  LLM error: ${err.message}`);
    return { fixed: false, code: "" };
  }
};

// ─────────────────────────────────────────────────────────────
// MAIN: EXECUTE AND RECOVER
//
// Full pipeline:
//   1. Run file
//   2. Quick-fix (no LLM) → retry
//   3. FIS instant lookup → retry
//   4. Fix cache lookup → retry
//   5. LLM fix (error-only, 3 attempts)
//   6. Internet research → LLM fix with web context
//   7. Record fix in FIS + memory
//
// Returns:
//   { success, attempts, fixSource, error, actions[] }
// ─────────────────────────────────────────────────────────────
const executeAndRecover = async (filePath, lang = "") => {
  const actions = [];
  const ext = path.extname(filePath).toLowerCase();
  lang = lang || ext.replace(".", "");

  // Step 0: Run the file
  console.log(`\n⚡ ERE: Running ${filePath}...`);
  let result = runTargeted(filePath);

  if (result.success) {
    console.log(`   ✅ Success: ${result.output.split("\n")[0].slice(0, 80)}`);
    return { success: true, attempts: 0, fixSource: "none", error: null, actions, output: result.output };
  }

  const originalError = result.output;
  console.log(`   ❌ Error: ${originalError.split("\n")[0].slice(0, 100)}`);

  // ─────────────────────────────────────────────────────────
  // STAGE 1: Quick-fix patterns (no LLM, <100ms)
  // ─────────────────────────────────────────────────────────
  const qf = tryQuickFix(originalError, filePath);
  if (qf.fixed) {
    actions.push({ type: "quick-fix", detail: qf.action });
    console.log(`   ✅ STAGE 1: ${qf.action}`);

    // Retry after quick fix
    result = runTargeted(filePath);
    if (result.success) {
      console.log(`   ✅ Fixed by quick-fix!`);
      return { success: true, attempts: 1, fixSource: "quick-fix", error: null, actions, output: result.output };
    }
    console.log(`   ⚠️  Quick-fix wasn't enough, continuing to Stage 2...`);
  }

  // ─────────────────────────────────────────────────────────
  // STAGE 2: FIS instant lookup (known error → known fix)
  // ─────────────────────────────────────────────────────────
  const fisEntry = fis.instantLookup(originalError, lang);
  if (fisEntry && fisEntry.codeAfter) {
    console.log(`   📚 STAGE 2 (FIS Recall): Found known fix (seen ${fisEntry.seenCount}x)`);
    actions.push({ type: "fis-lookup", detail: fisEntry.fix });

    writeFile(filePath, fisEntry.codeAfter);
    result = runTargeted(filePath);
    if (result.success) {
      console.log(`   ✅ Fixed by FIS recall!`);
      fis.recordFailure({ lang, file: filePath, errorText: originalError, fix: fisEntry.fix, cause: "fis-recall" });
      return { success: true, attempts: 1, fixSource: "fis", error: null, actions, output: result.output };
    }
    console.log(`   ⚠️  FIS fix didn't work, trying LLM...`);
  }

  // ─────────────────────────────────────────────────────────
  // STAGE 3: Fix Cache Lookup (exact match recent fixes)
  // ─────────────────────────────────────────────────────────
  const fingerprint = (originalError || "").toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  const cachedFix = getCachedFix(fingerprint);
  if (cachedFix && cachedFix.fixCode) {
    console.log(`   💾 STAGE 3 (Cache): Fix cache hit!`);
    actions.push({ type: "fix-cache", detail: "reused cached LLM fix" });

    writeFile(filePath, cachedFix.fixCode);
    result = runTargeted(filePath);
    if (result.success) {
      console.log(`   ✅ Fixed by cached fix!`);
      return { success: true, attempts: 1, fixSource: "fix-cache", error: null, actions, output: result.output };
    }
    console.log(`   ⚠️  Cached fix didn't work, escalating to Swarm...`);
  }

  // ─────────────────────────────────────────────────────────
  // STAGE 4: Speculative Swarm (with CCE + Web Fusion)
  // ─────────────────────────────────────────────────────────
  console.log(`\n🐝 STAGE 4 (ERE): Triggering Speculative Swarm for ${filePath}...`);
  const swarm = require("./swarm");
  const swarmResult = await swarm.speculateFix(filePath, originalError, lang);

  if (swarmResult.success && swarmResult.winner) {
    const winner = swarmResult.winner;
    console.log(`   ✅ Fixed by Swarm! Winner: ${winner.type.toUpperCase()} (Score: ${winner.score})`);
    
    actions.push({ type: "swarm-fix", detail: `Winner: ${winner.type}`, score: winner.score });

    writeFile(filePath, winner.code);
    
    // Cache the winning fix
    cacheFix(fingerprint, winner.code);

    // Record in FIS
    fis.recordFailure({
      lang,
      file: filePath,
      errorText: originalError,
      fix: `Swarm winner: ${winner.type}`,
      cause: originalError.split("\n")[0].slice(0, 100),
      codeAfter: winner.code.slice(0, 400),
    });

    return { 
      success: true, 
      attempts: 1, 
      fixSource: `swarm:${winner.type}`, 
      error: null, 
      actions, 
      output: winner.output 
    };
  }

  // All attempts exhausted
  console.log(`\n   💀 ERE: Could not fix ${filePath} after Swarm speculative runs.`);
  return {
    success: false,
    attempts: 1,
    fixSource: "none",
    error: originalError,
    actions,
    output: originalError,
  };
};

// ─────────────────────────────────────────────────────────────
// DISPLAY ERE STATS
// ─────────────────────────────────────────────────────────────
const displayEREStats = () => {
  const fixCache = loadFixCache();
  const fisStats = fis.getStats();

  console.log(`\n⚡ Execution & Recovery Engine`);
  console.log(`${"═".repeat(50)}`);
  console.log(`  Quick-fix patterns: ${QUICK_FIX_PATTERNS.length}`);
  console.log(`  FIS entries: ${fisStats.total}`);
  console.log(`  Fix cache entries: ${Object.keys(fixCache).length}`);
  console.log(`  Max fix attempts: ${MAX_FIX_ATTEMPTS}`);
  if (fisStats.total > 0) {
    console.log(`  Top errors:`);
    for (const e of fisStats.topErrors.slice(0, 3)) {
      console.log(`    • [${e.seenCount}x] ${e.errorText?.slice(0, 60)}`);
    }
  }
  console.log(`${"═".repeat(50)}\n`);
};

module.exports = {
  executeAndRecover,
  tryQuickFix,
  buildErrorOnlyPrompt,
  extractErrorLine,
  displayEREStats,
  runTargeted,
  getCachedFix,
  cacheFix,
  QUICK_FIX_PATTERNS,
};
