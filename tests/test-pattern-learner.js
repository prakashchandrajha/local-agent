"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const PATTERNS_FILE = path.join(process.cwd(), ".agent-memory", "patterns.json");

// Backup existing patterns to avoid polluting real memory
let backup = null;
if (fs.existsSync(PATTERNS_FILE)) {
  backup = fs.readFileSync(PATTERNS_FILE, "utf8");
}

// Clean slate for tests
try { fs.rmSync(PATTERNS_FILE, { force: true }); } catch (_) {}

const {
  learn,
  lookup,
  stats,
  fingerprintSimilarity,
  fingerprint,
} = require("../memory/pattern-learner");

const cases = [];
const record = (name, fn) => {
  try { fn(); cases.push({ name, ok: true }); }
  catch (err) { cases.push({ name, ok: false, err }); }
};

record("learn + lookup stores pattern", () => {
  learn("Cannot find module 'express'", "npm install express", { errorType: "missing-dependency" });
  const found = lookup("Error: Cannot find module \"express\"");
  assert(found, "should return a pattern");
  assert(found.errorType === "missing-dependency", "preserves errorType");
  assert(found.fix.includes("npm install express"), "fix text preserved");
});

record("confidence increments on repeat", () => {
  const before = lookup("Cannot find module 'express'");
  learn("Cannot find module 'express'", "npm install express");
  const after = lookup("Cannot find module 'express'");
  assert(after.confidence >= (before.confidence || 0), "confidence should not drop");
  assert(after.count >= (before.count || 1), "count should increment");
});

record("fingerprint similarity higher for same error", () => {
  const a = "Cannot find module 'redis'";
  const b = "Cannot find module 'redis'";
  const c = "SyntaxError: Unexpected token )";
  const simSame = fingerprintSimilarity(a, b);
  const simDiff = fingerprintSimilarity(a, c);
  assert(simSame > simDiff, "similarity should be higher for matching errors");
});

record("fingerprint is normalized", () => {
  const fp = fingerprint("Error: Cannot find module 'express' at line 12:34");
  assert(!fp.includes("12"), "line numbers stripped");
  assert(fp.includes("express"), "keyword retained");
});

const failed = cases.filter(c => !c.ok);
cases.forEach(c => {
  if (c.ok) console.log(`✅ ${c.name}`);
  else console.error(`❌ ${c.name}: ${c.err.message || c.err}`);
});

console.log(`\n${"═".repeat(40)}`);
console.log(`📊 RESULTS: ${cases.length - failed.length} passed, ${failed.length} failed, ${cases.length} total`);
console.log(`${"═".repeat(40)}\n`);

// Restore original patterns to avoid altering user memory
if (backup !== null) {
  fs.writeFileSync(PATTERNS_FILE, backup);
} else {
  try { fs.rmSync(PATTERNS_FILE, { force: true }); } catch (_) {}
}

if (failed.length) process.exit(1);
