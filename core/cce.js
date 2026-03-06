"use strict";

// ─────────────────────────────────────────────────────────────
// CONTEXT COMPRESSION ENGINE (CCE)
//
// 4-Level context compression for large codebases:
//   Level 1: File summaries (exports, imports, role)
//   Level 2: Architecture graph (controller → service → repo)
//   Level 3: Function signatures (name, params, return type)
//   Level 4: Smart file loader (prompt-aware selection)
//
// + Context cache: reuse compressed context for repeated queries
//
// Result: 120,000 lines → ~200 tokens of structured knowledge
// A 7B model can understand an entire large project.
// ─────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");

const { loadIndex, buildArchGraph, formatArchGraph } = require("./repo-indexer");
const { readFile, fileExists }                       = require("../tools/file");

const MEMORY_DIR  = path.join(process.cwd(), ".agent-memory");
const CACHE_FILE  = path.join(MEMORY_DIR, "context-cache.json");

// Token budget tiers (chars / 4)
const BUDGETS = {
  "3b":  2000,
  "7b":  4000,
  "13b": 6000,
  "33b": 10000,
  "70b": 16000,
};

const estimateTokens = (text) => Math.ceil((text || "").length / 4);

const detectBudget = (modelName = "") => {
  const name = modelName.toLowerCase();
  if (name.includes("70b")) return BUDGETS["70b"];
  if (name.includes("33b")) return BUDGETS["33b"];
  if (name.includes("13b")) return BUDGETS["13b"];
  if (name.includes("7b"))  return BUDGETS["7b"];
  if (name.includes("3b"))  return BUDGETS["3b"];
  return BUDGETS["7b"];
};

// ─────────────────────────────────────────────────────────────
// CONTEXT CACHE
// Reuse compressed context if the same files were recently used
// ─────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const loadCache = () => {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); }
  catch (_) { return {}; }
};

