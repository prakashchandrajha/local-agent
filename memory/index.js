"use strict";

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// MEMORY SYSTEM
// Stores: past fixes, error patterns, project map, sessions
// All data lives in .agent-memory/ in the project root
// ─────────────────────────────────────────────────────────────

const MEMORY_DIR = path.join(process.cwd(), ".agent-memory");
const FILES = {
  fixes: path.join(MEMORY_DIR, "fixes.json"),
  patterns: path.join(MEMORY_DIR, "patterns.json"),
  projectMap: path.join(MEMORY_DIR, "project-map.json"),
  session: path.join(MEMORY_DIR, "session.json"),
};

// Ensures the memory directory exists
const init = () => {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    console.log("🧠 Memory system initialized at .agent-memory/");
  }
  for (const [key, filePath] of Object.entries(FILES)) {
    if (!fs.existsSync(filePath)) {
      const defaultData = key === "fixes" || key === "patterns" ? [] : {};
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
  }
};

// Reads a memory file safely
const readMemory = (fileKey) => {
  try {
    const raw = fs.readFileSync(FILES[fileKey], "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return fileKey === "fixes" || fileKey === "patterns" ? [] : {};
  }
};

// Writes to a memory file
const writeMemory = (fileKey, data) => {
  try {
    fs.writeFileSync(FILES[fileKey], JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`❌ Memory write error (${fileKey}):`, err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// FIX MEMORY: Records every successful fix for future recall
// ─────────────────────────────────────────────────────────────

// Saves a fix so the agent can reference it in future sessions
const recordFix = ({ file, lang, errorType, before, after, description }) => {
  const fixes = readMemory("fixes");
  fixes.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    file,
    lang,
    errorType,
    before: before?.slice(0, 200), // store snippet, not full file
    after: after?.slice(0, 200),
    description,
  });
  // Keep last 200 fixes
  if (fixes.length > 200) fixes.splice(0, fixes.length - 200);
  writeMemory("fixes", fixes);
};

// Searches past fixes by language and/or error type
const searchFixes = (lang, errorKeyword = "") => {
  const fixes = readMemory("fixes");
  return fixes
    .filter(
      (f) =>
        (!lang || f.lang === lang) &&
        (!errorKeyword ||
          (f.errorType || "").toLowerCase().includes(errorKeyword.toLowerCase()) ||
          (f.description || "").toLowerCase().includes(errorKeyword.toLowerCase()))
    )
    .slice(-10); // return last 10 matching
};

// Builds a memory recall block to inject into prompts
const buildMemoryRecallBlock = (lang, errorHint = "") => {
  const relevant = searchFixes(lang, errorHint);
  if (relevant.length === 0) return "";
  const lines = relevant.map(
    (f) =>
      `  [${f.timestamp.slice(0, 10)}] ${f.file} (${f.lang}): ${f.description}`
  );
  return `
PAST FIXES FROM MEMORY (use these as reference):
${lines.join("\n")}
`;
};

// ─────────────────────────────────────────────────────────────
// PROJECT MAP: Scans and stores file structure + relationships
// ─────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".agent-memory", "dist", "build",
  "__pycache__", ".next", "target", "vendor", ".gradle", "venv",
]);

const MAX_SCAN_FILES = 300;

// Recursively scans the project directory
const scanProject = (dir = process.cwd(), depth = 0) => {
  if (depth > 5) return [];
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(process.cwd(), fullPath);
      if (entry.isDirectory()) {
        results = results.concat(scanProject(fullPath, depth + 1));
      } else {
        results.push(relPath);
        if (results.length >= MAX_SCAN_FILES) break;
      }
    }
  } catch (_) {}
  return results;
};

// Builds and saves a project map
const buildProjectMap = () => {
  const files = scanProject();
  const byExtension = {};
  for (const f of files) {
    const ext = path.extname(f) || "no-ext";
    if (!byExtension[ext]) byExtension[ext] = [];
    byExtension[ext].push(f);
  }
  const map = {
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    byExtension,
    allFiles: files,
  };
  writeMemory("projectMap", map);
  return map;
};

// Returns the current project map (rebuilds if stale > 5 min)
const getProjectMap = () => {
  const map = readMemory("projectMap");
  if (!map.scannedAt) return buildProjectMap();
  const age = Date.now() - new Date(map.scannedAt).getTime();
  if (age > 5 * 60 * 1000) return buildProjectMap(); // refresh every 5 min
  return map;
};

// Builds a concise project context block for the LLM
const buildProjectContextBlock = () => {
  const map = getProjectMap();
  if (!map.allFiles) return "";
  const summary = Object.entries(map.byExtension || {})
    .filter(([ext]) => ext !== "no-ext" && ext !== ".json" && ext !== ".lock")
    .map(([ext, files]) => `  ${ext}: ${files.length} file(s) — ${files.slice(0, 3).join(", ")}${files.length > 3 ? "..." : ""}`)
    .join("\n");
  return `
PROJECT CONTEXT (${map.totalFiles} files scanned):
${summary}
`;
};

// ─────────────────────────────────────────────────────────────
// ERROR PATTERN LEARNING
// Tracks recurring error types so the agent gets smarter
// ─────────────────────────────────────────────────────────────

// Records when an error type is encountered
const recordErrorPattern = (lang, errorType) => {
  const patterns = readMemory("patterns");
  const key = `${lang}::${errorType}`;
  const existing = patterns.find((p) => p.key === key);
  if (existing) {
    existing.count++;
    existing.lastSeen = new Date().toISOString();
  } else {
    patterns.push({ key, lang, errorType, count: 1, lastSeen: new Date().toISOString() });
  }
  writeMemory("patterns", patterns);
};

// Returns top recurring patterns for a language
const getTopPatterns = (lang, limit = 5) => {
  const patterns = readMemory("patterns");
  return patterns
    .filter((p) => !lang || p.lang === lang)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

module.exports = {
  init,
  recordFix,
  searchFixes,
  buildMemoryRecallBlock,
  buildProjectMap,
  getProjectMap,
  buildProjectContextBlock,
  recordErrorPattern,
  getTopPatterns,
  readMemory,
  // Aliases for agent.js compatibility
  recordPattern: recordErrorPattern,
  buildMemoryBlock: buildMemoryRecallBlock,
  buildProjectBlock: buildProjectContextBlock,
};
