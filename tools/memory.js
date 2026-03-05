"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const MEMORY_FILE = path.join(process.cwd(), "persistent_memory.jsonl");
const INDEX_FILE = path.join(process.cwd(), "memory_index.json");
const MAX_ENTRIES = 1000; // prevent unbounded growth

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

// Generate a simple diff between two strings
const generateDiff = (before, after) => {
  if (before === after) return null;
  return { before, after };
};

// Create a hash for quick lookup
const hashEntry = (entry) => {
  const key = `${entry.file}:${entry.function}:${entry.timestamp}`;
  return crypto.createHash("md5").update(key).digest("hex");
};

// Normalize tags for consistent matching
const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  return tags.map(t => t.toLowerCase().trim()).filter(t => t);
};

// ─────────────────────────────────────────────────────────────
// INDEX MANAGEMENT (for fast lookups)
// ─────────────────────────────────────────────────────────────

const loadIndex = () => {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    }
  } catch (_) {}
  return { byFile: {}, byFunction: {}, byTag: {}, byHash: {} };
};

const saveIndex = (index) => {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Failed to save memory index:", err.message);
  }
};

const updateIndex = (entry, hash, operation = "add") => {
  const index = loadIndex();
  
  if (operation === "delete") {
    // Remove from all indices
    if (index.byFile[entry.file]) {
      index.byFile[entry.file] = index.byFile[entry.file].filter(h => h !== hash);
    }
    if (index.byFunction[entry.function]) {
      index.byFunction[entry.function] = index.byFunction[entry.function].filter(h => h !== hash);
    }
    entry.tags.forEach(tag => {
      if (index.byTag[tag]) {
        index.byTag[tag] = index.byTag[tag].filter(h => h !== hash);
      }
    });
    delete index.byHash[hash];
  } else {
    // Add to indices
    if (!index.byFile[entry.file]) index.byFile[entry.file] = [];
    if (!index.byFile[entry.file].includes(hash)) index.byFile[entry.file].push(hash);
    
    if (!index.byFunction[entry.function]) index.byFunction[entry.function] = [];
    if (!index.byFunction[entry.function].includes(hash)) index.byFunction[entry.function].push(hash);
    
    entry.tags.forEach(tag => {
      if (!index.byTag[tag]) index.byTag[tag] = [];
      if (!index.byTag[tag].includes(hash)) index.byTag[tag].push(hash);
    });
    
    index.byHash[hash] = { file: entry.file, function: entry.function, timestamp: entry.timestamp };
  }
  
  saveIndex(index);
};

// ─────────────────────────────────────────────────────────────
// CORE CRUD OPERATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Load all memory entries from JSONL file
 * @returns {Array} Array of memory entries
 */
const loadMemory = () => {
  const entries = [];
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const content = fs.readFileSync(MEMORY_FILE, "utf8");
      const lines = content.split("\n").filter(line => line.trim());
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch (_) {
          // Skip malformed lines
        }
      }
    }
  } catch (err) {
    console.error("❌ Failed to load memory:", err.message);
  }
  return entries;
};

/**
 * Append a single entry to JSONL file (efficient for writes)
 */
const appendEntry = (entry) => {
  try {
    fs.appendFileSync(MEMORY_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("❌ Failed to append memory entry:", err.message);
  }
};

/**
 * Rewrite entire memory file (used for compaction)
 */
const rewriteMemory = (entries) => {
  try {
    const content = entries.map(e => JSON.stringify(e)).join("\n");
    fs.writeFileSync(MEMORY_FILE, content + "\n", "utf8");
  } catch (err) {
    console.error("❌ Failed to rewrite memory:", err.message);
  }
};

/**
 * Add a new fix to memory
 * @param {string} file - File path
 * @param {string} func - Function name
 * @param {string} description - Description of the change
 * @param {string} codeBefore - Code before the change
 * @param {string} codeAfter - Code after the change
 * @param {string} changeType - Type: 'bug_fix', 'improvement', 'refactor', 'feature'
 * @param {Array<string>} tags - Optional tags for categorization
 * @returns {Object} The created entry
 */
const addFix = (file, func, description, codeBefore, codeAfter, changeType = "bug_fix", tags = []) => {
  const entries = loadMemory();
  
  // Enforce max entries limit (remove oldest)
  while (entries.length >= MAX_ENTRIES) {
    const removed = entries.shift();
    if (removed) {
      const oldHash = hashEntry(removed);
      updateIndex(removed, oldHash, "delete");
    }
  }
  
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    file,
    function: func,
    change_type: changeType,
    description,
    diff: generateDiff(codeBefore, codeAfter),
    tags: normalizeTags(tags)
  };
  
  entry.hash = hashEntry(entry);
  
  entries.push(entry);
  rewriteMemory(entries); // Rewrite to maintain consistency
  updateIndex(entry, entry.hash, "add");
  
  console.log(`💾 Memory saved: ${file}:${func} (${changeType})`);
  return entry;
};