const saveCache = (cache) => {
  try {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    // Keep only last 20 entries
    const keys = Object.keys(cache);
    if (keys.length > 20) {
      const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      for (let i = 0; i < sorted.length - 20; i++) delete cache[sorted[i]];
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (_) {}
};

const getCached = (cacheKey) => {
  const cache = loadCache();
  const entry = cache[cacheKey];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry;
};

const setCached = (cacheKey, data) => {
  const cache = loadCache();
  cache[cacheKey] = { ...data, ts: Date.now() };
  saveCache(cache);
};

// ─────────────────────────────────────────────────────────────
// LEVEL 1 — FILE SUMMARIES
// Compact description of each file: role, exports, imports
// ~20 tokens per file instead of thousands
// ─────────────────────────────────────────────────────────────
const buildFileSummaries = (indexFiles) => {
  const lines = [];
  for (const [filePath, meta] of Object.entries(indexFiles)) {
    const funcs = (meta.functions || []).slice(0, 6).join(", ");
    const imps  = (meta.imports || []).slice(0, 4).map((i) => path.basename(i)).join(", ");
    const role  = meta.role || "module";
    const desc  = meta.description || "";

    let line = `${filePath} [${role}]`;
    if (desc)  line += `: ${desc}`;
    if (funcs) line += ` | fn: ${funcs}`;
    if (imps)  line += ` | deps: ${imps}`;
    lines.push(line);
  }
  return lines.join("\n");
};

// ─────────────────────────────────────────────────────────────
// LEVEL 3 — FUNCTION SIGNATURES
// Show function interfaces without bodies
// The LLM knows what functions exist and what they do
// ─────────────────────────────────────────────────────────────
const buildSignatureBlock = (indexFiles, relevantFiles = null) => {
  const lines = [];
  const files = relevantFiles || Object.keys(indexFiles);

  for (const filePath of files) {
    const meta = indexFiles[filePath];
    if (!meta || !meta.signatures || meta.signatures.length === 0) continue;

    lines.push(`${path.basename(filePath)}:`);
    for (const sig of meta.signatures.slice(0, 15)) {
      lines.push(`  ${sig}`);
    }
  }
  return lines.join("\n");
};

// ─────────────────────────────────────────────────────────────
// LEVEL 4 — SMART FILE LOADER
// Given a user prompt, finds the most relevant files using:
//   1. Keyword matching against file names and descriptions
//   2. Dependency graph traversal (load neighbors)
//   3. Role-aware boosting (controllers > utils for API tasks)
//
// Returns only the files the LLM actually needs to see
// ─────────────────────────────────────────────────────────────
const scoreFileRelevance = (filePath, meta, keywords, intentRole) => {
  let score = 0;
  const name  = path.basename(filePath).toLowerCase();
  const desc  = (meta.description || "").toLowerCase();
  const funcs = (meta.functions || []).join(" ").toLowerCase();

  // Keyword matches
  for (const kw of keywords) {
    if (name.includes(kw))      score += 15;  // filename match = strongest
    if (desc.includes(kw))      score += 8;   // description match
    if (funcs.includes(kw))     score += 5;   // function name match
  }

  // Role-based boosting
  const role = meta.role || "other";
  if (role === intentRole)      score += 10;  // exact role match
  if (role === "entry")         score += 3;   // entry points often relevant
  if (role === "config")        score += 1;   // config sometimes needed

  // Penalize test files unless explicitly asking about tests
  if (role === "test" && !keywords.some((k) => ["test", "spec", "testing"].includes(k))) {
    score -= 5;
  }

  // Boost smaller files (easier to fit in context)
  if (meta.lineCount && meta.lineCount < 100) score += 2;

  return score;
};

// Detect the "intent role" from the prompt
const detectIntentRole = (prompt) => {
  const lo = prompt.toLowerCase();
  if (/\b(route|endpoint|api|controller|handler)\b/.test(lo))    return "controller";
  if (/\b(service|business logic|usecase)\b/.test(lo))           return "service";
  if (/\b(database|repository|model|schema|migration)\b/.test(lo)) return "repository";
  if (/\b(middleware|filter|guard|interceptor)\b/.test(lo))      return "middleware";
  if (/\b(config|setup|environment|settings)\b/.test(lo))        return "config";
  if (/\b(test|spec|testing)\b/.test(lo))                        return "test";
  if (/\b(util|helper|lib|common)\b/.test(lo))                   return "utility";
  return "";
};

// Smart file selector: ranks files and traverses dependency graph
const selectRelevantFiles = (prompt, indexFiles, archGraph) => {
  const keywords   = prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const intentRole = detectIntentRole(prompt);

  // Score all files
  const scored = Object.entries(indexFiles).map(([filePath, meta]) => ({
    filePath,
    meta,
    score: scoreFileRelevance(filePath, meta, keywords, intentRole),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Take top scored files
  const selected = new Set();
  const topN = Math.min(8, scored.length);

  for (let i = 0; i < topN; i++) {
    if (scored[i].score > 3) {
      selected.add(scored[i].filePath);
    }
  }

  // Expand with direct dependencies (1-hop graph traversal)
  const toExpand = [...selected];
  for (const file of toExpand) {
    const deps = archGraph[file] || [];
    for (const dep of deps) {
      selected.add(dep);
    }
    // Also add files that depend ON this file (reverse deps)
    for (const [source, targets] of Object.entries(archGraph)) {
      if (targets.includes(file)) selected.add(source);
    }
  }

  // Cap at 12 files to keep context manageable
  return [...selected].slice(0, 12);
};

// ─────────────────────────────────────────────────────────────
// MAIN: GET COMPRESSED CONTEXT
// Combines all 4 levels into a single, budget-aware context block
// ─────────────────────────────────────────────────────────────
const getCompressedContext = (task, modelName = "") => {
  const budget = detectBudget(modelName);

  // Check cache first
  const cacheKey = task.toLowerCase().replace(/\s+/g, "_").slice(0, 80);
  const cached   = getCached(cacheKey);
  if (cached && cached.context) {
    return {
      context: cached.context,
      stats: { ...cached.stats, fromCache: true },
    };
  }

  // Load repo index
  const { files: indexFiles, totalFiles } = loadIndex();
  if (!indexFiles || totalFiles === 0) {
    return { context: "", stats: { totalFiles: 0, full: 0, summarized: 0, ignored: 0, usedTokens: 0, budget } };
  }

  // Build architecture graph
  const archGraph = buildArchGraph(indexFiles);

  // Level 4: Smart file selection
  const relevantFiles = selectRelevantFiles(task, indexFiles, archGraph);

  // Build context with budget awareness
  const parts = [];
  let usedTokens = estimateTokens(task) + 300; // reserve for task + rules

  // Level 2: Architecture overview (compact, always included)
  const archText = formatArchGraph(archGraph, indexFiles);
  const archTokens = estimateTokens(archText);
  if (archTokens < budget * 0.15) {
    parts.push("REPO ARCHITECTURE:\n" + archText);
    usedTokens += archTokens;
  }

  // Level 3: Function signatures for relevant files
  const sigBlock = buildSignatureBlock(indexFiles, relevantFiles);
  const sigTokens = estimateTokens(sigBlock);
  if (sigBlock && usedTokens + sigTokens < budget * 0.35) {
    parts.push("FUNCTION SIGNATURES:\n" + sigBlock);
    usedTokens += sigTokens;
  }

  // Level 4: Full content of the most relevant files
  const fullFiles = [];
  const summarizedFiles = [];

  for (const filePath of relevantFiles) {
    if (!fileExists(filePath)) continue;
    const content = readFile(filePath);
    if (content.startsWith("ERROR")) continue;

    const tokens = estimateTokens(content);

    if (usedTokens + tokens < budget * 0.7) {
      // Fits in budget — load in full
      fullFiles.push({ filePath, content });
      usedTokens += tokens;
    } else {
      // Over budget — just include the summary
      const meta = indexFiles[filePath];
      if (meta) {
        summarizedFiles.push(
          `${filePath} [${meta.role}]: ${meta.description || ""}` +
          (meta.functions?.length ? ` | fn: ${meta.functions.slice(0, 4).join(", ")}` : "")
        );
        usedTokens += 30;
      }
    }
  }

  // Level 1: File summaries for remaining (non-selected) files
  const remainingFiles = Object.keys(indexFiles).filter((f) => !relevantFiles.includes(f));
  if (remainingFiles.length > 0 && usedTokens < budget * 0.85) {
    const summaries = [];
    for (const fp of remainingFiles) {
      if (usedTokens >= budget * 0.85) break;
      const meta = indexFiles[fp];
      summaries.push(`  • ${fp} [${meta.role}]: ${(meta.description || "").slice(0, 60)}`);
      usedTokens += 15;
    }
    if (summaries.length) {
      parts.push("OTHER FILES (summaries):\n" + summaries.join("\n"));
    }
  }

  // Add full file contents
  if (fullFiles.length) {
    parts.push("RELEVANT FILES (full content):");
    fullFiles.forEach(({ filePath, content }) =>
      parts.push(`FILE: ${filePath}\n---\n${content}\n---`)
    );
  }

  // Add summarized relevant files
  if (summarizedFiles.length) {
    parts.push("RELEVANT FILES (summaries — over budget for full load):\n" + summarizedFiles.join("\n"));
  }

  const context = parts.join("\n\n");

  const stats = {
    totalFiles,
    relevant: relevantFiles.length,
    full: fullFiles.length,
    summarized: summarizedFiles.length + remainingFiles.length,
    ignored: totalFiles - relevantFiles.length - remainingFiles.length,
    usedTokens,
    budget,
    fromCache: false,
  };

  // Store in cache
  setCached(cacheKey, { context, stats });

  return { context, stats };
};

// ─────────────────────────────────────────────────────────────
// LOG COMPRESSION STATS
// ─────────────────────────────────────────────────────────────
const logCCEStats = (stats) => {
  const pct    = Math.round((stats.usedTokens / stats.budget) * 100);
  const cached = stats.fromCache ? " ⚡ CACHED" : "";
  console.log(
    `\n🧠 CCE: ${stats.usedTokens}/${stats.budget} tokens (${pct}%)` +
    ` | Full: ${stats.full} | Relevant: ${stats.relevant || 0}` +
    ` | Summarized: ${stats.summarized} | Total: ${stats.totalFiles}${cached}`
  );
};

// ─────────────────────────────────────────────────────────────
// DISPLAY CCE INFO (for CLI command)
// ─────────────────────────────────────────────────────────────
const displayCCEInfo = () => {
  const { files: indexFiles, totalFiles } = loadIndex();
  const archGraph = buildArchGraph(indexFiles);

  console.log(`\n🧠 Context Compression Engine`);
  console.log(`${"═".repeat(50)}`);
  console.log(`  Indexed files: ${totalFiles}`);

  // Role breakdown
  const byRole = {};
  for (const [, meta] of Object.entries(indexFiles)) {
    const role = meta.role || "other";
    byRole[role] = (byRole[role] || 0) + 1;
  }
  console.log(`  Roles: ${Object.entries(byRole).map(([r, c]) => `${r}(${c})`).join(", ")}`);

  // Total functions
  const totalFns = Object.values(indexFiles).reduce((sum, m) => sum + (m.functions?.length || 0), 0);
  console.log(`  Functions indexed: ${totalFns}`);

  // Graph edges
  const edges = Object.values(archGraph).reduce((sum, deps) => sum + deps.length, 0);
  console.log(`  Dependency edges: ${edges}`);

  // Total lines
  const totalLines = Object.values(indexFiles).reduce((sum, m) => sum + (m.lineCount || 0), 0);
  console.log(`  Total source lines: ${totalLines.toLocaleString()}`);

  // Compression ratio
  const rawTokens  = Math.round(totalLines * 10); // ~10 tokens per line
  const compTokens = Object.keys(indexFiles).length * 20; // ~20 tokens per file summary
  if (rawTokens > 0) {
    const ratio = Math.round(rawTokens / compTokens);
    console.log(`  Compression ratio: ${ratio}:1 (${rawTokens.toLocaleString()} → ${compTokens.toLocaleString()} tokens)`);
  }

  console.log(`${"═".repeat(50)}`);

  // Show architecture
  const archText = formatArchGraph(archGraph, indexFiles);
  if (archText) {
    console.log(`\n${archText}`);
  }

  console.log();
};

module.exports = {
  getCompressedContext,
  logCCEStats,
  displayCCEInfo,
  selectRelevantFiles,
  buildFileSummaries,
  buildSignatureBlock,
  detectBudget,
  estimateTokens,
};
