"use strict";

// Phase 1 stability check: ensure runFile captures common failures clearly.
// Run: node tests/test-core-loop.js

const path = require("path");
const assert = require("assert");
const { runFile } = require("../tools/file");

// Always operate from project root
process.chdir(path.join(__dirname, ".."));

const cases = [
  { file: "tests/fixtures/division_by_zero.js", expect: /division by zero/i, label: "division by zero" },
  { file: "tests/fixtures/undefined_var.js",    expect: /(ReferenceError|is not defined)/i, label: "undefined variable" },
  { file: "tests/fixtures/missing_file.js",     expect: /(ENOENT|no such file)/i, label: "missing file" },
  { file: "tests/fixtures/syntax_error.js",     expect: /SyntaxError/i, label: "syntax error" },
  { file: "tests/fixtures/async_bug.js",        expect: /async fail/i, label: "async bug" },
];

let passed = 0;
let failed = 0;

const record = (name, fn) => {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
};

console.log("\n📋 Phase 1 — Core Loop Error Capture");

cases.forEach(({ file, expect, label }) => {
  record(label, () => {
    const res = runFile(file, 5000);
    assert.strictEqual(res.success, false, "should fail execution");
    assert.ok(res.output && expect.test(res.output), `output missing expected marker (${expect})`);
    assert.notStrictEqual(res.timedOut, true, "should not timeout");
  });
});

console.log(`\n${"═".repeat(50)}`);
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}\n`);

if (failed > 0) process.exit(1);
