#!/usr/bin/env node
"use strict";

/**
 * 🧪 COMPREHENSIVE TEST SUITE
 * Tests: Persistent Fix Memory + Project Context Scanner
 * 
 * Run: node tests/test_all.js
 */

const fs = require("fs");
const path = require("path");
const memory = require("../tools/memory");
const scanner = require("../tools/scanner");

// ─────────────────────────────────────────────────────────────
// TEST UTILITIES
// ─────────────────────────────────────────────────────────────
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

const log = {
  pass: (msg) => console.log(`${colors.green}✅ PASS:${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}❌ FAIL:${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  INFO:${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}═════════════════════════════════════════${colors.reset}\n${colors.yellow}${msg}${colors.reset}\n${colors.cyan}═════════════════════════════════════════${colors.reset}`),
  subsection: (msg) => console.log(`\n${colors.magenta}▶ ${msg}${colors.reset}`)
};

let testsPassed = 0;
let testsFailed = 0;
const testResults = {
  memory: { passed: 0, failed: 0, tests: [] },
  scanner: { passed: 0, failed: 0, tests: [] }
};

const assert = (condition, message, category = "general") => {
  const result = { name: message, passed: condition };
  
  if (condition) {
    log.pass(message);
    testsPassed++;
    testResults[category].passed++;
  } else {
    log.fail(message);
    testsFailed++;
    testResults[category].failed++;
  }
  
  testResults[category].tests.push(result);
};

// ─────────────────────────────────────────────────────────────
// PART 1: PERSISTENT FIX MEMORY TESTS
// ─────────────────────────────────────────────────────────────
log.section("📚 PART 1: PERSISTENT FIX MEMORY");

log.subsection("1.1: Add Fix Entry");

