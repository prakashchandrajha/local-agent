"use strict";

// ─────────────────────────────────────────────────────────────
// CCE TEST SUITE
// Tests the Context Compression Engine against its own codebase
// Run: node tests/test-cce.js
// ─────────────────────────────────────────────────────────────

const path = require("path");

// Set CWD to project root (one level up from tests/)
process.chdir(path.join(__dirname, ".."));

const { buildIndex, loadIndex, buildArchGraph, formatArchGraph,
        extractSignatures, extractExports, classifyRole } = require("../core/repo-indexer");
const { getCompressedContext, selectRelevantFiles, buildFileSummaries,
        buildSignatureBlock, detectBudget, estimateTokens }     = require("../core/cce");

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
// TEST 1: Repo Indexer — scan project
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 1: Repo Indexer");
const result = buildIndex(true);
assert(result.totalFiles > 5, `Scanned ${result.totalFiles} files (expected >5)`);
assert(result.files["agent.js"] !== undefined, "agent.js is indexed");
assert(result.files["core/clc.js"] !== undefined, "core/clc.js is indexed");
assert(result.files["core/cce.js"] !== undefined, "core/cce.js is indexed");

// ─────────────────────────────────────────────────────────────
// TEST 2: File Summaries — each entry has required fields
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 2: File Summaries");
const agentMeta = result.files["agent.js"];
assert(agentMeta.role !== undefined, "agent.js has a role");
assert(agentMeta.description !== undefined, "agent.js has a description");
assert(Array.isArray(agentMeta.functions), "agent.js has functions array");
assert(agentMeta.functions.length > 3, `agent.js has ${agentMeta.functions.length} functions (expected >3)`);
assert(Array.isArray(agentMeta.imports), "agent.js has imports array");
assert(agentMeta.imports.length > 3, `agent.js has ${agentMeta.imports.length} imports (expected >3)`);
assert(agentMeta.lineCount > 100, `agent.js has ${agentMeta.lineCount} lines (expected >100)`);

// ─────────────────────────────────────────────────────────────
// TEST 3: Role Classification
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 3: Role Classification");
assert(classifyRole("controllers/auth.js", "") === "controller", "auth controller role");
assert(classifyRole("services/user-service.js", "") === "service", "user service role");
assert(classifyRole("utils/helper.js", "") === "utility", "helper utility role");
assert(classifyRole("config/db.js", "") === "config", "config role");
assert(classifyRole("tests/test-auth.js", "") === "test", "test role");
assert(classifyRole("app.js", "") === "entry", "entry point role");

// ─────────────────────────────────────────────────────────────
// TEST 4: Function Signature Extraction
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 4: Function Signatures");
const jsSample = `
const callLLM = async (prompt, systemPrompt) => { };
function buildSystemPrompt({ langProfile, atomBlock }) { }
const run = async () => { };
`;
const sigs = extractSignatures(jsSample, "test.js");
assert(sigs.length === 3, `Extracted ${sigs.length} signatures (expected 3)`);
assert(sigs.some((s) => s.name === "callLLM"), "Found callLLM signature");
assert(sigs.some((s) => s.name === "buildSystemPrompt"), "Found buildSystemPrompt signature");

const pySample = `
async def login_user(email: str, password: str) -> dict:
    pass

def get_user_by_id(user_id: int):
    pass
`;
const pySigs = extractSignatures(pySample, "test.py");
assert(pySigs.length === 2, `Python: extracted ${pySigs.length} signatures (expected 2)`);
assert(pySigs.some((s) => s.name === "login_user"), "Found login_user signature");

// ─────────────────────────────────────────────────────────────
// TEST 5: Export Extraction
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 5: Export Extraction");
const exportSample = `
const foo = () => {};
const bar = () => {};
module.exports = { foo, bar };
`;
const exp = extractExports(exportSample, "test.js");
assert(exp.includes("foo"), "Found export: foo");
assert(exp.includes("bar"), "Found export: bar");