/**
 * Find relevant fixes by various criteria
 * @param {Object} filters - Filter criteria
 * @param {string} filters.file - Filter by file path (partial match)
 * @param {string} filters.function - Filter by function name (partial match)
 * @param {Array<string>} filters.tags - Filter by tags (must match all)
 * @param {string} filters.changeType - Filter by change type
 * @param {number} filters.limit - Max results to return
 * @returns {Array} Matching entries
 */
const findRelevantFixes = (filters = {}) => {
  const index = loadIndex();
  let candidateHashes = new Set();
  let initialized = false;
  
  // Use index for fast lookup
  if (filters.file) {
    const fileHashes = Object.entries(index.byFile)
      .filter(([f]) => f.includes(filters.file))
      .flatMap(([, hashes]) => hashes);
    
    if (fileHashes.length > 0) {
      candidateHashes = new Set(fileHashes);
      initialized = true;
    }
  }
  
  if (filters.function) {
    const funcHashes = Object.entries(index.byFunction)
      .filter(([f]) => f.toLowerCase().includes(filters.function.toLowerCase()))
      .flatMap(([, hashes]) => hashes);
    
    if (initialized) {
      candidateHashes = new Set(funcHashes.filter(h => candidateHashes.has(h)));
    } else {
      candidateHashes = new Set(funcHashes);
      initialized = true;
    }
  }
  
  if (filters.tags && filters.tags.length > 0) {
    const normalizedTags = normalizeTags(filters.tags);
    const tagHashes = normalizedTags
      .map(tag => index.byTag[tag] || [])
      .reduce((acc, hashes) => acc.length ? acc.filter(h => hashes.includes(h)) : hashes, []);
    
    if (initialized) {
      candidateHashes = new Set(tagHashes.filter(h => candidateHashes.has(h)));
    } else {
      candidateHashes = new Set(tagHashes);
      initialized = true;
    }
  }
  
  // If no filters matched, load all hashes
  if (!initialized) {
    candidateHashes = new Set(Object.values(index.byHash).map(h => h.hash));
  }
  
  // Load full entries for candidate hashes
  const allEntries = loadMemory();
  const results = allEntries.filter(entry => {
    if (!candidateHashes.has(entry.hash)) return false;
    if (filters.changeType && entry.change_type !== filters.changeType) return false;
    return true;
  });
  
  // Sort by recency and apply limit
  const limit = filters.limit || 10;
  return results
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

/**
 * Get a specific entry by ID
 * @param {string} id - Entry ID
 * @returns {Object|null} The entry or null
 */
const getEntryById = (id) => {
  const entries = loadMemory();
  return entries.find(e => e.id === id) || null;
};

/**
 * Update an existing entry
 * @param {string} id - Entry ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated entry or null
 */
const updateEntry = (id, updates) => {
  const entries = loadMemory();
  const index = entries.findIndex(e => e.id === id);
  
  if (index === -1) {
    console.error(`❌ Entry not found: ${id}`);
    return null;
  }
  
  const oldEntry = entries[index];
  const oldHash = oldEntry.hash;
  
  // Remove old index entries
  updateIndex(oldEntry, oldHash, "delete");
  
  // Update entry
  entries[index] = { ...oldEntry, ...updates };
  entries[index].hash = hashEntry(entries[index]);
  
  rewriteMemory(entries);
  updateIndex(entries[index], entries[index].hash, "add");
  
  console.log(`✏️  Memory updated: ${entries[index].id}`);
  return entries[index];
};

/**
 * Delete an entry by ID
 * @param {string} id - Entry ID
 * @returns {boolean} Success status
 */
const deleteEntry = (id) => {
  const entries = loadMemory();
  const index = entries.findIndex(e => e.id === id);
  
  if (index === -1) {
    console.error(`❌ Entry not found: ${id}`);
    return false;
  }
  
  const entry = entries[index];
  updateIndex(entry, entry.hash, "delete");
  
  entries.splice(index, 1);
  rewriteMemory(entries);
  
  console.log(`🗑️  Memory deleted: ${id}`);
  return true;
};

/**
 * Get memory statistics
 * @returns {Object} Stats about the memory
 */
const getStats = () => {
  const entries = loadMemory();
  const index = loadIndex();
  
  const byType = {};
  const byFile = {};
  const allTags = [];
  
  entries.forEach(entry => {
    byType[entry.change_type] = (byType[entry.change_type] || 0) + 1;
    byFile[entry.file] = (byFile[entry.file] || 0) + 1;
    allTags.push(...entry.tags);
  });
  
  const tagCounts = {};
  allTags.forEach(tag => {
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  });
  
  return {
    totalEntries: entries.length,
    byType,
    byFile,
    topTags: Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count })),
    uniqueFiles: Object.keys(byFile).length,
    uniqueFunctions: Object.keys(index.byFunction).length
  };
};