try {
  const testEntry = memory.addFix(
    "test_file.js",
    "testFunction",
    "Fixed null pointer exception in test function",
    "function testFunction() {\n  return undefined;\n}",
    "function testFunction() {\n  return 'fixed';\n}",
    "bug_fix",
    ["test", "bugfix", "critical"]
  );
  
  assert(testEntry.id, "Should create entry with ID", "memory");
  assert(testEntry.file === "test_file.js", "Should store correct file path", "memory");
  assert(testEntry.function === "testFunction", "Should store correct function name", "memory");
  assert(testEntry.change_type === "bug_fix", "Should store correct change type", "memory");
  assert(Array.isArray(testEntry.tags), "Should store tags array", "memory");
  assert(testEntry.tags.includes("test"), "Should include 'test' tag", "memory");
  assert(testEntry.diff, "Should store diff object", "memory");
  assert(testEntry.diff.before.includes("undefined"), "Diff should contain before code", "memory");
  assert(testEntry.diff.after.includes("fixed"), "Diff should contain after code", "memory");
  
  log.info(`Created entry ID: ${testEntry.id}`);
} catch (err) {
  log.fail(`Add fix failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.2: Find Relevant Fixes");

try {
  const fixes = memory.findRelevantFixes({ file: "test_file", limit: 10 });
  
  assert(Array.isArray(fixes), "Should return array of fixes", "memory");
  assert(fixes.length > 0, "Should find at least one fix", "memory");
  
  const foundTest = fixes.find(f => f.file === "test_file.js");
  assert(foundTest, "Should find test_file.js fix", "memory");
  
  log.info(`Found ${fixes.length} relevant fix(es)`);
} catch (err) {
  log.fail(`Find fixes failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.3: Find by Tags");

try {
  const fixes = memory.findRelevantFixes({ tags: ["bugfix"], limit: 10 });
  
  assert(Array.isArray(fixes), "Should return array when filtering by tags", "memory");
  
  const hasBugfix = fixes.some(f => f.tags.includes("bugfix"));
  assert(hasBugfix, "Should find fixes with 'bugfix' tag", "memory");
  
  log.info(`Found ${fixes.length} bugfix tag match(es)`);
} catch (err) {
  log.fail(`Find by tags failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.4: Get Entry by ID");

try {
  const allEntries = memory.loadMemory();
  const testEntry = allEntries.find(e => e.file === "test_file.js");
  
  if (testEntry) {
    const retrieved = memory.getEntryById(testEntry.id);
    
    assert(retrieved, "Should retrieve entry by ID", "memory");
    assert(retrieved.id === testEntry.id, "Should return correct entry", "memory");
    assert(retrieved.description.includes("null pointer"), "Should have correct description", "memory");
    
    log.info(`Retrieved entry: ${retrieved.id}`);
  } else {
    log.fail("Test entry not found for ID lookup");
    testResults.memory.failed++;
  }
} catch (err) {
  log.fail(`Get by ID failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.5: Update Entry");

try {
  const allEntries = memory.loadMemory();
  const testEntry = allEntries.find(e => e.file === "test_file.js");
  
  if (testEntry) {
    const updated = memory.updateEntry(testEntry.id, {
      description: "Updated: Fixed null pointer exception (improved description)"
    });
    
    assert(updated, "Should update entry successfully", "memory");
    assert(
      updated.description.includes("Updated:"),
      "Should have updated description",
      "memory"
    );
    
    log.info(`Updated entry description`);
  } else {
    log.fail("Test entry not found for update");
    testResults.memory.failed++;
  }
} catch (err) {
  log.fail(`Update entry failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.6: Search by Code");

try {
  const results = memory.searchByCode("return 'fixed'", "after", 10);
  
  assert(Array.isArray(results), "Should return array from code search", "memory");
  
  const found = results.some(r => r.diff && r.diff.after.includes("fixed"));
  assert(found, "Should find entry containing 'fixed' in after code", "memory");
  
  log.info(`Found ${results.length} code match(es)`);
} catch (err) {
  log.fail(`Search by code failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.7: Get Memory Statistics");

try {
  const stats = memory.getStats();
  
  assert(stats.totalEntries >= 1, "Should have at least 1 entry", "memory");
  assert(typeof stats.byType === "object", "Should have byType stats", "memory");
  assert(Array.isArray(stats.topTags), "Should have topTags array", "memory");
  assert(stats.uniqueFiles >= 1, "Should track unique files", "memory");
  
  log.info(`Total entries: ${stats.totalEntries}`);
  log.info(`Unique files: ${stats.uniqueFiles}`);
  log.info(`Top tags: ${stats.topTags.map(t => t.tag).join(", ") || "none"}`);
} catch (err) {
  log.fail(`Get stats failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.8: Auto Record Change");

try {
  const oldContent = "function calculate() { return 1 + 1; }";
  const newContent = "function calculate() { return 2; }";
  
  const recorded = memory.autoRecordChange(
    "auto_test.js",
    oldContent,
    newContent,
    "Auto-test change"
  );
  
  assert(recorded, "Should auto-record change", "memory");
  assert(recorded.file === "auto_test.js", "Should track correct file", "memory");
  assert(recorded.tags.includes("js"), "Should auto-detect language tag", "memory");
  
  log.info(`Auto-recorded change for: ${recorded.file}`);
} catch (err) {
  log.fail(`Auto record failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.9: Get Context Suggestions");

try {
  const suggestions = memory.getContextSuggestions("test_file.js");
  
  assert(Array.isArray(suggestions), "Should return array of suggestions", "memory");
  
  if (suggestions.length > 0) {
    assert(suggestions[0].file, "Suggestion should have file", "memory");
    assert(suggestions[0].function, "Suggestion should have function", "memory");
    assert(suggestions[0].description, "Suggestion should have description", "memory");
  }
  
  log.info(`Got ${suggestions.length} context suggestion(s)`);
} catch (err) {
  log.fail(`Context suggestions failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.10: Export Memory");

try {
  const exportPath = path.join(__dirname, "export_test.json");
  const success = memory.exportMemory(exportPath);
  
  assert(success, "Should export memory successfully", "memory");
  assert(fs.existsSync(exportPath), "Export file should exist", "memory");
  
  const exported = JSON.parse(fs.readFileSync(exportPath, "utf8"));
  assert(Array.isArray(exported), "Exported data should be array", "memory");
  assert(exported.length >= 1, "Exported data should have entries", "memory");
  
  // Cleanup
  fs.unlinkSync(exportPath);
  
  log.info(`Exported ${exported.length} entries`);
} catch (err) {
  log.fail(`Export memory failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("1.11: Import Memory");

try {
  const importPath = path.join(__dirname, "import_test.json");
  const testData = [
    {
      id: "test-import-1",
      timestamp: new Date().toISOString(),
      file: "imported_file.js",
      function: "importedFunc",
      change_type: "feature",
      description: "Test imported fix",
      diff: { before: "old", after: "new" },
      tags: ["import", "test"]
    }
  ];
  
  fs.writeFileSync(importPath, JSON.stringify(testData, null, 2), "utf8");
  const success = memory.importMemory(importPath, true);
  
  assert(success, "Should import memory successfully", "memory");
  
  const entries = memory.loadMemory();
  const imported = entries.find(e => e.id === "test-import-1");
  assert(imported, "Should find imported entry", "memory");
  assert(imported.file === "imported_file.js", "Imported entry should have correct data", "memory");
  
  // Cleanup
  fs.unlinkSync(importPath);
  
  log.info(`Imported test entry successfully`);
} catch (err) {
  log.fail(`Import memory failed: ${err.message}`);
  testResults.memory.failed++;
}

// ─────────────────────────────────────────────────────────────
// PART 2: PROJECT CONTEXT SCANNER TESTS
// ─────────────────────────────────────────────────────────────
log.section("🗺️ PART 2: PROJECT CONTEXT SCANNER");

log.subsection("2.1: Full Project Scan");

try {
  const map = scanner.scanProject();
  
  assert(map.files.length > 0, "Should scan and find files", "scanner");
  assert(Array.isArray(map.files), "Files should be array", "scanner");
  assert(map.languages.js, "Should detect JavaScript files", "scanner");
  assert(map.files.includes("src/agent.js"), "Should include src/agent.js", "scanner");
  assert(map.files.includes("tools/scanner.js"), "Should include tools/scanner.js", "scanner");
  
  log.info(`Found ${map.files.length} files`);
  log.info(`Languages: ${Object.keys(map.languages).join(", ")}`);
  log.info(`Scan duration: ${map.scanDuration}ms`);
} catch (err) {
  log.fail(`Full scan failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.2: Cache File Verification");

try {
  const cacheExists = fs.existsSync(scanner.CACHE_FILE);
  assert(cacheExists, "project_map.json should exist", "scanner");
  
  if (cacheExists) {
    const cached = JSON.parse(fs.readFileSync(scanner.CACHE_FILE, "utf8"));
    assert(cached.files, "Cache should have files", "scanner");
    assert(cached.imports, "Cache should have imports", "scanner");
    assert(cached.languages, "Cache should have languages", "scanner");
    assert(cached.structures, "Cache should have structures", "scanner");
    assert(cached.lastScan, "Cache should have timestamp", "scanner");
    
    log.info(`Cache file: ${scanner.CACHE_FILE}`);
    log.info(`Cache size: ${fs.statSync(scanner.CACHE_FILE).size} bytes`);
  }
} catch (err) {
  log.fail(`Cache verification failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.3: Load from Cache");

try {
  const map = scanner.loadProjectMap();
  
  assert(map.files.length > 0, "Should load files from cache", "scanner");
  
  log.info(`Loaded ${map.files.length} files from cache`);
} catch (err) {
  log.fail(`Cache load failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.4: Import Detection");

try {
  const map = scanner.loadProjectMap();
  const agentImports = map.imports["src/agent.js"];
  
  assert(agentImports, "Should detect imports in src/agent.js", "scanner");
  
  if (agentImports) {
    assert(agentImports.includes("tools/file.js"), "Should detect tools/file.js", "scanner");
    assert(agentImports.includes("tools/memory.js"), "Should detect tools/memory.js", "scanner");
    assert(agentImports.includes("tools/scanner.js"), "Should detect tools/scanner.js", "scanner");
    
    log.info(`src/agent.js imports: ${agentImports.join(", ")}`);
  }
} catch (err) {
  log.fail(`Import detection failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.5: Dependency Analysis - Get Dependents");

try {
  const map = scanner.loadProjectMap();
  const dependents = scanner.getDependents("tools/file.js", map);
  
  assert(Array.isArray(dependents), "Should return array of dependents", "scanner");
  assert(dependents.includes("src/agent.js"), "src/agent.js should depend on tools/file.js", "scanner");
  
  log.info(`tools/file.js dependents: ${dependents.join(", ")}`);
} catch (err) {
  log.fail(`Get dependents failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.6: Dependency Analysis - Import Tree");

try {
  const map = scanner.loadProjectMap();
  const importTree = scanner.getImportTree("src/agent.js", map);
  
  assert(Array.isArray(importTree), "Should return array import tree", "scanner");
  assert(importTree.length >= 3, "Should have multiple transitive imports", "scanner");
  
  log.info(`src/agent.js import tree: ${importTree.join(", ")}`);
} catch (err) {
  log.fail(`Import tree failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.7: Structure Extraction");

try {
  const map = scanner.loadProjectMap();
  const structures = map.structures["src/agent.js"];
  
  assert(structures, "Should extract structures from src/agent.js", "scanner");
  assert(structures.functions.length > 0, "Should detect functions", "scanner");
  
  log.info(`src/agent.js has ${structures.functions.length} functions`);
  log.info(`Sample: ${structures.functions.slice(0, 5).join(", ")}...`);
} catch (err) {
  log.fail(`Structure extraction failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.8: Context Injection for LLM");

try {
  const map = scanner.loadProjectMap();
  const context = scanner.buildContextInjection("src/agent.js", map);
  
  assert(context.includes("src/agent.js"), "Context should mention file", "scanner");
  assert(context.includes("Functions:"), "Context should list functions", "scanner");
  assert(context.includes("Imports"), "Context should list imports", "scanner");
  
  log.info("Generated context:");
  console.log(context);
} catch (err) {
  log.fail(`Context injection failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.9: Quick Refresh");

try {
  const startTime = Date.now();
  const map = scanner.quickRefresh();
  const duration = Date.now() - startTime;
  
  assert(map.files.length > 0, "Quick refresh should return files", "scanner");
  assert(duration < 100, `Should be fast (${duration}ms)`, "scanner");
  
  log.info(`Quick refresh: ${duration}ms`);
} catch (err) {
  log.fail(`Quick refresh failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.10: File Hashing & Change Detection");

try {
  const hashCache = scanner.loadFileHashes();
  assert(Object.keys(hashCache).length > 0, "Should have cached hashes", "scanner");
  
  const testHash = scanner.generateFileHash("test content");
  assert(testHash.length === 32, "Hash should be 32 chars (MD5)", "scanner");
  
  const changes = scanner.detectChanges(
    { "old.js": "abc" },
    { "old.js": "def", "new.js": "ghi" }
  );
  
  assert(changes.changed.includes("old.js"), "Should detect changed files", "scanner");
  assert(changes.added.includes("new.js"), "Should detect added files", "scanner");
  
  log.info(`Cached hashes: ${Object.keys(hashCache).length} files`);
} catch (err) {
  log.fail(`Hashing failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.11: Targeted File Scan");

try {
  const result = scanner.scanFiles(["src/agent.js", "tools/memory.js"]);
  
  assert(result.files.length > 0, "Should scan targeted files", "scanner");
  assert(result.files.includes("src/agent.js"), "Should include src/agent.js", "scanner");
  assert(result.files.includes("tools/memory.js"), "Should include tools/memory.js", "scanner");
  
  log.info(`Scanned ${result.files.length} targeted files`);
} catch (err) {
  log.fail(`Targeted scan failed: ${err.message}`);
  testResults.scanner.failed++;
}

log.subsection("2.12: Get File Structures");

try {
  // Force full scan to ensure structures are populated
  const map = scanner.scanProject(scanner.PROJECT_ROOT, false);
  const structures = scanner.getFileStructures("tools/memory.js", map);
  
  assert(structures, "Should get structures for memory.js", "scanner");
  assert(structures.functions.length > 0, "Should have functions", "scanner");
  assert(structures.functions.includes("addFix"), "Should include 'addFix' function", "scanner");
  
  log.info(`tools/memory.js has ${structures.functions.length} functions`);
} catch (err) {
  log.fail(`Get file structures failed: ${err.message}`);
  testResults.scanner.failed++;
}

// ─────────────────────────────────────────────────────────────
// PART 3: INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────
log.section("🔗 PART 3: INTEGRATION TESTS (Memory + Scanner)");

log.subsection("3.1: Memory Context for Scanned Files");

try {
  const map = scanner.loadProjectMap();
  
  // Get suggestions for a scanned file
  const suggestions = memory.getContextSuggestions("src/agent.js");
  
  assert(Array.isArray(suggestions), "Should get suggestions for scanned file", "memory");
  
  log.info(`Got ${suggestions.length} suggestions for src/agent.js`);
} catch (err) {
  log.fail(`Integration test 1 failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("3.2: Auto-Record After Simulated Fix");

try {
  const testFile = "integration_test.js";
  const oldCode = "function test() { return 1; }";
  const newCode = "function test() { return 2; }";
  
  const recorded = memory.autoRecordChange(testFile, oldCode, newCode, "Integration test fix");
  
  assert(recorded, "Should record simulated fix", "memory");
  assert(recorded.file === testFile, "Should track correct file", "memory");
  
  // Verify we can find it
  const found = memory.findRelevantFixes({ file: testFile });
  assert(found.length > 0, "Should find recorded fix", "memory");
  
  log.info(`Auto-recorded integration test fix`);
} catch (err) {
  log.fail(`Integration test 2 failed: ${err.message}`);
  testResults.memory.failed++;
}

log.subsection("3.3: Full Workflow Simulation");

try {
  // Simulate: Scan project → Find file → Get context → Record fix → Retrieve later
  
  // Step 1: Scan
  const map = scanner.loadProjectMap();
  assert(map.files.length > 0, "Step 1: Scan project", "scanner");
  
  // Step 2: Get file context
  const context = scanner.buildContextInjection("src/agent.js", map);
  assert(context, "Step 2: Get context", "scanner");
  
  // Step 3: Record a fix
  const fix = memory.addFix(
    "workflow_test.js",
    "workflowFunc",
    "Workflow test fix",
    "old",
    "new",
    "feature",
    ["workflow"]
  );
  assert(fix.id, "Step 3: Record fix", "memory");
  
  // Step 4: Retrieve fix later
  const retrieved = memory.findRelevantFixes({ file: "workflow_test" });
  assert(retrieved.length > 0, "Step 4: Retrieve fix", "memory");
  
  log.info("Full workflow simulation completed successfully");
} catch (err) {
  log.fail(`Integration test 3 failed: ${err.message}`);
  testResults.memory.failed++;
  testResults.scanner.failed++;
}

// ─────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ─────────────────────────────────────────────────────────────
log.section("📊 FINAL TEST SUMMARY");

const totalTests = testsPassed + testsFailed;
const overallPassRate = ((testsPassed / totalTests) * 100).toFixed(1);

console.log(`\n${colors.cyan}┌─────────────────────────────────────────┐${colors.reset}`);
console.log(`${colors.cyan}│${colors.reset}  ${colors.yellow}COMPONENT BREAKDOWN${colors.reset}                        ${colors.cyan}│${colors.reset}`);
console.log(`${colors.cyan}├─────────────────────────────────────────┤${colors.reset}`);

// Memory stats
const memTotal = testResults.memory.passed + testResults.memory.failed;
const memRate = memTotal > 0 ? ((testResults.memory.passed / memTotal) * 100).toFixed(1) : 0;
console.log(`${colors.cyan}│${colors.reset}  ${colors.magenta}Persistent Memory:${colors.reset} ${testResults.memory.passed}/${memTotal} (${memRate}%)${" ".repeat(22 - memTotal.toString().length)}${colors.cyan}│${colors.reset}`);

// Scanner stats
const scanTotal = testResults.scanner.passed + testResults.scanner.failed;
const scanRate = scanTotal > 0 ? ((testResults.scanner.passed / scanTotal) * 100).toFixed(1) : 0;
console.log(`${colors.cyan}│${colors.reset}  ${colors.blue}Project Scanner:${colors.reset} ${testResults.scanner.passed}/${scanTotal} (${scanRate}%)${" ".repeat(23 - scanTotal.toString().length)}${colors.cyan}│${colors.reset}`);

console.log(`${colors.cyan}├─────────────────────────────────────────┤${colors.reset}`);
console.log(`${colors.cyan}│${colors.reset}  ${colors.green}TOTAL: ${testsPassed}/${totalTests} (${overallPassRate}%)${" ".repeat(26 - totalTests.toString().length)}${colors.cyan}│${colors.reset}`);
console.log(`${colors.cyan}└─────────────────────────────────────────┘${colors.reset}\n`);

// Detailed breakdown
console.log(`${colors.yellow}DETAILED RESULTS:${colors.reset}\n`);

testResults.memory.tests.forEach((t, i) => {
  const icon = t.passed ? "✅" : "❌";
  console.log(`${icon} Memory #${i + 1}: ${t.name}`);
});

console.log();

testResults.scanner.tests.forEach((t, i) => {
  const icon = t.passed ? "✅" : "❌";
  console.log(`${icon} Scanner #${i + 1}: ${t.name}`);
});

console.log();

if (testsFailed === 0) {
  console.log(`${colors.green}╔═════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║  🎉 ALL TESTS PASSED! SYSTEM READY!  ║${colors.reset}`);
  console.log(`${colors.green}╚═════════════════════════════════════════╝${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`${colors.red}⚠️  ${testsFailed} test(s) failed. Review output above.${colors.reset}\n`);
  process.exit(1);
}