// ─────────────────────────────────────────────────────────────
// TEST 6: Architecture Graph
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 6: Architecture Graph");
const archGraph = buildArchGraph(result.files);
assert(Object.keys(archGraph).length > 0, `Graph has ${Object.keys(archGraph).length} edges`);

// agent.js should depend on core files
const agentDeps = archGraph["agent.js"] || [];
assert(agentDeps.some((d) => d.includes("core/")), "agent.js depends on core/ files");

const archText = formatArchGraph(archGraph, result.files);
assert(archText.length > 50, `Architecture text: ${archText.length} chars`);
assert(archText.includes("DEPENDENCIES:"), "Architecture text has dependency section");

// ─────────────────────────────────────────────────────────────
// TEST 7: Smart File Selection
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 7: Smart File Selection");
const reviewFiles = selectRelevantFiles("fix the reviewer module", result.files, archGraph);
assert(reviewFiles.includes("core/reviewer.js"), `"fix reviewer" selects core/reviewer.js`);

const cceFiles = selectRelevantFiles("improve context compression engine", result.files, archGraph);
assert(cceFiles.some((f) => f.includes("cce") || f.includes("clc")), `"context compression engine" selects CCE files: ${cceFiles.join(", ")}`);

// ─────────────────────────────────────────────────────────────
// TEST 8: Compressed Context Generation
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 8: Compressed Context");
const startTime = Date.now();
const ctx1 = getCompressedContext("fix authentication bug", "deepseek-coder:6.7b");
const time1 = Date.now() - startTime;
assert(ctx1.context.length > 50, `Generated ${ctx1.context.length} chars of context`);
assert(ctx1.stats.usedTokens <= ctx1.stats.budget, `Tokens ${ctx1.stats.usedTokens} within CCE budget ${ctx1.stats.budget}`);
assert(ctx1.stats.budget <= 1400, `CCE budget is 35% of 4000 = ${ctx1.stats.budget} (not full 4000)`);
assert(ctx1.stats.totalFiles > 5, `Stats show ${ctx1.stats.totalFiles} total files`);

// Test that "create" tasks get minimal context
const ctxCreate = getCompressedContext("create demo.js write calculator", "deepseek-coder:6.7b");
assert(ctxCreate.stats.full === 0, `Create task loads 0 full files (got ${ctxCreate.stats.full})`);
assert(ctxCreate.stats.usedTokens < 500, `Create task uses minimal tokens: ${ctxCreate.stats.usedTokens}`);

// ─────────────────────────────────────────────────────────────
// TEST 9: Context Cache
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 9: Context Cache");
const startTime2 = Date.now();
const ctx2 = getCompressedContext("fix authentication bug", "deepseek-coder:6.7b");
const time2 = Date.now() - startTime2;
assert(ctx2.stats.fromCache === true, "Second call returned cached result");
assert(time2 <= time1 + 50, `Cached call (${time2}ms) not slower than first (${time1}ms)`);

// ─────────────────────────────────────────────────────────────
// TEST 10: Budget Detection
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 10: Budget Detection");
assert(detectBudget("deepseek-coder:6.7b") === 4000, "7B model → 4000 token budget");
assert(detectBudget("llama2:13b") === 6000, "13B model → 6000 token budget");
assert(detectBudget("llama2:70b") === 16000, "70B model → 16000 token budget");
assert(detectBudget("unknown-model") === 4000, "Unknown model → 4000 default");

// ─────────────────────────────────────────────────────────────
// TEST 11: Token Estimation
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 11: Token Estimation");
assert(estimateTokens("hello world") === 3, "Short text token estimation");
assert(estimateTokens("") === 0, "Empty text → 0 tokens");
assert(estimateTokens("a".repeat(400)) === 100, "400 chars → 100 tokens");

// ─────────────────────────────────────────────────────────────
// TEST 12: Signature Block
// ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 12: Signature Block");
const sigBlock = buildSignatureBlock(result.files, ["agent.js"]);
assert(sigBlock.length > 50, `Signature block: ${sigBlock.length} chars`);
assert(sigBlock.includes("agent.js:"), "Block has agent.js header");

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}\n`);

if (failed > 0) process.exit(1);
