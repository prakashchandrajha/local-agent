"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CACHE_FILE = path.join(PROJECT_ROOT, "project_map.json");
const HASH_CACHE_FILE = path.join(PROJECT_ROOT, "file_hashes.json");

// File extensions to scan
const SUPPORTED_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".py", ".php", ".rb", ".go", ".rs", ".java"];

// Directories to skip
const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "coverage", ".qwen", "logs"];

// Time threshold for "recently modified" (24 hours in ms)
const RECENT_THRESHOLD = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// FILE HASHING FOR CHANGE DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * Generate MD5 hash of file content for change detection
 */
const generateFileHash = (content) => {
  return crypto.createHash("md5").update(content).digest("hex");
};

/**
 * Load cached file hashes from previous scan
 */
const loadFileHashes = () => {
  try {
    if (fs.existsSync(HASH_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(HASH_CACHE_FILE, "utf8"));
    }
  } catch (_) {}
  return {};
};

/**
 * Save file hashes for future change detection
 */
const saveFileHashes = (hashes) => {
  try {
    fs.writeFileSync(HASH_CACHE_FILE, JSON.stringify(hashes, null, 2), "utf8");
  } catch (err) {
    console.error("⚠️  Failed to save file hashes:", err.message);
  }
};

/**
 * Detect which files have changed since last scan
 * @param {Object} oldHashes - Previous file hashes
 * @param {Object} newHashes - Current file hashes
 * @returns {Object} Changed, added, and removed files
 */
const detectChanges = (oldHashes, newHashes) => {
  const changed = [];
  const added = [];
  const removed = [];

  // Check for changed and added files
  for (const [filePath, hash] of Object.entries(newHashes)) {
    if (!oldHashes[filePath]) {
      added.push(filePath);
    } else if (oldHashes[filePath] !== hash) {
      changed.push(filePath);
    }
  }

  // Check for removed files
  for (const filePath of Object.keys(oldHashes)) {
    if (!newHashes[filePath]) {
      removed.push(filePath);
    }
  }

  return { changed, added, removed };
};

// ─────────────────────────────────────────────────────────────
// IMPORT/DEPENDENCY DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * Extract imports/requires from file content
 * Supports: ES6 imports, CommonJS requires, dynamic imports
 * @param {string} content - File content
 * @param {string} filePath - Relative file path
 * @param {string} ext - File extension
 * @returns {Array} List of imported file paths
 */
const extractImports = (content, filePath, ext) => {
  const imports = [];
  const dir = path.dirname(filePath);

  // Only parse imports for JS/TS files
  if (![".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
    return imports;
  }

  // ES6 imports: import ... from 'path'
  const es6ImportRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  // CommonJS requires: require('path')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // Dynamic imports: import('path')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const patterns = [es6ImportRegex, requireRegex, dynamicImportRegex];

  for (const pattern of patterns) {
    pattern.lastIndex = 0; // Reset regex state
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];

      // Skip node_modules (no '.' prefix and no extension)
      if (!importPath.startsWith(".") && !importPath.endsWith(".js") && !importPath.endsWith(".ts")) {
        continue;
      }

      // Resolve relative import to absolute project path
      let resolvedPath = importPath;
      if (!resolvedPath.endsWith(".js") && !resolvedPath.endsWith(".ts")) {
        resolvedPath += ".js"; // Default to .js for extensionless imports
      }

      const fullPath = path.join(dir, resolvedPath);
      imports.push(fullPath);
    }
  }

  // Remove duplicates
  return [...new Set(imports)];
};

/**
 * Extract function and class names from file content
 * For lazy dependency resolution and caching
 * @param {string} content - File content
 * @param {string} ext - File extension
 * @returns {Object} Detected structures
 */
const extractStructures = (content, ext) => {
  const structures = {
    functions: [],
    classes: [],
    exports: []
  };

  if (![".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
    return structures;
  }

  // Function declarations
  const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    structures.functions.push(match[1]);
  }

  // Arrow functions assigned to const/let/var
  const arrowFuncRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
  while ((match = arrowFuncRegex.exec(content)) !== null) {
    structures.functions.push(match[1]);
  }

  // Class declarations
  const classRegex = /(?:export\s+)?class\s+(\w+)/g;
  while ((match = classRegex.exec(content)) !== null) {
    structures.classes.push(match[1]);
  }

  // Exports (named and default)
  const exportRegex = /export\s+(?:default\s+)?(?:\{[^}]+\}|[\w]+)/g;
  while ((match = exportRegex.exec(content)) !== null) {
    structures.exports.push(match[0]);
  }

  return structures;
};

// ─────────────────────────────────────────────────────────────
// PROJECT SCANNING
// ─────────────────────────────────────────────────────────────

/**
 * Recursively walk directory and collect file info
 * @param {string} dir - Directory to scan
 * @param {Object} options - Scan options
 * @returns {Object} Project map data
 */
