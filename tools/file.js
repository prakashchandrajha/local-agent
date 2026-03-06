"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_DIR = process.cwd();

// Reads a file and returns its content or an error string
const readFile = (filePath) => {
  try {
    const fullPath = path.join(BASE_DIR, filePath);
    return fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    return `ERROR: Cannot read file — ${err.message}`;
  }
};

// Writes content to a file, creating directories as needed
const writeFile = (filePath, content) => {
  try {
    const fullPath = path.join(BASE_DIR, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return "File written successfully.";
  } catch (err) {
    return `ERROR: Cannot write file — ${err.message}`;
  }
};

// Lists all non-hidden files in the project (respects skip dirs)
const listFiles = (dir = BASE_DIR, depth = 0, prefix = "") => {
  const SKIP = new Set(["node_modules", ".git", ".agent-memory", "dist", "build", "__pycache__"]);
  let output = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
      const icon = entry.isDirectory() ? "📁" : "📄";
      output.push(`${prefix}${icon} ${entry.name}`);
      if (entry.isDirectory() && depth < 3) {
        output.push(...listFiles(path.join(dir, entry.name), depth + 1, prefix + "  ").split("\n").filter(Boolean));
      }
    }
  } catch (_) {}
  return output.join("\n");
};

// Reads multiple files at once — returns map of path → content
const readFiles = (filePaths) => {
  const results = {};
  for (const fp of filePaths) {
    results[fp] = readFile(fp);
  }
  return results;
};

// Tries to run a file and capture output/errors for diagnostic
const runFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const runCommands = {
    ".js": `node "${filePath}"`,
    ".py": `python3 "${filePath}"`,
    ".ts": `npx ts-node "${filePath}"`,
    ".go": `go run "${filePath}"`,
    ".rb": `ruby "${filePath}"`,
    ".sh": `bash "${filePath}"`,
    ".php": `php "${filePath}"`,
  };
  const cmd = runCommands[ext];
  if (!cmd) return { success: false, output: `No runner configured for ${ext} files.` };
  try {
    const output = execSync(cmd, {
      cwd: BASE_DIR,
      timeout: 15000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    return {
      success: false,
      output: (err.stderr || err.stdout || err.message || "Unknown error").trim(),
      exitCode: err.status,
    };
  }
};

// Computes a simple diff summary between two code strings
const getDiffSummary = (before, after) => {
  if (!before || !after) return "";
  const bLines = before.split("\n");
  const aLines = after.split("\n");
  let added = 0, removed = 0;
  const maxLen = Math.max(bLines.length, aLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (bLines[i] !== aLines[i]) {
      if (i < bLines.length) removed++;
      if (i < aLines.length) added++;
    }
  }
  return `~${removed} lines changed, ~${added} lines updated`;
};

// Checks if file exists
const fileExists = (filePath) => {
  try {
    return fs.existsSync(path.join(BASE_DIR, filePath));
  } catch (_) {
    return false;
  }
};

module.exports = { readFile, writeFile, listFiles, readFiles, runFile, getDiffSummary, fileExists };