/**
 * Export memory to a portable JSON file
 * @param {string} exportPath - Path to export to
 * @returns {boolean} Success status
 */
const exportMemory = (exportPath) => {
  try {
    const entries = loadMemory();
    fs.writeFileSync(exportPath, JSON.stringify(entries, null, 2), "utf8");
    console.log(`📤 Memory exported to: ${exportPath}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to export memory:", err.message);
    return false;
  }
};

/**
 * Import memory from a JSON file
 * @param {string} importPath - Path to import from
 * @param {boolean} merge - Whether to merge with existing (true) or replace (false)
 * @returns {boolean} Success status
 */
const importMemory = (importPath, merge = true) => {
  try {
    if (!fs.existsSync(importPath)) {
      console.error("❌ Import file not found:", importPath);
      return false;
    }
    
    const imported = JSON.parse(fs.readFileSync(importPath, "utf8"));
    if (!Array.isArray(imported)) {
      console.error("❌ Invalid import format: expected array");
      return false;
    }
    
    let entries = merge ? loadMemory() : [];
    const existingIds = new Set(entries.map(e => e.id));
    
    // Add new entries, skip duplicates
    let added = 0;
    for (const entry of imported) {
      if (!existingIds.has(entry.id)) {
        entry.hash = hashEntry(entry);
        entries.push(entry);
        updateIndex(entry, entry.hash, "add");
        added++;
      }
    }
    
    rewriteMemory(entries);
    console.log(`📥 Imported ${added} entries from: ${importPath}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to import memory:", err.message);
    return false;
  }
};

/**
 * Search memory by code content (simple substring match)
 * @param {string} codeSnippet - Code to search for
 * @param {string} mode - 'before', 'after', or 'both'
 * @param {number} limit - Max results
 * @returns {Array} Matching entries
 */
const searchByCode = (codeSnippet, mode = "both", limit = 10) => {
  const entries = loadMemory();
  const results = [];
  
  for (const entry of entries) {
    if (!entry.diff) continue;
    
    let match = false;
    if (mode === "before" || mode === "both") {
      match = entry.diff.before.includes(codeSnippet);
    }
    if (!match && (mode === "after" || mode === "both")) {
      match = entry.diff.after.includes(codeSnippet);
    }
    
    if (match) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  
  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

// ─────────────────────────────────────────────────────────────
// AGENT INTEGRATION HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Automatically detect and record a code change
 * Call this after the agent writes a file
 * @param {string} file - File path
 * @param {string} oldContent - Content before change
 * @param {string} newContent - Content after change
 * @param {string} description - Auto-generated or user-provided description
 */
const autoRecordChange = (file, oldContent, newContent, description = "") => {
  if (oldContent === newContent) return null;
  
  // Simple heuristic: find changed functions
  const funcPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/g;
  const changedFunctions = [];
  
  let match;
  while ((match = funcPattern.exec(newContent)) !== null) {
    const funcName = match[1] || match[2];
    changedFunctions.push(funcName);
  }
  
  // If no functions detected, use filename as context
  const func = changedFunctions[0] || path.basename(file, path.extname(file));
  
  // Auto-generate tags based on file type
  const ext = path.extname(file).slice(1);
  const tags = [ext];
  if (description.toLowerCase().includes("fix")) tags.push("bug_fix");
  if (description.toLowerCase().includes("improve")) tags.push("improvement");
  
  return addFix(
    file,
    func,
    description || `Updated ${func} in ${file}`,
    oldContent,
    newContent,
    "bug_fix",
    tags
  );
};

/**
 * Get context-aware suggestions for a file being edited
 * Call this before the agent starts working on a file
 * @param {string} file - File path
 * @param {string} functionName - Optional specific function
 * @returns {Array} Relevant past fixes
 */
const getContextSuggestions = (file, functionName = null) => {
  return findRelevantFixes({
    file,
    function: functionName,
    limit: 5
  });
};

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  // Core CRUD
  loadMemory,
  addFix,
  findRelevantFixes,
  getEntryById,
  updateEntry,
  deleteEntry,
  
  // Utilities
  getStats,
  searchByCode,
  
  // Import/Export
  exportMemory,
  importMemory,
  
  // Agent integration
  autoRecordChange,
  getContextSuggestions,
  
  // Config
  MEMORY_FILE,
  MAX_ENTRIES
};
