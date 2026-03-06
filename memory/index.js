"use strict";

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// PERSISTENT MEMORY v2
// Stores: fixes, error patterns, project map, sessions
// All data persists in .agent-memory/ directory
// ─────────────────────────────────────────────────────────────

const MEMORY_DIR = path.join(process.cwd(), ".agent-memory");

const FILES = {
  fixes:      path.join(MEMORY_DIR, "fixes.json"),
  patterns:   path.join(MEMORY_DIR, "patterns.json"),
  projectMap: path.join(MEMORY_DIR, "project-map.json"),
  session:    path.join(MEMORY_DIR, "session.json"),
};

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".agent-memory", "dist", "build",
  "__pycache__", ".next", "target", "vendor", ".gradle",
  "venv", ".venv", "env", ".env", "out", "coverage",
]);

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
const init = () => {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    console.log("🧠 Memory initialized at .agent-memory/");
  }
  for (const [key, filePath] of Object.entries(FILES)) {
    if (!fs.existsSync(filePath)) {
      const def = (key === "fixes" || key === "patterns") ? [] : {};
      fs.writeFileSync(filePath, JSON.stringify(def, null, 2));
    }
  }
};

// ─────────────────────────────────────────────────────────────
// LOW-LEVEL READ / WRITE
// ─────────────────────────────────────────────────────────────
const readMem = (key) => {
  try {
    return JSON.parse(fs.readFileSync(FILES[key], "utf8"));
  } catch (_) {
    return (key === "fixes" || key === "patterns") ? [] : {};
  }
};

const writeMem = (key, data) => {
  try {
    fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`❌ Memory write error (${key}):`, err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// FIX MEMORY
// Records every successful fix for future recall
// ─────────────────────────────────────────────────────────────

const recordFix = ({ file, lang, errorType, before, after, description, stepContext = "" }) => {
  const fixes = readMem("fixes");

  // Extract keywords from description for better search later
  const keywords = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  fixes.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    file,
    lang,
    errorType,
    keywords,
    before: before?.slice(0, 300),
    after: after?.slice(0, 300),
    description: description.slice(0, 150),
    stepContext: stepContext.slice(0, 100),
  });

  // Keep last 500 fixes
  if (fixes.length > 500) fixes.splice(0, fixes.length - 500);
  writeMem("fixes", fixes);
};

// Scored keyword search over fix history
const searchFixes = (lang = "", query = "", topN = 8) => {
  const fixes = readMem("fixes");
  const queryKeywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const scored = fixes.map((fix) => {
    let score = 0;
    if (fix.lang === lang) score += 10;

    for (const qk of queryKeywords) {
      if ((fix.keywords || []).includes(qk)) score += 3;
      if ((fix.description || "").toLowerCase().includes(qk)) score += 2;
      if ((fix.errorType || "").toLowerCase().includes(qk)) score += 1;
    }

    return { fix, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ fix }) => fix);
};

// Builds a compact memory context block for prompt injection
const buildMemoryBlock = (lang = "", query = "") => {
  const relevant = searchFixes(lang, query);
  if (relevant.length === 0) return "";

  const lines = relevant.map(
    (f) => `  [${f.timestamp?.slice(0, 10)} | ${f.lang}] ${f.description}`
  );

  return `PAST FIXES (from memory — use as reference, don't repeat these mistakes):\n${lines.join("\n")}`;
};

// ─────────────────────────────────────────────────────────────
// ERROR PATTERN TRACKING
// Tracks which errors appear most in each language
// ─────────────────────────────────────────────────────────────

const recordPattern = (lang, errorSnippet) => {
  const patterns = readMem("patterns");

  // Normalize the error to a key (first 60 chars, lowercased)
  const key = `${lang}::${errorSnippet.toLowerCase().slice(0, 60).trim()}`;

  const existing = patterns.find((p) => p.key === key);
  if (existing) {
    existing.count++;
    existing.lastSeen = new Date().toISOString();
  } else {
    patterns.push({
      key,
      lang,
      errorSnippet: errorSnippet.slice(0, 120),
      count: 1,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
  }

  writeMem("patterns", patterns);
};

const getTopPatterns = (lang = "", limit = 10) => {
  const patterns = readMem("patterns");
  return patterns
    .filter((p) => !lang || p.lang === lang)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

// ─────────────────────────────────────────────────────────────
// PROJECT MAP
// Scans the project and stores structure + metadata
// ─────────────────────────────────────────────────────────────

const scanProject = (dir = process.cwd(), depth = 0) => {
  if (depth > 6) return [];
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
        // Include file size and last modified for context
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            path: relPath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        } catch (_) {
          results.push({ path: relPath, size: 0, modified: "" });
        }
      }

      if (results.length >= 500) break;
    }
  } catch (_) {}
  return results;
};

const buildProjectMap = () => {
  const files = scanProject();
  const byExt = {};

  for (const f of files) {
    const ext = path.extname(f.path) || "no-ext";
    if (!byExt[ext]) byExt[ext] = [];
    byExt[ext].push(f.path);
  }

  const map = {
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    byExtension: byExt,
    allFiles: files.map((f) => f.path),
    recentFiles: files
      .filter((f) => f.modified)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .slice(0, 10)
      .map((f) => f.path),
  };

  writeMem("projectMap", map);
  return map;
};

const getProjectMap = () => {
  const map = readMem("projectMap");
  if (!map.scannedAt) return buildProjectMap();
  const age = Date.now() - new Date(map.scannedAt).getTime();
  if (age > 5 * 60 * 1000) return buildProjectMap();
  return map;
};

// Builds a concise project context block for prompt injection
const buildProjectBlock = () => {
  const map = getProjectMap();
  if (!map.allFiles?.length) return "";

  const extSummary = Object.entries(map.byExtension || {})
    .filter(([ext]) => ![".json", ".lock", ".log", "no-ext"].includes(ext))
    .map(([ext, files]) => {
      const sample = files.slice(0, 4).join(", ");
      return `  ${ext} (${files.length}): ${sample}${files.length > 4 ? " ..." : ""}`;
    })
    .join("\n");

  const recent = map.recentFiles?.length
    ? `\nRecently modified:\n  ${map.recentFiles.slice(0, 5).join(", ")}`
    : "";

  return `PROJECT (${map.totalFiles} files):\n${extSummary}${recent}`;
};

// Returns a list of all source files for a given extension
const getFilesByExt = (ext) => {
  const map = getProjectMap();
  return (map.byExtension || {})[ext] || [];
};

module.exports = {
  init,
  recordFix,
  searchFixes,
  buildMemoryBlock,
  recordPattern,
  getTopPatterns,
  buildProjectMap,
  getProjectMap,
  buildProjectBlock,
  getFilesByExt,
};
