"use strict";

// ─────────────────────────────────────────────────────────────
// INCREMENTAL TEST RUNNER (v8)
// 
// When the Swarm modifies a file (e.g. src/authService.js),
// we don't want to run the entire backend test suite.
// This utility maps the modified file to its dependent tests
// and strictly evaluates only the relevant paths.
// ─────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Simple heuristics for mapping a source file to its test file
const testMappingStrategies = {
  js: (filePath) => {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, ".js");
    return [
      path.join(dir, `${base}.test.js`),
      path.join(dir, `${base}.spec.js`),
      path.join(dir, "__tests__", `${base}.js`),
      path.join(dir, "__tests__", `${base}.test.js`)
    ];
  },
  ts: (filePath) => {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, ".ts");
    return [
      path.join(dir, `${base}.test.ts`),
      path.join(dir, `${base}.spec.ts`)
    ];
  },
  py: (filePath) => {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, ".py");
    return [
      path.join(dir, `test_${base}.py`),
      path.join(dir, `${base}_test.py`)
    ];
  },
  go: (filePath) => {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, ".go");
    if (base.endsWith("_test")) return [filePath]; // Already a test file
    return [path.join(dir, `${base}_test.go`)];
  },
  java: (filePath) => {
    // Basic heuristics: look for parallel test directory structure
    // src/main/java/... -> src/test/java/...
    const testPath = filePath.replace("src/main/java", "src/test/java").replace(".java", "Test.java");
    return [testPath];
  }
};

/**
 * Identify relevant test files for a modified source file.
 */
const findRelevantTests = (filePath) => {
  const ext = path.extname(filePath).slice(1); // e.g., js, py
  const strategies = testMappingStrategies[ext];
  
  if (!strategies) return [];

  const candidates = strategies(filePath);
  return candidates.filter(cf => fs.existsSync(cf));
};

/**
 * Execute incremental tests inside the sandbox.
 */
const runIncrementalTests = (sbId, targetFilePath, runFunc) => {
  const ext = path.extname(targetFilePath).slice(1);
  const relevantTests = findRelevantTests(targetFilePath);

  if (relevantTests.length === 0) {
    // If no specific tests exist, just run the file directly as a sanity check.
    return require("./ere").runTargeted(targetFilePath);
  }

  // Attempt to run the specific test files discovered
  let testCmd = "";
  const testFilesStr = relevantTests.map(p => `"${path.basename(p)}"`).join(" ");

  if (ext === "js" || ext === "ts") {
    testCmd = `npx jest ${testFilesStr} --passWithNoTests`;
  } else if (ext === "py") {
    testCmd = `python3 -m pytest ${testFilesStr} -v`;
  } else if (ext === "go") {
    // Go requires testing the package directory
    testCmd = `go test -v .`;
  }

  if (testCmd) {
    console.log(`   🔍 Running incremental tests: ${testCmd}`);
    try {
        const out = execSync(testCmd, { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" });
        return { success: true, output: out };
    } catch (err) {
        return { success: false, output: err.stdout + "\n" + err.stderr };
    }
  }

  return { success: true, output: "(no compatible test runner found)" };
};

module.exports = {
  findRelevantTests,
  runIncrementalTests
};
