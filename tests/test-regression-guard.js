"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const {
  scoreRisk,
  snapshotFile,
  restoreSnapshot,
  runGuardedFix,
} = require("../core/regression-guard");

const tmpFile = path.join(__dirname, "tmp-regress.txt");

// Helpers
const write = (c) => fs.writeFileSync(tmpFile, c, "utf8");
const read = () => fs.readFileSync(tmpFile, "utf8");

const cases = [];
const record = (name, fn) => {
  try { fn(); cases.push({ name, ok: true }); }
  catch (err) { cases.push({ name, ok: false, err }); }
};

record("risk scoring reflects blast radius", () => {
  const r = scoreRisk({ blastRadius: 6, errorType: "runtime" });
  assert(r.level !== "LOW", "should be elevated risk");
});

record("snapshot/restore works", () => {
  write("before");
  const snap = snapshotFile(tmpFile);
  write("after");
  restoreSnapshot(tmpFile, snap.content);
  assert.strictEqual(read(), "before");
});

record("runGuardedFix rolls back on failed apply", async () => {
  write("start");
  const res = await runGuardedFix(
    { file: tmpFile },
    async () => ({ success: false }),
  );
  assert.strictEqual(read(), "start", "should rollback to original content");
  assert.strictEqual(res.rolledBack, true);
});

record("runGuardedFix rolls back on failed tests", async () => {
  write("start2");
  const res = await runGuardedFix(
    { file: tmpFile },
    async () => { write("changed"); return { success: true }; },
    async () => ({ success: false, output: "tests failed" }),
  );
  assert.strictEqual(read(), "start2", "should rollback after test failure");
  assert.strictEqual(res.phase, "tests");
});

cases.forEach(c => {
  if (c.ok) console.log(`✅ ${c.name}`);
  else console.error(`❌ ${c.name}: ${c.err.message || c.err}`);
});

const failed = cases.filter(c => !c.ok);
console.log(`\n${"═".repeat(40)}`);
console.log(`📊 RESULTS: ${cases.length - failed.length} passed, ${failed.length} failed, ${cases.length} total`);
console.log(`${"═".repeat(40)}\n`);

// Cleanup
try { fs.unlinkSync(tmpFile); } catch (_) {}

if (failed.length) process.exit(1);
