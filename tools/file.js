"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_DIR = process.cwd();

// Reads a file safely
const readFile = (filePath) => {
  try {
    return fs.readFileSync(path.join(BASE_DIR, filePath), "utf8");
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
};

// Writes a file, creating parent directories as needed
const writeFile = (filePath, content) => {
  try {
    const full = path.join(BASE_DIR, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    return true;
  } catch (err) {
    console.error(`❌ Write error (${filePath}):`, err.message);
    return false;
  }
};

// Lists files as a pretty tree
const listFiles = (dir = BASE_DIR, depth = 0, prefix = "") => {
  const SKIP = new Set(["node_modules", ".git", ".agent-memory", "dist", "build", "__pycache__", "target", "venv"]);
  const lines = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      lines.push(`${prefix}${e.isDirectory() ? "📁" : "📄"} ${e.name}`);
      if (e.isDirectory() && depth < 3) {
        const sub = listFiles(path.join(dir, e.name), depth + 1, prefix + "  ");
        if (sub) lines.push(sub);
      }
    }
  } catch (_) {}
  return lines.join("\n");
};

// Reads multiple files at once
const readFiles = (filePaths) => {
  const map = {};
  for (const fp of filePaths) map[fp] = readFile(fp);
  return map;
};

// Checks file existence
const fileExists = (filePath) => {
  try {
    return fs.existsSync(path.join(BASE_DIR, filePath));
  } catch (_) {
    return false;
  }
};

// Runs a file and returns { success, output, exitCode }
const RUNNERS = {
  ".js":  (f) => `node "${f}"`,
  ".ts":  (f) => `npx ts-node "${f}"`,
  ".py":  (f) => `python3 "${f}"`,
  ".go":  (f) => `go run "${f}"`,
  ".rb":  (f) => `ruby "${f}"`,
  ".sh":  (f) => `bash "${f}"`,
  ".php": (f) => `php "${f}"`,
  ".rs":  (_) => `cargo run`,
};

const runFile = (filePath, timeoutMs = 20000) => {
  const ext = path.extname(filePath).toLowerCase();
  const cmdFn = RUNNERS[ext];
  if (!cmdFn) return { success: false, output: `No runner for ${ext}` };

  try {
    const output = execSync(cmdFn(filePath), {
      cwd: BASE_DIR,
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    return {
      success: false,
      output: (err.stderr || err.stdout || err.message || "").trim(),
      exitCode: err.status || 1,
    };
  }
};

// Computes a diff summary between two strings
const getDiffSummary = (before, after) => {
  if (!before || !after) return "";
  const bLines = before.split("\n");
  const aLines = after.split("\n");
  let changed = 0;
  const maxLen = Math.max(bLines.length, aLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (bLines[i] !== aLines[i]) changed++;
  }
  const delta = aLines.length - bLines.length;
  return `${changed} lines changed, ${delta >= 0 ? "+" : ""}${delta} lines`;
};

// Deletes a file. Returns { success, message }
const deleteFile = (filePath) => {
  try {
    const full = path.join(BASE_DIR, filePath);
    if (!fs.existsSync(full)) return { success: false, message: `File not found: ${filePath}` };
    fs.unlinkSync(full);
    return { success: true, message: `Deleted: ${filePath}` };
  } catch (err) {
    return { success: false, message: `Delete error: ${err.message}` };
  }
};

// Renames or moves a file. Returns { success, message }
const renameFile = (fromPath, toPath) => {
  try {
    const from = path.join(BASE_DIR, fromPath);
    const to   = path.join(BASE_DIR, toPath);
    if (!fs.existsSync(from)) return { success: false, message: `Source not found: ${fromPath}` };
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return { success: true, message: `Renamed: ${fromPath} → ${toPath}` };
  } catch (err) {
    return { success: false, message: `Rename error: ${err.message}` };
  }
};

// Deletes an entire directory recursively
const deleteDir = (dirPath) => {
  try {
    const full = path.join(BASE_DIR, dirPath);
    if (!fs.existsSync(full)) return { success: false, message: `Directory not found: ${dirPath}` };
    fs.rmSync(full, { recursive: true, force: true });
    return { success: true, message: `Deleted directory: ${dirPath}` };
  } catch (err) {
    return { success: false, message: `Delete dir error: ${err.message}` };
  }
};

module.exports = { readFile, writeFile, listFiles, readFiles, fileExists, runFile, getDiffSummary, deleteFile, renameFile, deleteDir };