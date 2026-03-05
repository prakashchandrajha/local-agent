#!/usr/bin/env node
"use strict";

/**
 * End-to-End Test: Knowledge Wrapper Integration
 * Simulates what the agent sees when fixing calculator.js
 */

const knowledge = require("../tools/knowledge");
const memory = require("../tools/memory");
const scanner = require("../tools/scanner");

console.log("═════════════════════════════════════════");
console.log("🧪 END-TO-END KNOWLEDGE WRAPPER TEST");
console.log("═════════════════════════════════════════\n");

// Step 1: Load project context
console.log("📦 Step 1: Load project context...");
const projectMap = scanner.loadProjectMap();
console.log(`   Found ${projectMap.files.length} files\n`);

// Step 2: Get project context for calculator.js
console.log("🗺️  Step 2: Get project context for calculator.js...");
const projectContext = scanner.buildContextInjection("calculator.js", projectMap);
console.log(projectContext);

// Step 3: Get memory context
console.log("\n🧠 Step 3: Check memory for past fixes...");
const memoryContext = memory.getContextSuggestions("calculator.js");
if (memoryContext.length > 0) {
  console.log(`   Found ${memoryContext.length} relevant past fixes:`);
  memoryContext.forEach(m => {
    console.log(`   - ${m.function}: ${m.description}`);
  });
} else {
  console.log("   No past fixes for calculator.js");
}

// Step 4: Search knowledge for "division by zero"
console.log("\n📚 Step 4: Search knowledge for 'division by zero'...");
const knowledgeInjection = knowledge.buildKnowledgeInjection("division by zero in calculator.js", 3);

if (knowledgeInjection) {
  console.log("✅ Knowledge found and will be injected:");
  console.log(knowledgeInjection);
} else {
  console.log("⚠️  No relevant knowledge found");
}

// Step 5: Show complete prompt
console.log("\n═════════════════════════════════════════");
console.log("📝 COMPLETE PROMPT (what agent sees):");
console.log("═════════════════════════════════════════\n");

const userRequest = "fix calculator.js division by zero";

console.log(`USER REQUEST: "${userRequest}"\n`);

if (knowledgeInjection) {
  console.log("📚 KNOWLEDGE CONTEXT:");
  console.log(knowledgeInjection);
}

if (memoryContext.length > 0) {
  console.log("🧠 MEMORY CONTEXT:");
  memoryContext.forEach(m => {
    console.log(`   - ${m.function}: ${m.description}`);
  });
  console.log();
}

console.log("🗺️  PROJECT CONTEXT:");
console.log(projectContext);

console.log("\n═════════════════════════════════════════");
console.log("✅ TEST COMPLETE");
console.log("═════════════════════════════════════════\n");

console.log("The agent will see:");
console.log("1. ✅ User request: fix division by zero");
console.log("2. ✅ Knowledge: Division by zero check pattern");
console.log("3. ✅ Project context: calculator.js functions");
console.log("4. ✅ Memory: (if any past fixes exist)\n");

console.log("Expected agent action:");
console.log("1. Read calculator.js");
console.log("2. See knowledge about 'if (b === 0) throw Error'");
console.log("3. Write fixed version with division by zero check\n");
