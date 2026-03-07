"use strict";

/**
 * Project Graph Engine (scaffold)
 * - Builds a lightweight dependency graph for JS/TS projects.
 * - Step 1: file-level import graph (relative + package deps).
 * - Further phases (function calls, error tracing) will extend this.
 */

const fs = require("fs");
const path = require("path");

// Directories to skip during scans
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".agent-memory", "coverage", "__pycache__", "venv", "target"]);

/**
 * Recursively collect files under root with given extensions.
 * Returns array of absolute file paths.
 */
const collectFiles = (root, exts = [".js", ".jsx", ".ts", ".tsx"]) => {
  const results = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".env") continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name));
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (exts.includes(ext)) results.push(path.join(dir, e.name));
      }
    }
  };
  walk(root);
  return results;
};

/**
 * Parse imports/requires from a JS/TS file (shallow, regex-based).
 * Returns array of module specifiers as written (e.g., "./utils", "lodash").
 */
const parseImports = (content) => {
  const imports = [];
  const importRe = /import\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/g;
  const requireRe = /require\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = importRe.exec(content)) !== null) imports.push(m[1]);
  while ((m = requireRe.exec(content)) !== null) imports.push(m[1]);
  return imports;
};

/**
 * Normalize a module specifier to a project-relative path when possible.
 */
const normalizeImport = (fromFile, spec) => {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return { type: "package", target: spec };
  const abs = path.resolve(path.dirname(fromFile), spec);
  // Consider possible extensions
  const candidates = ["", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.ts"];
  for (const c of candidates) {
    const cand = abs + c;
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return { type: "file", target: cand };
    }
  }
  return { type: "missing", target: abs };
};

/**
 * Build file-level dependency graph.
 * Returns { nodes: Set<string>, edges: Array<{from,to,type}> }
 */
const buildDependencyGraph = (root = process.cwd()) => {
  const files = collectFiles(root);
  const edges = [];
  const nodes = new Set();

  for (const f of files) {
    nodes.add(f);
    let content = "";
    try { content = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
    const specs = parseImports(content);
    for (const spec of specs) {
      const norm = normalizeImport(f, spec);
      edges.push({ from: f, to: norm.target, type: norm.type, raw: spec });
      if (norm.type === "file") nodes.add(norm.target);
    }
  }

  return { nodes, edges };
};

/**
 * Simple in-memory query helpers.
 */
const findDependents = (graph, targetPath) =>
  graph.edges.filter(e => e.to === targetPath).map(e => e.from);

const findDependencies = (graph, sourcePath) =>
  graph.edges.filter(e => e.from === sourcePath).map(e => e.to);

module.exports = {
  collectFiles,
  parseImports,
  normalizeImport,
  buildDependencyGraph,
  findDependents,
  findDependencies,
};
