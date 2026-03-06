"use strict";

const AgentOrchestrator = require("./agent/agent");

async function main() {
  console.log("🚀 Starting Optimized Local Agent (v2)...");
  
  const agent = new AgentOrchestrator();
  
  try {
    await agent.start();
  } catch (err) {
    console.error("❌ Fatal Agent Error:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
