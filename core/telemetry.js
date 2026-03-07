"use strict";

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(process.cwd(), ".agent_logs");

const logEvent = (event) => {
  try {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${JSON.stringify(event)}\n`;
    fs.appendFileSync(LOG_FILE, logLine, "utf8");
  } catch (err) {
    // Silently ignore telemetry write errors
  }
};

module.exports = { logEvent };
