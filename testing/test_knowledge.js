#!/usr/bin/env node
"use strict";

/**
 * Test Knowledge Wrapper System
 * Run: node testing/test_knowledge.js
 */

const knowledge = require("../tools/knowledge");

// ─────────────────────────────────────────────────────────────
// TEST UTILITIES
// ─────────────────────────────────────────────────────────────
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m"
};

const log = {
  pass: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ️${colors.reset} ${msg}`)
};

// ─────────────────────────────────────────────────────────────
// TEST 1: Load Knowledge Files
// ─────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────");
console.log("TEST 1: Load Knowledge Files");
console.log("─────────────────────────────────────────\n");

try {
  const allKnowledge = knowledge.loadAllKnowledge();
  
  if (allKnowledge.length > 0) {
    log.pass(`Loaded ${allKnowledge.length} knowledge files`);
    allKnowledge.forEach(k => {
      log.info(`  - ${k.file} (${k.lines.length} lines)`);
    });
  } else {
    log.fail("No knowledge files loaded");
  }
} catch (err) {
  log.fail(`Load failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 2: Search for Division by Zero
// ─────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────");
console.log("TEST 2: Search 'division by zero'");
console.log("─────────────────────────────────────────\n");

try {
  const results = knowledge.searchKnowledge("division by zero in calculator.js", 3);
  
  if (results.length > 0) {
    log.pass(`Found ${results.length} relevant results`);
    results.forEach((r, i) => {
      console.log(`\n[${i + 1}] From ${r.file}:`);
      console.log(`    ${r.context}`);
    });
    
    // Check if we found the division by zero check
    const foundDivision = results.some(r => 
      r.line.toLowerCase().includes("division") || 
      r.line.includes("b === 0")
    );
    
    if (foundDivision) {
      log.pass("Found division by zero pattern");
    } else {
      log.fail("Did not find division by zero pattern");
    }
  } else {
    log.fail("No results found");
  }
} catch (err) {
  log.fail(`Search failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 3: Search for Null Check
// ─────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────");
console.log("TEST 3: Search 'null check'");
console.log("─────────────────────────────────────────\n");

try {
  const results = knowledge.searchKnowledge("null pointer in function", 3);
  
  if (results.length > 0) {
    log.pass(`Found ${results.length} relevant results`);
    results.forEach((r, i) => {
      console.log(`\n[${i + 1}] From ${r.file}:`);
      console.log(`    ${r.context}`);
    });
    
    // Check if we found null check pattern
    const foundNull = results.some(r => 
      r.line.toLowerCase().includes("null") || 
      r.line.toLowerCase().includes("undefined")
    );
    
    if (foundNull) {
      log.pass("Found null/undefined check pattern");
    } else {
      log.fail("Did not find null check pattern");
    }
  } else {
    log.fail("No results found");
  }
} catch (err) {
  log.fail(`Search failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 4: Build Knowledge Injection
// ─────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────");
console.log("TEST 4: Build Knowledge Injection");
console.log("─────────────────────────────────────────\n");

try {
  const injection = knowledge.buildKnowledgeInjection("division by zero error", 3);
  
  if (injection && injection.length > 0) {
    log.pass("Knowledge injection generated");
    console.log("\nInjected content:");
    console.log(injection);
  } else {
    log.fail("No knowledge injection generated");
  }
} catch (err) {
  log.fail(`Injection failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// TEST 5: Knowledge Statistics
// ─────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────");
console.log("TEST 5: Knowledge Statistics");
console.log("─────────────────────────────────────────\n");

try {
  const stats = knowledge.getKnowledgeStats();
  
  log.pass(`Knowledge base stats:
  - Total files: ${stats.totalFiles}
  - Total lines: ${stats.totalLines}
  - Files: ${stats.files.join(", ")}`);
} catch (err) {
  log.fail(`Stats failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────
console.log("\n═════════════════════════════════════════");
console.log("📊 KNOWLEDGE WRAPPER TEST COMPLETE");
console.log("═════════════════════════════════════════\n");

console.log("Next steps:");
console.log("1. Start agent: node agent.js");
console.log("2. Ask: 'fix calculator.js division by zero'");
console.log("3. Check if agent uses knowledge from files\n");
