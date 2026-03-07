"use strict";

const http = require("http");
const { executeAndRecover } = require("../core/ere");
const { writeFile, readFile } = require("../tools/file");
const fs = require("fs");
const path = require("path");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

const llmAvailable = () => new Promise((resolve) => {
  try {
    const req = http.get(OLLAMA_URL, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  } catch (_) {
    resolve(false);
  }
});

async function test() {
  console.log("\n🚀 Testing ERE v7 Speculative Swarm...");

  if (!(await llmAvailable())) {
    console.log(`⚠️  Skipping: LLM at ${OLLAMA_URL} not reachable (set OLLAMA_URL or start server).`);
    return;
  }

  const testFile = "swarm_demo.js";
  const buggyCode = `
const fs = require('fs');
// TYPO in variable name and missing close bracket
function main() {
  const data = "hello world";
  console.log(dat); 
  if (true) {
    console.log("missing bracket");
`;

  writeFile(testFile, buggyCode);
  console.log(`   📝 Created buggy file: ${testFile}`);

  try {
    const result = await executeAndRecover(testFile, "javascript");
    
    console.log("\n📊 INTEGRATION RESULTS:");
    console.log(`   Success: ${result.success}`);
    console.log(`   Fix Source: ${result.fixSource}`);
    console.log(`   Attempts: ${result.attempts}`);
    
    if (result.success) {
      console.log("\n✅ Fixed code preview:");
      console.log(readFile(testFile).slice(0, 300));
    } else {
      console.error("\n❌ Swarm failed to fix the error.");
    }
  } catch (err) {
    console.error(`\n❌ Integration test crashed: ${err.message}`);
  } finally {
    // fs.unlinkSync(testFile);
  }
}

test();
