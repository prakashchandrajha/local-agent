"use strict";

// Master test runner — executes all test/*.js files sequentially.
// Run: node tests/all-tests.js

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Ensure CWD is project root
process.chdir(path.join(__dirname, ".."));

// Collect test files (prefers test-*.js plus selftest.js)
const testDir = path.join(process.cwd(), "tests");
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith(".js") && (f.startsWith("test-") || f === "selftest.js"))
  .sort(); // deterministic order

if (!files.length) {
  console.error("No tests found in tests/");
  process.exitCode = 1;
  process.exit();
}

const results = [];

for (const file of files) {
  const rel = path.join("tests", file);
  console.log(`\n▶️  Running ${rel} ...`);
  const run = spawnSync("node", [rel], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
  });

  const ok = run.status === 0;
  if (ok) {
    console.log(`✅ Passed ${rel}`);
  } else {
    console.log(`❌ Failed ${rel} (exit ${run.status ?? "signal"})`);
  }

  // Surface output for debugging
  const output = [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
  if (output) {
    console.log(output.slice(0, 4000)); // cap noise
  }

  results.push({ file: rel, ok, status: run.status, output });
}

const failed = results.filter((r) => !r.ok);
console.log("\n──────── Summary ────────");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.file}${r.ok ? "" : ` (exit ${r.status})`}`);
}

if (failed.length) {
  console.log(`\n${failed.length} test${failed.length === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll tests passed 🎉");
}
