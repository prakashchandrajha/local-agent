"use strict";

// ─────────────────────────────────────────────────────────────
// MICRO-SANDBOX POOL
// Provides isolated environments for speculative code execution.
// Uses symlinks for node_modules and project structure to
// ensure speed while protecting the main codebase.
// ─────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Use RAM-backed filesystem (/dev/shm) on Linux if available for ultra-low latency
let BASE_SANDBOX_DIR;
const SHM_DIR = "/dev/shm/agent-sandboxes";

try {
  if (fs.existsSync("/dev/shm")) {
    fs.mkdirSync(SHM_DIR, { recursive: true });
    BASE_SANDBOX_DIR = SHM_DIR;
    console.log("⚡ using RAM-backed sandboxes (/dev/shm)");
  } else {
    BASE_SANDBOX_DIR = path.join(process.cwd(), ".agent-memory", "sandboxes");
  }
} catch (e) {
  BASE_SANDBOX_DIR = path.join(process.cwd(), ".agent-memory", "sandboxes");
}

const MAX_POOL_SIZE = 10;

// Tracks which sandboxes are currently in use
const pool = new Array(MAX_POOL_SIZE).fill(null).map((_, i) => ({
  id: i + 1,
  path: path.join(BASE_SANDBOX_DIR, `sb-${i + 1}`),
  busy: false,
}));

// Initialize the sandbox directories
const initPool = () => {
  if (!fs.existsSync(BASE_SANDBOX_DIR)) {
    fs.mkdirSync(BASE_SANDBOX_DIR, { recursive: true });
  }

  for (const sb of pool) {
    if (!fs.existsSync(sb.path)) {
      fs.mkdirSync(sb.path, { recursive: true });
    }
  }
};

/**
 * Prepares a sandbox for a specific file.
 * Symlinks everything except the target file.
 */
const prepareSandbox = (sb, targetFilePath) => {
  const projectRoot = process.cwd();
  const sbPath      = sb.path;

  // 1. Clean previous run if any (careful not to delete node_modules symlink)
  const children = fs.readdirSync(sbPath);
  for (const child of children) {
    const full = path.join(sbPath, child);
    if (child === "node_modules") continue; // keep the symlink
    if (fs.lstatSync(full).isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    } else {
      fs.unlinkSync(full);
    }
  }

  // 2. Symlink core project structure (package.json, node_modules, etc)
  const essentials = ["package.json", "package-lock.json", "node_modules", "core", "tools", "memory"];
  for (const item of essentials) {
    const src = path.join(projectRoot, item);
    const dst = path.join(sbPath, item);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      try {
        fs.symlinkSync(src, dst, fs.lstatSync(src).isDirectory() ? "dir" : "file");
      } catch (_) {
        // Fallback for systems that don't support symlinks well (e.g. some Windows configs)
        // In Linux/Dev environments it should work.
      }
    }
  }

  // 3. Create directory structure for the target file
  const relativeDir = path.dirname(targetFilePath);
  if (relativeDir !== ".") {
    fs.mkdirSync(path.join(sbPath, relativeDir), { recursive: true });
  }

  // 4. COPY the target file (don't symlink, we want to mutate it)
  const srcFile = path.join(projectRoot, targetFilePath);
  const dstFile = path.join(sbPath, targetFilePath);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, dstFile);
  }

  return sbPath;
};

/**
 * Acquires a sandbox from the pool.
 */
const checkout = async (targetFilePath) => {
  initPool();
  
  const sb = pool.find(s => !s.busy);
  if (!sb) {
    // If all busy, wait a bit or return null (swarm should handle retry)
    return null;
  }

  sb.busy = true;
  try {
    const p = prepareSandbox(sb, targetFilePath);
    return { id: sb.id, path: p };
  } catch (err) {
    sb.busy = false;
    throw err;
  }
};

/**
 * Releases a sandbox back to the pool.
 */
const release = (id) => {
  const sb = pool.find(s => s.id === id);
  if (sb) sb.busy = false;
};

/**
 * Runs a command inside the sandbox.
 */
const run = (sbId, command, timeout = 15000) => {
  const sb = pool.find(s => s.id === sbId);
  if (!sb) throw new Error(`Sandbox ${sbId} not found`);

  try {
    const output = execSync(command, {
      cwd: sb.path,
      timeout,
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

/**
 * Updates the target file content in the sandbox.
 */
const write = (sbId, relativePath, content) => {
  const sb = pool.find(s => s.id === sbId);
  if (!sb) return false;
  
  const fullPath = path.join(sb.path, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return true;
};

/**
 * Returns the filesystem path for a sandbox ID.
 */
const getPath = (sbId) => {
  const sb = pool.find(s => s.id === sbId);
  return sb ? sb.path : null;
};

module.exports = {
  checkout,
  release,
  run,
  write,
  initPool,
  getPath,
};
