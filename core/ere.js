"use strict";

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { readFile, writeFile, fileExists, runFile } = require("../tools/file");
const { postJSON }         = require("../llm/client");
const fis                  = require("../memory/fis");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

const MEMORY_DIR     = path.join(process.cwd(), ".agent-memory");
const FIX_CACHE_FILE = path.join(MEMORY_DIR, "fix-cache.json");
const MAX_FIX_ATTEMPTS = 3;

// ─────────────────────────────────────────────────────────────
// QUICK-FIX PATTERNS
// ─────────────────────────────────────────────────────────────
const QUICK_FIX_PATTERNS = [
  {
    name: "missing_npm_module",
    test: (err) => {
      const m = err.match(/Cannot find module '([^']+)'/);
      if (!m) return null;
      if (m[1].startsWith(".") || m[1].startsWith("/")) return null;
      return m[1];
    },
    fix: (mod) => {
      try {
        console.log(`   ⚡ Quick-fix: npm install ${mod}`);
        execSync(`npm install ${mod}`, { cwd: process.cwd(), timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
        return { fixed: true, action: `Installed: ${mod}`, type: "quick-fix" };
      } catch (_) { return { fixed: false }; }
    },
  },
  {
    name: "missing_python_module",
    test: (err) => { const m = err.match(/ModuleNotFoundError: No module named '([^']+)'/); return m ? m[1] : null; },
    fix: (mod) => {
      try {
        execSync(`pip install ${mod}`, { cwd: process.cwd(), timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
        return { fixed: true, action: `Installed: ${mod}`, type: "quick-fix" };
      } catch (_) { return { fixed: false }; }
    },
  },
  {
    name: "port_in_use",
    test: (err) => { const m = err.match(/EADDRINUSE[^]*?(\d{2,5})/i); return m ? m[1] : null; },
    fix: (port) => {
      try {
        execSync(`fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
        return { fixed: true, action: `Killed port ${port}`, type: "quick-fix" };
      } catch (_) { return { fixed: false }; }
    },
  },
  {
    name: "missing_directory",
    test: (err) => {
      const m = err.match(/ENOENT[^]*?'([^']+)'/);
      if (!m) return null;
      if (path.extname(m[1])) return null; // has extension = file, not dir
      return m[1];
    },
    fix: (dirPath) => {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        return { fixed: true, action: `Created dir: ${dirPath}`, type: "quick-fix" };
      } catch (_) { return { fixed: false }; }
    },
  },
  {
    name: "permission_denied",
    test: (err) => {
      const m = err.match(/EACCES: permission denied[^]*?'?([^'\\n]+)'?/i);
      return m ? (m[1] || true) : null;
    },
    fix: (target) => {
      try {
        if (target && fs.existsSync(target)) {
          const stat = fs.statSync(target);
          // If directory, open up traversal; if file, make it executable/readable by user
          const mode = stat.isDirectory() ? 0o755 : 0o644;
          fs.chmodSync(target, mode);
          return { fixed: true, action: `chmod ${mode.toString(8)} ${target}`, type: "quick-fix" };
        }
      } catch (_) { /* fallthrough */ }
      return { fixed: false };
    },
  },
];

const tryQuickFix = (errorOutput, filePath) => {
  for (const p of QUICK_FIX_PATTERNS) {
    const match = p.test(errorOutput);
    if (match) { const r = p.fix(match, filePath); if (r.fixed) return r; }
  }
  return { fixed: false };
};

// ─────────────────────────────────────────────────────────────
// FIX CACHE
// ─────────────────────────────────────────────────────────────
const loadFixCache = () => { try { return JSON.parse(fs.readFileSync(FIX_CACHE_FILE, "utf8")); } catch (_) { return {}; } };
const saveFixCache = (cache) => {
  try {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const keys = Object.keys(cache);
    if (keys.length > 50) { keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, keys.length - 50).forEach(k => delete cache[k]); }
    fs.writeFileSync(FIX_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (_) {}
};
const getCachedFix = (fp) => { const c = loadFixCache(); const e = c[fp]; if (!e || Date.now() - e.ts > 86400000) return null; return e; };
const cacheFix = (fp, code) => { const c = loadFixCache(); c[fp] = { fixCode: code, ts: Date.now() }; saveFixCache(c); };

// ─────────────────────────────────────────────────────────────
// OUTPUT VALIDATOR
// ─────────────────────────────────────────────────────────────
const validateFixOutput = (filePath) => {
  const r = runFile(filePath);
  if (!r.success) return { valid: false, output: r.output, reason: "runtime_error" };
  const out = r.output || "";
  if (/\bNaN\b/.test(out)) return { valid: false, output: out, reason: "NaN in output" };
  if (/\bundefined\b/.test(out) && !/["']undefined["']/.test(out)) return { valid: false, output: out, reason: "undefined in output" };
  if (/\b(TypeError|ReferenceError|SyntaxError)\b/.test(out)) return { valid: false, output: out, reason: "error in output" };
  if (/\b(ENOENT|no such file)\b/i.test(out)) return { valid: false, output: out, reason: "missing file dependency" };
  if (/\bError\b/.test(out) && /\b(loading|reading|open)\b/i.test(out)) return { valid: false, output: out, reason: "file operation error in output" };
  return { valid: true, output: out };
};

// ─────────────────────────────────────────────────────────────
// LLM FIX — sends FULL file + error (not just snippets)
// ─────────────────────────────────────────────────────────────
const llmFix = async (filePath, errorOutput, attempt, known = "") => {
  const content = readFile(filePath);
  if (content.startsWith("ERROR")) return { fixed: false, code: "" };

  const prompt = `You are fixing a JavaScript file that has a bug.

ERROR:
${errorOutput.slice(0, 500)}

${known ? `KNOWN HINT:\n${known}\n` : ""}

COMPLETE FILE (${filePath}):
${content}

RULES FOR FIXING:
- If the code tries to read a file that doesn't exist (like tasks.json), REMOVE that dependency entirely
- Replace file-reading with hardcoded data or inline defaults
- Do NOT add try/catch that just logs the error — actually fix the logic
- Do NOT create external files — fix THIS file to work standalone
- Keep the same purpose and demonstrate the same functionality
- Return the COMPLETE fixed file, every line
${attempt > 1 ? `- Attempt ${attempt}: previous fix FAILED. Try a completely DIFFERENT approach.` : ""}
${attempt > 2 ? `- LAST ATTEMPT: Simplify the code. Remove ALL external dependencies. Make it work with inline data only.` : ""}

Return ONLY the fixed code. No explanation. No markdown fences.`;

  console.log(`   🤖 LLM fix attempt ${attempt}/${MAX_FIX_ATTEMPTS}...`);

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1 + (attempt * 0.15), num_predict: 4000 },
    });

    let code = (res.response || "").trim();
    code = code.replace(/^```[\w]*\n?/gm, "").replace(/```$/gm, "").trim();

    if (!code || code.length < 20) return { fixed: false, code: "" };

    // Reject identical code
    if (code.trim() === content.trim()) {
      console.log(`   ⚠️  LLM returned identical code`);
      return { fixed: false, code: "" };
    }

    // Reject if it STILL references the missing file that caused the error
    const missingFileMatch = errorOutput.match(/open '([^']+)'/);
    if (missingFileMatch) {
      const missingFile = missingFileMatch[1];
      // Check if the "fix" still references the missing file
      if (code.includes(missingFile)) {
        console.log(`   ⚠️  LLM fix still references ${missingFile} — rejected`);
        return { fixed: false, code: "" };
      }
    }

    // Similarity check — prevent total rewrites
    const originalTokens = content.replace(/\s+/g, " ").toLowerCase().split(" ");
    const fixedTokens = code.replace(/\s+/g, " ").toLowerCase().split(" ");
    const commonCount = originalTokens.filter(t => fixedTokens.includes(t)).length;
    const similarity = commonCount / Math.max(originalTokens.length, 1);

    if (similarity < 0.15 && content.length > 100) {
      console.log(`   ⚠️  LLM rewrote file completely (${Math.round(similarity*100)}% similar) — rejected`);
      return { fixed: false, code: "" };
    }

    return { fixed: true, code };
  } catch (err) {
    console.log(`   ⚠️  LLM error: ${err.message}`);
    return { fixed: false, code: "" };
  }
};
// ─────────────────────────────────────────────────────────────
// MAIN: EXECUTE AND RECOVER
// ─────────────────────────────────────────────────────────────
const executeAndRecover = async (filePath, lang = "") => {
  const actions = [];
  const ext = path.extname(filePath).toLowerCase();
  lang = lang || ext.replace(".", "");

  console.log(`\n⚡ ERE: Running ${filePath}...`);
  let result = runFile(filePath);

  if (result.success) {
    const v = validateFixOutput(filePath);
    if (v.valid) {
      console.log(`   ✅ Success`);
      return { success: true, attempts: 0, fixSource: "none", error: null, actions, output: result.output };
    }
    result = { success: false, output: `Output issue: ${v.reason}. Got: ${v.output.slice(0, 200)}` };
  }

  const originalError = result.output;
  const backup = readFile(filePath);
  console.log(`   ❌ Error: ${originalError.split("\n")[0].slice(0, 100)}`);

  // STAGE 1: Quick-fix
  const qf = tryQuickFix(originalError, filePath);
  if (qf.fixed) {
    actions.push({ type: "quick-fix", detail: qf.action });
    console.log(`   ✅ Quick-fix: ${qf.action}`);
    const v = validateFixOutput(filePath);
    if (v.valid) return { success: true, attempts: 1, fixSource: "quick-fix", error: null, actions, output: v.output };
  }

 // STAGE 2: FIS lookup
  const fisEntry = fis.instantLookup(originalError, lang);
  if (fisEntry && fisEntry.codeAfter) {
    console.log(`   📚 FIS: Found known fix`);
    writeFile(filePath, fisEntry.codeAfter);
    const v = validateFixOutput(filePath);
    if (v.valid) {
      fis.recordFailure({ lang, file: filePath, errorText: originalError, fix: fisEntry.fix, cause: "fis" });
      return { success: true, attempts: 1, fixSource: "fis", error: null, actions, output: v.output };
    }
    writeFile(filePath, backup); // rollback
    console.log(`   ⚠️  FIS fix is stale (still broken), skipping`);
  }

  // STAGE 3: Fix cache
  const fp = (originalError || "").toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  const cached = getCachedFix(fp);
  if (cached && cached.fixCode) {
    console.log(`   💾 Cache hit`);
    writeFile(filePath, cached.fixCode);
    const v = validateFixOutput(filePath);
    if (v.valid) return { success: true, attempts: 1, fixSource: "fix-cache", error: null, actions, output: v.output };
    writeFile(filePath, backup);
    // Invalidate the bad cache entry
    const cache = loadFixCache();
    delete cache[fp];
    saveFixCache(cache);
    console.log(`   ⚠️  Cached fix is stale, invalidated`);
  }

  // STAGE 4: LLM fix (up to MAX_FIX_ATTEMPTS)
  const known = fis.buildFISBlock ? fis.buildFISBlock(originalError, lang) : "";
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const fix = await llmFix(filePath, originalError, attempt, known);
    if (fix.fixed && fix.code) {
      writeFile(filePath, fix.code);
      const v = validateFixOutput(filePath);
      if (v.valid) {
        console.log(`   ✅ Fixed by LLM (attempt ${attempt})`);
        cacheFix(fp, fix.code);
        fis.recordFailure({ lang, file: filePath, errorText: originalError, fix: `LLM attempt ${attempt}`, codeAfter: fix.code.slice(0, 400) });
        return { success: true, attempts: attempt, fixSource: "llm", error: null, actions, output: v.output };
      }
      console.log(`   ⚠️  Attempt ${attempt}: ${v.reason || "still broken"}`);
    }
    // Reset for next attempt
    writeFile(filePath, backup);
  }

  // STAGE 5: Swarm (if available)
  try {
    const swarm = require("./swarm");
    if (swarm.speculateFix) {
      console.log(`\n🐝 Swarm: Speculating fixes...`);
      writeFile(filePath, backup); // ensure clean state
      const sr = await swarm.speculateFix(filePath, originalError, lang);
      if (sr.success && sr.winner && sr.winner.score > 0) { // KEY: only accept POSITIVE scores
        writeFile(filePath, sr.winner.code);
        const v = validateFixOutput(filePath);
        if (v.valid) {
          console.log(`   ✅ Swarm winner: ${sr.winner.type}`);
          cacheFix(fp, sr.winner.code);
          return { success: true, attempts: 1, fixSource: `swarm:${sr.winner.type}`, error: null, actions, output: v.output };
        }
        writeFile(filePath, backup);
      }
    }
  } catch (_) {}

  // All failed — restore original
  writeFile(filePath, backup);
  console.log(`   💀 ERE: All attempts exhausted for ${filePath}`);
  return { success: false, attempts: MAX_FIX_ATTEMPTS, fixSource: "none", error: originalError, actions, output: originalError };
};

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
const extractErrorLine = (errorOutput) => {
  for (const p of [/(?:line\s*[:=]?\s*)(\d+)/i, /:(\d+):\d+/, /at\s+.*?:(\d+)/, /\((\d+):\d+\)/]) {
    const m = errorOutput.match(p); if (m) return parseInt(m[1], 10);
  }
  return null;
};

const displayEREStats = () => {
  const fixCache = loadFixCache();
  const fisStats = fis.getStats();
  console.log(`\n⚡ ERE Stats`);
  console.log(`${"═".repeat(40)}`);
  console.log(`  Quick-fix patterns: ${QUICK_FIX_PATTERNS.length}`);
  console.log(`  FIS entries: ${fisStats.total}`);
  console.log(`  Fix cache: ${Object.keys(fixCache).length}`);
  console.log(`${"═".repeat(40)}\n`);
};

const runTargeted = (filePath, timeout = 20000) => runFile(filePath, timeout);

const highlightSnippet = (lines, lineNum, radius = 5) => {
  const start = Math.max(0, lineNum - radius - 1);
  const end = Math.min(lines.length, lineNum + radius);
  const width = Math.max(3, String(end).length);
  return lines.slice(start, end).map((line, idx) => {
    const n = start + idx + 1;
    const prefix = n === lineNum ? ">>> " : "    ";
    const label = n === lineNum ? String(n) : String(n).padStart(width, " ");
    return `${prefix}${label}: ${line}`;
  }).join("\n");
};

const buildErrorOnlyPrompt = (fp, err, content) => {
  const safeErr = (err || "").trim();
  const lines = (content || "").split("\n");
  const lineNum = extractErrorLine(safeErr);

  let body;
  if (lineNum) {
    body = `Relevant lines:\n${highlightSnippet(lines, lineNum)}`;
  } else {
    const preview = lines.slice(0, 30).map((l, i) => `    ${String(i + 1).padStart(3, " ")}: ${l}`).join("\n");
    body = `File preview:\n${preview}`;
  }

  const prompt = [
    `ERROR in ${fp}:`,
    safeErr || "(no error text captured)",
    body,
    "Fix the error. Keep existing behavior; only address the failing logic.",
  ].join("\n\n");

  // Ensure compactness for LLM budget
  return prompt.slice(0, 2000);
};

module.exports = { executeAndRecover, tryQuickFix, buildErrorOnlyPrompt, extractErrorLine, displayEREStats, runTargeted, getCachedFix, cacheFix, QUICK_FIX_PATTERNS };