const walkDirectory = (dir, options = {}) => {
  const {
    baseDir = PROJECT_ROOT,
    oldHashes = {},
    quickScan = false,
    targetFiles = []
  } = options;

  const result = {
    files: [],
    recentlyModified: [],
    imports: {},
    languages: {},
    structures: {},
    hashes: {}
  };

  const now = Date.now();

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      console.error(`⚠️  Cannot read directory: ${currentDir}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Skip ignored directories
      if (entry.isDirectory()) {
        if (SKIP_DIRS.includes(entry.name)) continue;
        walk(fullPath);
        continue;
      }

      // Skip non-files
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name);

      // Skip unsupported file types
      if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

      // If targetFiles specified, only scan those
      if (targetFiles.length > 0 && !targetFiles.includes(relativePath)) continue;

      // Read file stats
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch (err) {
        continue; // Skip if can't stat
      }

      const langKey = ext.slice(1); // Remove leading dot

      // Track file
      result.files.push(relativePath);

      // Track by language
      if (!result.languages[langKey]) {
        result.languages[langKey] = [];
      }
      result.languages[langKey].push(relativePath);

      // Track recently modified
      if (now - stats.mtimeMs < RECENT_THRESHOLD) {
        result.recentlyModified.push(relativePath);
      }

      // Quick scan mode: skip parsing if file unchanged
      if (quickScan && oldHashes[relativePath]) {
        result.hashes[relativePath] = oldHashes[relativePath];
        continue;
      }

      // Read file content
      let content;
      try {
        content = fs.readFileSync(fullPath, "utf8");
      } catch (err) {
        continue; // Skip if can't read
      }

      // Generate hash
      const hash = generateFileHash(content);
      result.hashes[relativePath] = hash;

      // Extract imports
      const imports = extractImports(content, relativePath, ext);
      if (imports.length > 0) {
        result.imports[relativePath] = imports;
      }

      // Extract structures (for caching)
      const structures = extractStructures(content, ext);
      if (structures.functions.length > 0 || structures.classes.length > 0) {
        result.structures[relativePath] = structures;
      }
    }
  }

  walk(dir);
  return result;
};

/**
 * Full project scan
 * @param {string} dir - Directory to scan (default: project root)
 * @param {boolean} quick - Quick scan mode (skip unchanged files)
 * @returns {Object} Project map
 */
const scanProject = (dir = PROJECT_ROOT, quick = false) => {
  console.log("🔍 Scanning project...");

  const oldHashes = quick ? loadFileHashes() : {};
  const startTime = Date.now();

  // Full walk
  const projectMap = walkDirectory(dir, {
    baseDir: PROJECT_ROOT,
    oldHashes,
    quickScan: quick
  });

  // Detect changes if quick scan
  let changeSummary = "";
  if (quick) {
    const changes = detectChanges(oldHashes, projectMap.hashes);
    changeSummary = ` (Δ: ${changes.changed.length} changed, ${changes.added.length} added, ${changes.removed.length} removed)`;
  }

  // Save caches
  saveFileHashes(projectMap.hashes);

  // Save project map (without hashes for cleaner API usage)
  const mapToSave = {
    files: projectMap.files,
    recentlyModified: projectMap.recentlyModified,
    imports: projectMap.imports,
    languages: projectMap.languages,
    structures: projectMap.structures,
    lastScan: new Date().toISOString(),
    scanDuration: Date.now() - startTime
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(mapToSave, null, 2), "utf8");

  console.log(`✅ Project scan complete${changeSummary}`);
  console.log(`   Files: ${projectMap.files.length}`);
  console.log(`   Recently modified: ${projectMap.recentlyModified.length}`);
  console.log(`   Languages: ${Object.keys(projectMap.languages).join(", ") || "none"}`);
  console.log(`   Duration: ${Date.now() - startTime}ms`);
  console.log(`   Map saved to: project_map.json`);

  return mapToSave;
};

/**
 * Load project map from cache (auto-scan if not exists)
 * @param {boolean} forceRefresh - Force full rescan
 * @returns {Object} Project map
 */
const loadProjectMap = (forceRefresh = false) => {
  if (!forceRefresh && fs.existsSync(CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      console.log("📦 Loaded cached project map");
      return cached;
    } catch (_) {}
  }
  return scanProject(PROJECT_ROOT, false);
};

/**
 * Quick refresh: only update changed files
 * @returns {Object} Updated project map
 */
const quickRefresh = () => {
  console.log("⚡ Quick refresh (changed files only)...");
  const oldMap = loadProjectMap(false);
  const newMap = scanProject(PROJECT_ROOT, true);

  // Merge unchanged data from old map
  for (const [filePath, structures] of Object.entries(oldMap.structures)) {
    if (!newMap.structures[filePath] && newMap.hashes && oldMap.hashes && newMap.hashes[filePath] === oldMap.hashes[filePath]) {
      newMap.structures[filePath] = structures;
    }
  }

  // Re-save merged map
  fs.writeFileSync(CACHE_FILE, JSON.stringify(newMap, null, 2), "utf8");

  return newMap;
};

/**
 * Scan specific files only (for targeted updates)
 * @param {Array<string>} filePaths - Relative file paths to scan
 * @returns {Object} Scan results for specified files
 */
const scanFiles = (filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { files: [], imports: {}, structures: {} };
  }

  console.log(`🎯 Scanning ${filePaths.length} file(s)...`);

  const result = walkDirectory(PROJECT_ROOT, {
    baseDir: PROJECT_ROOT,
    targetFiles: filePaths
  });

  return {
    files: result.files,
    imports: result.imports,
    structures: result.structures,
    hashes: result.hashes
  };
};

/**
 * Get dependency chain for a file (all files that import it)
 * @param {string} filePath - File to find dependents for
 * @param {Object} projectMap - Optional pre-loaded map
 * @returns {Array} Files that depend on this file
 */
const getDependents = (filePath, projectMap = null) => {
  if (!projectMap) {
    projectMap = loadProjectMap();
  }

  const dependents = [];
  const normalizedPath = filePath.replace(/^\//, "").replace(/\.js$/, "");

  for (const [file, imports] of Object.entries(projectMap.imports)) {
    for (const imp of imports) {
      const normalizedImp = imp.replace(/^\//, "").replace(/\.js$/, "");
      if (normalizedImp === normalizedPath) {
        dependents.push(file);
        break;
      }
    }
  }

  return dependents;
};

/**
 * Get all imports for a file (recursive dependency tree)
 * @param {string} filePath - File to get imports for
 * @param {Object} projectMap - Optional pre-loaded map
 * @param {Set} visited - Track visited files (prevent cycles)
 * @returns {Array} All transitive dependencies
 */
const getImportTree = (filePath, projectMap = null, visited = new Set()) => {
  if (!projectMap) {
    projectMap = loadProjectMap();
  }

  const normalizedPath = filePath.replace(/^\//, "");
  if (visited.has(normalizedPath)) {
    return []; // Prevent infinite loops
  }
  visited.add(normalizedPath);

  const directImports = projectMap.imports[normalizedPath] || [];
  const allImports = new Set(directImports);

  // Recursively get imports of imports
  for (const imp of directImports) {
    const transitive = getImportTree(imp, projectMap, visited);
    for (const t of transitive) {
      allImports.add(t);
    }
  }

  return [...allImports];
};

/**
 * Get cached structures for a file (functions, classes)
 * @param {string} filePath - File path
 * @param {Object} projectMap - Optional pre-loaded map
 * @returns {Object|null} Structures or null
 */
const getFileStructures = (filePath, projectMap = null) => {
  if (!projectMap) {
    projectMap = loadProjectMap();
  }

  const normalizedPath = filePath.replace(/^\//, "");
  return projectMap.structures[normalizedPath] || null;
};

/**
 * Build context injection for LLM prompt
 * Injects only relevant files based on task
 * @param {string} targetFile - File being worked on
 * @param {Object} projectMap - Optional pre-loaded map
 * @returns {string} Context string for prompt
 */
const buildContextInjection = (targetFile, projectMap = null) => {
  if (!projectMap) {
    projectMap = loadProjectMap();
  }

  const normalizedPath = targetFile.replace(/^\//, "");
  const imports = projectMap.imports[normalizedPath] || [];
  const dependents = getDependents(normalizedPath, projectMap);
  const structures = getFileStructures(normalizedPath, projectMap);

  let context = `\n📁 Active file: ${normalizedPath}\n`;

  if (structures) {
    if (structures.functions.length > 0) {
      context += `   Functions: ${structures.functions.join(", ")}\n`;
    }
    if (structures.classes.length > 0) {
      context += `   Classes: ${structures.classes.join(", ")}\n`;
    }
  }

  if (imports.length > 0) {
    context += `   Imports (${imports.length}): ${imports.join(", ")}\n`;
  }

  if (dependents.length > 0) {
    context += `   Dependents (${dependents.length}): ${dependents.join(", ")}\n`;
  }

  return context;
};

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  // Core scanning
  scanProject,
  loadProjectMap,
  quickRefresh,
  scanFiles,

  // Dependency analysis
  getDependents,
  getImportTree,
  getFileStructures,

  // Context injection
  buildContextInjection,

  // Utilities
  extractImports,
  extractStructures,
  detectChanges,
  generateFileHash,
  loadFileHashes,

  // Config
  PROJECT_ROOT,
  CACHE_FILE,
  HASH_CACHE_FILE,
  SUPPORTED_EXTENSIONS,
  SKIP_DIRS
};
