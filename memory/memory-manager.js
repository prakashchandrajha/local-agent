"use strict";

const fs = require("fs");
const path = require("path");

const MEMORY_FILE = path.resolve(process.cwd(), "v2/memory/fix-memory.json");

/**
 * Super lightweight memory system.
 * Appends fixes or logs for the agent to review over time.
 */
function recordExperience(task, logic) {
  try {
    let mem = [];
    if (fs.existsSync(MEMORY_FILE)) {
      mem = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    }
    mem.push({ timestamp: Date.now(), task, logic });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2));
  } catch (err) {
    console.error("Failed to write memory:", err);
  }
}

module.exports = { recordExperience };
