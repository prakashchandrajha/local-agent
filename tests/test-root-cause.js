"use strict";

const assert = require("assert");
const path = require("path");
const { analyzeRootCause, traceDependents, estimateImpact } = require("../core/root-cause-analyzer");

// Build a tiny synthetic graph
const a = "/proj/a.js";
const b = "/proj/b.js";
const c = "/proj/c.js";
const d = "/proj/d.js";

const graph = {
  edges: [
    { from: b, to: a, type: "file" },
    { from: c, to: b, type: "file" },
    { from: d, to: b, type: "file" },
  ],
};

const tests = [];
const record = (name, fn) => {
  try { fn(); tests.push({ name, ok: true }); }
  catch (err) { tests.push({ name, ok: false, err }); }
};

record("traceDependents walks parents", () => {
  const chain = traceDependents(graph, a);
  const files = chain.map(c => c.file);
  assert(files.includes(b), "b depends on a");
  assert(files.includes(c), "c depends on b->a");
});

record("estimateImpact levels", () => {
  assert.strictEqual(estimateImpact(0), "LOW");
  assert.strictEqual(estimateImpact(2), "MEDIUM");
  assert.strictEqual(estimateImpact(4), "HIGH");
  assert.strictEqual(estimateImpact(10), "CRITICAL");
});

record("analyzeRootCause computes blast radius", () => {
  const report = analyzeRootCause(graph, a);
  assert.strictEqual(report.blastRadius, 3);
  assert.strictEqual(report.severity, "HIGH");
  assert(report.dependencyChain.includes(c), "chain includes c");
});

tests.forEach(t => {
  if (t.ok) console.log(`✅ ${t.name}`);
  else console.error(`❌ ${t.name}: ${t.err.message || t.err}`);
});

const failed = tests.filter(t => !t.ok);
console.log(`\n${"═".repeat(40)}`);
console.log(`📊 RESULTS: ${tests.length - failed.length} passed, ${failed.length} failed, ${tests.length} total`);
console.log(`${"═".repeat(40)}\n`);
if (failed.length) process.exit(1);
