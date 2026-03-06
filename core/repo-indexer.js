"use strict";

// ─────────────────────────────────────────────────────────────
// REPO INDEXER — Full Project Scanner
// Scans every source file once and produces a structured
// repo-index.json with file summaries, function signatures,
// imports, exports, and role classification.
//
// Runs on startup, caches to .agent-memory/repo-index.json.
// Only rebuilds entries whose files have changed (mtime check).
// ─────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");

const MEMORY_DIR  = path.join(process.cwd(), ".agent-memory");
const INDEX_FILE  = path.join(MEMORY_DIR, "repo-index.json");

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".agent-memory", "dist", "build",
  "__pycache__", ".next", "target", "vendor", ".gradle",
  "venv", ".venv", "env", ".env", "out", "coverage",
  ".idea", ".vscode",
]);

const SOURCE_EXTS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go",
  ".rs", ".rb", ".php", ".kt", ".cs", ".sh", ".yaml",
  ".yml", ".json", ".md",
]);

// ─────────────────────────────────────────────────────────────
// FILE ROLE CLASSIFICATION
// Detects what role a file plays in the architecture
// ─────────────────────────────────────────────────────────────
const classifyRole = (filePath, content) => {
  const name  = path.basename(filePath).toLowerCase();
  const full  = filePath.toLowerCase(); // includes directory names
  const lower = (content || "").toLowerCase().slice(0, 1500);

  // Test files
  if (/\b(test|spec|__test__|\.test\.|\.spec\.)\b/.test(name)) return "test";

  // Config/setup
  if (/\b(config|\.env|settings|setup|tsconfig|babel|webpack|vite|jest)\b/.test(name)) return "config";
  if (/(?:^|\/)config\//.test(full)) return "config";

  // Entry points
  if (/^(index|main|app|server)\.(js|ts|py|go|java)$/.test(name)) return "entry";

  // Controllers / routes
  if (/\b(controller|route|router|handler|endpoint|api)\b/.test(name)) return "controller";
  if (/(?:^|\/)controllers?\//.test(full)) return "controller";
  if (/\b(@(get|post|put|delete|patch)mapping|router\.(get|post|put))\b/.test(lower)) return "controller";

  // Services / business logic
  if (/\b(service|usecase|use-case|interactor)\b/.test(name)) return "service";
  if (/(?:^|\/)services?\//.test(full)) return "service";

  // Repositories / data access
  if (/\b(repository|repo|dao|model|schema|entity|migration)\b/.test(name)) return "repository";
  if (/(?:^|\/)(repositories|repos|models|entities)\//.test(full)) return "repository";

  // Middleware
  if (/\b(middleware|interceptor|guard|filter|pipe)\b/.test(name)) return "middleware";
  if (/(?:^|\/)middleware\//.test(full)) return "middleware";

  // Utilities
  if (/\b(util|helper|lib|common|shared|constant)\b/.test(name)) return "utility";
  if (/(?:^|\/)(utils|helpers|lib|common)\//.test(full)) return "utility";

  // DTOs / types
  if (/\b(dto|type|interface|contract|schema)\b/.test(name)) return "types";

  // Content-based fallback
  if (/\b(module\.exports|export\s+(default|const|function))\b/.test(lower)) return "module";
  if (/\bclass\s+\w+/.test(lower)) return "class";

  return "other";
};

// ─────────────────────────────────────────────────────────────
// FUNCTION SIGNATURE EXTRACTOR
// Extracts function names, parameters, and inferred return types
// Works for JS/TS/Python/Java/Go without an AST parser
// ─────────────────────────────────────────────────────────────
const extractSignatures = (content, filePath) => {
  const sigs = [];
  const ext  = path.extname(filePath).toLowerCase();
  const lines = (content || "").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // JS/TS: function declarations
    let m = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
    if (m) { sigs.push({ name: m[1], params: m[2].trim(), line: i + 1 }); continue; }

    // JS/TS: const arrow functions
    m = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?([^)=]*)\)?\s*=>/);
    if (m) { sigs.push({ name: m[1], params: m[2].trim(), line: i + 1 }); continue; }

    // JS/TS: class methods
    m = line.match(/^(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/);
    if (m && !["if", "for", "while", "switch", "catch", "else", "try"].includes(m[1])) {
      sigs.push({ name: m[1], params: m[2].trim(), line: i + 1 }); continue;
    }

    // Python: def
    if (ext === ".py") {
      m = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
      if (m) { sigs.push({ name: m[1], params: m[2].trim(), line: i + 1 }); continue; }
    }

    // Java/Go: method signatures
    if (ext === ".java") {
      m = line.match(/(?:public|private|protected)\s+(?:static\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)/);
      if (m) { sigs.push({ name: m[2], params: m[3].trim(), returnType: m[1], line: i + 1 }); continue; }
    }

    if (ext === ".go") {
      m = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)\s*(\w+(?:\s*,\s*\w+)*)?/);
      if (m) { sigs.push({ name: m[1], params: m[2].trim(), returnType: m[3] || "", line: i + 1 }); continue; }
    }
  }

  return sigs;
};

// ─────────────────────────────────────────────────────────────
// EXPORT NAME EXTRACTOR
// Finds what a file exports (module.exports, export, etc.)
// ─────────────────────────────────────────────────────────────
const extractExports = (content, filePath) => {
  const exports = [];
  const ext = path.extname(filePath).toLowerCase();

  if ([".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
    // module.exports = { a, b, c }
    const modExp = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    if (modExp) {
      modExp[1].split(",").forEach((e) => {
        const name = e.trim().split(":")[0].trim();
        if (name && /^\w+$/.test(name)) exports.push(name);
      });
    }

    // export const / export function / export default
    const esExports = content.matchAll(/export\s+(?:default\s+)?(?:const|let|var|function|class|async function)\s+(\w+)/g);
    for (const m of esExports) exports.push(m[1]);
  }

  if (ext === ".py") {
    // __all__ = [...]
    const allMatch = content.match(/__all__\s*=\s*\[([^\]]+)\]/);
    if (allMatch) {
      allMatch[1].split(",").forEach((e) => {
        const name = e.trim().replace(/['"]/g, "");
        if (name) exports.push(name);
      });
    }
  }

  return [...new Set(exports)];
};

// ─────────────────────────────────────────────────────────────
// IMPORT EXTRACTOR (enhanced from knowledge-store.js)
// ─────────────────────────────────────────────────────────────
const extractImports = (content, filePath) => {
  const imports = [];

  // JS/TS require
  for (const m of content.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    imports.push({ path: m[1], isLocal: m[1].startsWith(".") });
  }

  // ES6 import
  for (const m of content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g)) {
    imports.push({ path: m[1], isLocal: m[1].startsWith(".") });
  }

  // Python from ... import
  for (const m of content.matchAll(/(?:from\s+(\S+)\s+import|import\s+(\S+))/g)) {
    const mod = m[1] || m[2];
    imports.push({ path: mod, isLocal: mod.startsWith(".") });
  }

  // Java import
  for (const m of content.matchAll(/import\s+([\w.]+);/g)) {
    imports.push({ path: m[1], isLocal: false });
  }

  return imports;
};

// ─────────────────────────────────────────────────────────────
// ROLE DESCRIPTION GENERATOR
// Creates a 1-line human-readable description of the file
// ─────────────────────────────────────────────────────────────
const generateDescription = (filePath, content, role, sigs, exportNames) => {
  const baseName = path.basename(filePath, path.extname(filePath));
  const sigNames = sigs.slice(0, 5).map((s) => s.name);

  // Try to find a header comment
  const lines = (content || "").split("\n");
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const l = lines[i].trim();
    if (l.startsWith("//") || l.startsWith("#") || l.startsWith("*")) {
      const text = l.replace(/^[\/\*#\s!]+/, "").trim();
      if (text.length > 20 && text.length < 120
          && !/^[=\-─═╔╗╚╝║╠╣╦╩╬│┌┐└┘├┤▓░▒█\s]+$/.test(text) // skip separators
          && !/^[^\w]*$/.test(text)) { // skip non-word lines
        return text;
      }
    }
  }

  // Construct from metadata
  const parts = [];
  if (role !== "other") parts.push(`${role}`);
  if (sigNames.length) parts.push(`exports: ${sigNames.join(", ")}`);
  if (!parts.length) parts.push(`${baseName} module`);

  return parts.join(" — ");
};

// ─────────────────────────────────────────────────────────────
// FULL PROJECT SCANNER
// Walks the directory tree and collects all source files
// ─────────────────────────────────────────────────────────────
const scanSourceFiles = (dir = process.cwd(), depth = 0) => {
  if (depth > 8) return [];
  let results = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath  = path.relative(process.cwd(), fullPath);

      if (entry.isDirectory()) {
        results = results.concat(scanSourceFiles(fullPath, depth + 1));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            results.push({
              path: relPath,
              fullPath,
              size: stat.size,
              mtime: stat.mtime.getTime(),
            });
          } catch (_) {}
        }
      }

      if (results.length >= 1000) break; // safety cap
    }
  } catch (_) {}

  return results;
};

