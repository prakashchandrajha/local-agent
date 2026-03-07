"use strict";

/**
 * Root Cause Analyzer
 * Uses project dependency graph to trace how an error in a file
 * could propagate through dependents.
 */

const path = require("path");

/**
 * Trace upward dependents recursively (file -> parents that import it).
 * Returns array of { file, depth } sorted by discovery order.
 */
const traceDependents = (graph, startFile, maxDepth = 10) => {
  const visited = new Set();
  const chain = [];

  const dfs = (file, depth) => {
    if (depth > maxDepth || visited.has(file)) return;
    visited.add(file);

    const parents = graph.edges
      .filter((e) => e.to === file && e.type === "file")
      .map((e) => e.from);

    for (const p of parents) {
      chain.push({ file: p, depth });
      dfs(p, depth + 1);
    }
  };

  dfs(startFile, 1);
  return chain;
};

/**
 * Estimate blast radius severity based on chain length.
 */
const estimateImpact = (chainLength) => {
  if (chainLength === 0) return "LOW";
  if (chainLength <= 2) return "MEDIUM";
  if (chainLength <= 5) return "HIGH";
  return "CRITICAL";
};

/**
 * Analyze root cause context for a given error file.
 * Returns { errorSource, dependencyChain, blastRadius, severity, rootLikelihood }
 */
const analyzeRootCause = (graph, errorFilePath, maxDepth = 10) => {
  if (!graph || !graph.edges) {
    return { error: "Invalid graph" };
  }

  const normalized = path.resolve(errorFilePath);
  const dependencyChain = traceDependents(graph, normalized, maxDepth);
  const blastRadius = dependencyChain.length;
  const severity = estimateImpact(blastRadius);

  return {
    errorSource: normalized,
    dependencyChain: dependencyChain.map((d) => d.file),
    blastRadius,
    severity,
    rootLikelihood: blastRadius > 0 ? "HIGH" : "LOCALIZED",
  };
};

module.exports = { analyzeRootCause, traceDependents, estimateImpact };
