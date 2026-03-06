"use strict";

// ─────────────────────────────────────────────────────────────
// ERE TEST SUITE
// Tests the Execution & Recovery Engine
// Run: node tests/test-ere.js
// ─────────────────────────────────────────────────────────────

const path = require("path");
const fs   = require("fs");

// Set CWD to project root
process.chdir(path.join(__dirname, ".."));

const {
  tryQuickFix,
  buildErrorOnlyPrompt,
  extractErrorLine,
  getCachedFix,
  cacheFix,
  QUICK_FIX_PATTERNS,
} = require("../core/ere");

let passed = 0;
let failed = 0;

const assert = (condition, name) => {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}`);
    failed++;
  }
};

// ─────────────────────────────────────────────────────────────
// TEST 1: Quick-fix patterns exist
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 1: Quick-fix Pattern Registry");
assert(QUICK_FIX_PATTERNS.length >= 5, `Has ${QUICK_FIX_PATTERNS.length} patterns (expected >=5)`);
assert(QUICK_FIX_PATTERNS.every((p) => p.name && p.test && p.fix), "All patterns have name, test, fix");

// ─────────────────────────────────────────────────────────────
// TEST 2: Pattern matching — detect correct errors
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 2: Pattern Matching");

// Cannot find module
const npmMatch = QUICK_FIX_PATTERNS.find((p) => p.name === "missing_npm_module");
assert(npmMatch.test("Error: Cannot find module 'redis'") === "redis", "Detects missing npm module");
assert(npmMatch.test("Error: Cannot find module './local-file'") === null, "Skips relative imports");
assert(npmMatch.test("Everything is fine") === null, "No false positive on clean text");

// Python module
const pyMatch = QUICK_FIX_PATTERNS.find((p) => p.name === "missing_python_module");
assert(pyMatch.test("ModuleNotFoundError: No module named 'flask'") === "flask", "Detects missing Python module");

// Port in use
const portMatch = QUICK_FIX_PATTERNS.find((p) => p.name === "port_in_use");
assert(portMatch.test("Error: listen EADDRINUSE: address already in use :::3000") === "3000", "Detects port in use");

// Missing directory
const dirMatch = QUICK_FIX_PATTERNS.find((p) => p.name === "missing_directory");
assert(dirMatch.test("Error: ENOENT: no such file or directory, open '/tmp/test-dir'") !== null, "Detects missing directory");
assert(dirMatch.test("Error: ENOENT: no such file or directory, open '/tmp/test.js'") === null, "Skips files (has extension)");

// Permission denied
const permMatch = QUICK_FIX_PATTERNS.find((p) => p.name === "permission_denied");
assert(permMatch.test("Error: EACCES: permission denied, access '/usr/local/bin/script'") !== null, "Detects permission denied");

// ─────────────────────────────────────────────────────────────
// TEST 3: Error line extraction
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 3: Error Line Extraction");
assert(extractErrorLine("TypeError at line 42") === 42, "Extracts 'at line 42'");
assert(extractErrorLine("app.js:17:5") === 17, "Extracts ':17:5' format");
assert(extractErrorLine("at Object.<anonymous> (/home/user/app.js:23:10)") === 23, "Extracts stack trace line");
assert(extractErrorLine("line: 99") === 99, "Extracts 'line: 99'");
assert(extractErrorLine("Everything is fine") === null, "Returns null for clean text");

// ─────────────────────────────────────────────────────────────
// TEST 4: Error-only prompt builder
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 4: Error-Only Prompt");

const sampleCode = Array.from({ length: 50 }, (_, i) => `// line ${i + 1}`).join("\n");
const sampleError = "TypeError: Cannot read properties of undefined\n    at Object.<anonymous> (test.js:25:10)";

const prompt = buildErrorOnlyPrompt("test.js", sampleError, sampleCode);
assert(prompt.includes("ERROR in test.js"), "Prompt has file name");
assert(prompt.includes("Cannot read properties of undefined"), "Prompt has error message");
assert(prompt.includes(">>> 25:"), "Prompt highlights error line");
assert(prompt.includes("Fix the error"), "Prompt has fix instruction");
assert(prompt.length < 2000, `Prompt is compact: ${prompt.length} chars (expected <2000)`);

// Compare to full-file approach
const fullPrompt = sampleCode + "\n" + sampleError;
assert(prompt.length < fullPrompt.length * 0.7, `Error-only (${prompt.length}) smaller than full approach (${fullPrompt.length})`);

// Test without line number
const noLinePrompt = buildErrorOnlyPrompt("test.js", "SyntaxError: unexpected token", sampleCode);
assert(noLinePrompt.includes("File preview:"), "Falls back to file preview when no line number");
assert(noLinePrompt.includes("Fix the error"), "Still has fix instruction");

// ─────────────────────────────────────────────────────────────
// TEST 5: Fix cache
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 5: Fix Cache");
const testFP = "__test_error_fingerprint__";
const testCode = "console.log('fixed');";

// Cache a fix
cacheFix(testFP, testCode);
const cached = getCachedFix(testFP);
assert(cached !== null, "Cache hit after storing");
assert(cached.fixCode === testCode, "Cached fix matches stored code");

// Cache miss
const missing = getCachedFix("__nonexistent__");
assert(missing === null, "Cache miss for unknown fingerprint");

// Cleanup
try {
  const cacheFile = path.join(process.cwd(), ".agent-memory", "fix-cache.json");
  const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  delete cache[testFP];
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
} catch (_) {}

// ─────────────────────────────────────────────────────────────
// TEST 6: tryQuickFix integration
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 6: tryQuickFix Integration");

// Should return fixed:false for unknown errors
const unknownResult = tryQuickFix("WeirdCustomError: something broke", "test.js");
assert(unknownResult.fixed === false, "Returns fixed:false for unknown errors");

// Should not crash on empty input
const emptyResult = tryQuickFix("", "");
assert(emptyResult.fixed === false, "Handles empty input gracefully");

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}\n`);

if (failed > 0) process.exit(1);
