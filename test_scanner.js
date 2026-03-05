#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const scanner = require("./tools/scanner");

// ─────────────────────────────────────────────────────────────
// TEST UTILITIES
// ─────────────────────────────────────────────────────────────
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

const log = {
  pass: (msg) => console.log(`${colors.green}✅ PASS:${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}❌ FAIL:${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  INFO:${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}─────────────────────────────────────────${colors.reset}\n${colors.yellow}${msg}${colors.reset}\n${colors.cyan}─────────────────────────────────────────${colors.reset}`)
};

let testsPassed = 0;
let testsFailed = 0;

const assert = (condition, message) => {
  if (condition) {
    log.pass(message);
    testsPassed++;
  } else {
    log.fail(message);
    testsFailed++;
  }
};

// ─────────────────────────────────────────────────────────────
// TEST 1: FULL PROJECT SCAN
// ─────────────────────────────────────────────────────────────
log.section("TEST 1: Full Project Scan");

try {
  const map = scanner.scanProject();
  
  assert(map.files.length > 0, "Files array should not be empty");
  assert(Array.isArray(map.files), "Files should be an array");
  assert(map.languages.js, "Should detect JavaScript files");
  assert(map.files.includes("agent.js"), "Should include agent.js");
  assert(map.files.includes("tools/scanner.js"), "Should include tools/scanner.js");
  
  log.info(`Found ${map.files.length} files`);
  log.info(`Languages: ${Object.keys(map.languages).join(", ")}`);
  log.info(`Scan duration: ${map.scanDuration}ms`);
} catch (err) {
  log.fail(`Full scan failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 2: CACHE FILE CREATION
// ─────────────────────────────────────────────────────────────
log.section("TEST 2: Cache File Creation");

try {
  const cacheExists = fs.existsSync(scanner.CACHE_FILE);
  assert(cacheExists, "project_map.json should exist after scan");
  
  if (cacheExists) {
    const cached = JSON.parse(fs.readFileSync(scanner.CACHE_FILE, "utf8"));
    assert(cached.files, "Cache should contain files array");
    assert(cached.imports, "Cache should contain imports map");
    assert(cached.languages, "Cache should contain languages map");
    assert(cached.structures, "Cache should contain structures map");
    assert(cached.lastScan, "Cache should have lastScan timestamp");
    
    log.info(`Cache file size: ${fs.statSync(scanner.CACHE_FILE).size} bytes`);
  }
} catch (err) {
  log.fail(`Cache test failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 3: LOAD FROM CACHE
// ─────────────────────────────────────────────────────────────
log.section("TEST 3: Load Project Map from Cache");

try {
  const map = scanner.loadProjectMap();
  
  assert(map.files.length > 0, "Should load files from cache");
  assert(map.files.length > 0, "Cache should have same file count");
  
  log.info(`Loaded ${map.files.length} files from cache`);
} catch (err) {
  log.fail(`Cache load failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 4: IMPORT DETECTION
// ─────────────────────────────────────────────────────────────
log.section("TEST 4: Import Detection");

try {
  const map = scanner.loadProjectMap();
  
  // Check if agent.js imports are detected
  const agentImports = map.imports["agent.js"];
  assert(agentImports, "Should detect imports in agent.js");
  
  if (agentImports) {
    assert(
      agentImports.includes("tools/file.js"),
      "Should detect tools/file.js import"
    );
    assert(
      agentImports.includes("tools/memory.js"),
      "Should detect tools/memory.js import"
    );
    assert(
      agentImports.includes("tools/scanner.js"),
      "Should detect tools/scanner.js import"
    );
    
    log.info(`agent.js imports: ${agentImports.join(", ")}`);
  }
} catch (err) {
  log.fail(`Import detection failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 5: DEPENDENCY ANALYSIS
// ─────────────────────────────────────────────────────────────
log.section("TEST 5: Dependency Analysis");

try {
  const map = scanner.loadProjectMap();
  
  // Test getDependents
  const fileDependents = scanner.getDependents("tools/file.js", map);
  assert(Array.isArray(fileDependents), "getDependents should return array");
  assert(
    fileDependents.includes("agent.js"),
    "agent.js should depend on tools/file.js"
  );
  log.info(`tools/file.js dependents: ${fileDependents.join(", ")}`);
  
  // Test getImportTree
  const importTree = scanner.getImportTree("agent.js", map);
  assert(Array.isArray(importTree), "getImportTree should return array");
  log.info(`agent.js import tree: ${importTree.join(", ")}`);
  
} catch (err) {
  log.fail(`Dependency analysis failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 6: STRUCTURE EXTRACTION
// ─────────────────────────────────────────────────────────────
log.section("TEST 6: Structure Extraction (Functions/Classes)");

try {
  const map = scanner.loadProjectMap();
  
  const agentStructures = map.structures["agent.js"];
  assert(agentStructures, "Should extract structures from agent.js");
  
  if (agentStructures) {
    assert(
      agentStructures.functions.length > 0,
      "Should detect functions in agent.js"
    );
    assert(
      agentStructures.functions.includes("run"),
      "Should detect 'run' function"
    );
    assert(
      agentStructures.functions.includes("buildSystemPrompt"),
      "Should detect 'buildSystemPrompt' function"
    );
    
    log.info(`agent.js has ${agentStructures.functions.length} functions`);
    log.info(`Sample functions: ${agentStructures.functions.slice(0, 5).join(", ")}...`);
  }
} catch (err) {
  log.fail(`Structure extraction failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 7: CONTEXT INJECTION
// ─────────────────────────────────────────────────────────────
log.section("TEST 7: Context Injection for LLM");

try {
  const map = scanner.loadProjectMap();
  const context = scanner.buildContextInjection("agent.js", map);
  
  assert(context.includes("agent.js"), "Context should mention active file");
  assert(context.includes("Functions:"), "Context should list functions");
  assert(context.includes("Imports"), "Context should list imports");
  
  log.info("Generated context:");
  console.log(context);
} catch (err) {
  log.fail(`Context injection failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 8: QUICK REFRESH
// ─────────────────────────────────────────────────────────────
log.section("TEST 8: Quick Refresh (Changed Files Only)");

try {
  const startTime = Date.now();
  const map = scanner.quickRefresh();
  const duration = Date.now() - startTime;
  
  assert(map.files.length > 0, "Quick refresh should return files");
  assert(duration < 100, `Quick refresh should be fast (${duration}ms)`);
  
  log.info(`Quick refresh completed in ${duration}ms`);
  log.info(`Files scanned: ${map.files.length}`);
} catch (err) {
  log.fail(`Quick refresh failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 9: FILE HASHING & CHANGE DETECTION
// ─────────────────────────────────────────────────────────────
log.section("TEST 9: File Hashing & Change Detection");

try {
  const hashCache = scanner.loadFileHashes();
  const hashCacheExists = fs.existsSync(scanner.HASH_CACHE_FILE);
  
  assert(hashCacheExists, "file_hashes.json should exist");
  assert(Object.keys(hashCache).length > 0, "Should have cached hashes");
  
  // Test hash generation
  const testContent = "const test = 123;";
  const hash = scanner.generateFileHash(testContent);
  assert(hash.length === 32, "Hash should be 32 characters (MD5)");
  
  // Test change detection
  const oldHashes = { "test.js": "abc123" };
  const newHashes = { "test.js": "def456", "new.js": "ghi789" };
  const changes = scanner.detectChanges(oldHashes, newHashes);
  
  assert(changes.changed.includes("test.js"), "Should detect changed files");
  assert(changes.added.includes("new.js"), "Should detect added files");
  
  log.info(`Cached hashes: ${Object.keys(hashCache).length} files`);
} catch (err) {
  log.fail(`Hashing test failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 10: SCAN SPECIFIC FILES
// ─────────────────────────────────────────────────────────────
log.section("TEST 10: Scan Specific Files (Targeted)");

try {
  const result = scanner.scanFiles(["agent.js", "tools/memory.js"]);
  
  assert(result.files.length > 0, "Should scan specified files");
  assert(result.files.includes("agent.js"), "Should include agent.js");
  assert(result.files.includes("tools/memory.js"), "Should include tools/memory.js");
  
  log.info(`Scanned ${result.files.length} targeted files`);
} catch (err) {
  log.fail(`Targeted scan failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────
log.section("📊 TEST SUMMARY");

const total = testsPassed + testsFailed;
const passRate = ((testsPassed / total) * 100).toFixed(1);

console.log(`\nTotal tests: ${total}`);
console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
console.log(`Pass rate: ${passRate}%\n`);

if (testsFailed === 0) {
  console.log(`${colors.green}🎉 All tests passed! Scanner is working correctly.${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`${colors.red}⚠️  ${testsFailed} test(s) failed. Review output above.${colors.reset}\n`);
  process.exit(1);
}
