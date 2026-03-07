"use strict";

/**
 * Regression Guard (scaffold)
 * Safely wraps fixes with snapshots, risk scoring, and rollback hooks.
 *
 * Usage pattern (example):
 *   const guard = require("./core/regression-guard");
 *   const ctx = guard.createContext({ file: "src/app.js", errorType: "runtime", blastRadius: 3 });
 *   const result = await guard.runGuardedFix(ctx, applyFixFn, runTestsFn);
 */

const fs = require("fs");
const path = require("path");

// Directory to store snapshots (lightweight, text)
const SNAP_DIR = path.join(process.cwd(), ".agent-memory", "snapshots");

const ensureSnapDir = () => {
  try { fs.mkdirSync(SNAP_DIR, { recursive: true }); } catch (_) {}
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * Risk scoring combines blast radius, error type, and history (optional).
 * Returns { level: "LOW"|"MEDIUM"|"HIGH", score }
 */
const scoreRisk = ({ blastRadius = 0, errorType = "", fisSeen = 0 } = {}) => {
  let score = 0;
  score += Math.min(blastRadius, 10) * 5;          // up to 50 points
  if (errorType === "missing-dependency") score += 5;
  if (errorType === "runtime") score += 15;
  if (errorType === "syntax") score += 10;
  score += Math.min(fisSeen, 5) * 5;               // recurrent issues raise risk

  const level = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  return { level, score };
};

/**
 * Take a snapshot of a file before applying a fix.
 */
const snapshotFile = (filePath) => {
  ensureSnapDir();
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const snapPath = path.join(SNAP_DIR, `${path.basename(filePath)}.${timestamp()}.snap`);
  fs.writeFileSync(snapPath, content, "utf8");
  return { snapPath, content };
};

/**
 * Restore snapshot content to file.
 */
const restoreSnapshot = (filePath, snapContent) => {
  fs.writeFileSync(filePath, snapContent || "", "utf8");
};

/**
 * Core orchestrator.
 * applyFixFn: async () => { success: bool, info?: string }
 * runTestsFn: async () => { success: bool, output?: string }  (optional)
 */
const runGuardedFix = async (context, applyFixFn, runTestsFn = null) => {
  const { file } = context;
  const snap = snapshotFile(file);
  const risk = scoreRisk(context);

  const applyResult = await applyFixFn();
  if (!applyResult?.success) {
    restoreSnapshot(file, snap.content);
    return { success: false, rolledBack: true, phase: "apply", risk };
  }

  if (runTestsFn) {
    const testResult = await runTestsFn();
    if (!testResult?.success) {
      restoreSnapshot(file, snap.content);
      return { success: false, rolledBack: true, phase: "tests", risk, testOutput: testResult.output };
    }
  }

  return { success: true, rolledBack: false, risk };
};

module.exports = {
  scoreRisk,
  snapshotFile,
  restoreSnapshot,
  runGuardedFix,
};
