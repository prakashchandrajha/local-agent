"use strict";

const assert = require("assert");
const { classify } = require("../core/error-classifier");

const cases = [
  { text: "SyntaxError: Unexpected token )", type: "syntax" },
  { text: "Error: Cannot find module 'express'", type: "missing-dependency", detail: "express" },
  { text: "ModuleNotFoundError: No module named 'flask'", type: "missing-dependency", detail: "flask" },
  { text: "ENOENT: no such file or directory, open '/tmp/test.json'", type: "missing-file", detail: "/tmp/test.json" },
  { text: "Error: EACCES: permission denied, access '/usr/bin/script'", type: "permission", detail: "/usr/bin/script" },
  { text: "Error: listen EADDRINUSE: address already in use :::3000", type: "port-in-use", detail: "3000" },
  { text: "TypeError: Cannot read properties of undefined", type: "runtime" },
  { text: "ReferenceError: x is not defined", type: "runtime" },
  { text: "Weird output", type: "logic" },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const r = classify(c.text, "js");
  try {
    assert.strictEqual(r.type, c.type, `expected type ${c.type} got ${r.type}`);
    if (c.detail !== undefined) {
      assert.strictEqual(r.detail, c.detail, `expected detail ${c.detail} got ${r.detail}`);
    }
    passed++;
    console.log(`✅ ${c.type} (${c.text.slice(0, 40)}...)`);
  } catch (err) {
    failed++;
    console.error(`❌ ${c.text}: ${err.message}`);
  }
}

console.log(`\n${"═".repeat(40)}`);
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(40)}\n`);

if (failed) process.exit(1);