// ─────────────────────────────────────────────────────────────
// INDEX BUILDER
// Creates the repo-index.json with all 4 levels of data
// ─────────────────────────────────────────────────────────────
const buildIndex = (forceRebuild = false) => {
  // Load existing index for incremental updates
  let existingIndex = {};
  try {
    existingIndex = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch (_) {}

  const sourceFiles = scanSourceFiles();
  const index = {};
  let updated = 0;
  let cached  = 0;

  for (const file of sourceFiles) {
    // Skip if file hasn't changed since last index
    const existing = existingIndex[file.path];
    if (!forceRebuild && existing && existing.mtime === file.mtime) {
      index[file.path] = existing;
      cached++;
      continue;
    }

    // Read and analyze the file
    let content;
    try {
      content = fs.readFileSync(file.fullPath, "utf8");
    } catch (_) { continue; }

    const role        = classifyRole(file.path, content);
    const signatures  = extractSignatures(content, file.path);
    const exportNames = extractExports(content, file.path);
    const imports     = extractImports(content, file.path);
    const description = generateDescription(file.path, content, role, signatures, exportNames);
    const lineCount   = content.split("\n").length;

    index[file.path] = {
      role,
      description,
      functions:  signatures.map((s) => s.name),
      signatures: signatures.map((s) => {
        const ret = s.returnType ? ` → ${s.returnType}` : "";
        return `${s.name}(${s.params})${ret}`;
      }),
      exports: exportNames,
      imports: imports.filter((i) => i.isLocal).map((i) => i.path),
      externalDeps: imports.filter((i) => !i.isLocal).map((i) => i.path),
      lineCount,
      mtime: file.mtime,
    };

    updated++;
  }

  // Save the index
  try {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const output = {
      version: 1,
      indexedAt: new Date().toISOString(),
      totalFiles: Object.keys(index).length,
      files: index,
    };
    fs.writeFileSync(INDEX_FILE, JSON.stringify(output, null, 2));
  } catch (err) {
    console.error("❌ Failed to save repo index:", err.message);
  }

  return { totalFiles: Object.keys(index).length, updated, cached, files: index };
};

// ─────────────────────────────────────────────────────────────
// LOAD INDEX (with auto-rebuild if stale)
// ─────────────────────────────────────────────────────────────
const loadIndex = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    if (raw.files && Object.keys(raw.files).length > 0) {
      // Check age — rebuild if older than 10 minutes
      const age = Date.now() - new Date(raw.indexedAt).getTime();
      if (age > 10 * 60 * 1000) return buildIndex();
      return { totalFiles: raw.totalFiles, files: raw.files };
    }
  } catch (_) {}
  return buildIndex();
};

// ─────────────────────────────────────────────────────────────
// BUILD ARCHITECTURE GRAPH
// Generates a directed dependency graph from the index
// Format: { "controller/auth.js": ["service/auth.js", ...] }
// ─────────────────────────────────────────────────────────────
const buildArchGraph = (indexFiles) => {
  const graph = {};
  const fileSet = new Set(Object.keys(indexFiles));

  for (const [filePath, meta] of Object.entries(indexFiles)) {
    const deps = [];
    for (const imp of (meta.imports || [])) {
      // Resolve relative import to actual file path
      const dir     = path.dirname(filePath);
      const resolved = path.normalize(path.join(dir, imp));

      // Try with common extensions
      for (const ext of ["", ".js", ".ts", ".py", ".java", ".go", "/index.js", "/index.ts"]) {
        const candidate = resolved + ext;
        if (fileSet.has(candidate)) {
          deps.push(candidate);
          break;
        }
      }
    }
    if (deps.length) graph[filePath] = deps;
  }

  return graph;
};

// ─────────────────────────────────────────────────────────────
// FORMAT ARCHITECTURE GRAPH AS TEXT
// Renders a compact text summary of the architecture
// ─────────────────────────────────────────────────────────────
const formatArchGraph = (graph, indexFiles) => {
  const lines = [];
  const byRole = {};

  for (const [file, meta] of Object.entries(indexFiles)) {
    const role = meta.role || "other";
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(file);
  }

  // Show role grouping
  const roleOrder = ["entry", "controller", "middleware", "service", "repository", "utility", "types", "config", "test", "module", "class", "other"];
  for (const role of roleOrder) {
    const files = byRole[role];
    if (!files || !files.length) continue;
    lines.push(`[${role.toUpperCase()}] ${files.map((f) => path.basename(f)).join(", ")}`);
  }

  // Show key relationships
  if (Object.keys(graph).length) {
    lines.push("");
    lines.push("DEPENDENCIES:");
    for (const [from, deps] of Object.entries(graph)) {
      lines.push(`  ${path.basename(from)} → ${deps.map((d) => path.basename(d)).join(", ")}`);
    }
  }

  return lines.join("\n");
};

module.exports = {
  buildIndex,
  loadIndex,
  buildArchGraph,
  formatArchGraph,
  scanSourceFiles,
  extractSignatures,
  extractExports,
  extractImports,
  classifyRole,
};
