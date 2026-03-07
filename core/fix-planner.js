"use strict";

/**
 * Context-Aware Fix Planner
 * Builds strategic instructions for LLM based on root-cause analysis.
 */

const { scoreRisk } = require("./regression-guard");

const buildFixStrategy = (rootReport) => {
  if (!rootReport || rootReport.error) return "General bug fix.";

  const { severity } = rootReport;

  if (severity === "LOW") return "Localized fix. Minimal side effects expected.";
  if (severity === "MEDIUM") return "Fix carefully. Issue affects multiple modules.";
  if (severity === "HIGH") return "Architectural-level fix. Preserve module contracts and public APIs.";
  if (severity === "CRITICAL") return "System-wide impact. Prioritize root logic correction, avoid hacks, ensure backward compatibility.";

  return "General bug fix.";
};

// Pre-fix simulation: predict risk using blast radius + error type
const simulateFix = ({ blastRadius = 0, errorType = "unknown", fisSeen = 0 } = {}) => {
  const risk = scoreRisk({ blastRadius, errorType, fisSeen });
  return { predictedRisk: risk.level, riskScore: risk.score };
};

const formatPlanForPrompt = (rootReport, predictedRisk = "") => {
  if (!rootReport || rootReport.error) return "";

  const chainPreview = (rootReport.dependencyChain || [])
    .slice(0, 5)
    .map((p) => "• " + p.split("/").slice(-2).join("/"))
    .join("\n");

  return `
━━━━━━━━━━ FIX CONTEXT ━━━━━━━━━━
Error Source: ${rootReport.errorSource}
Blast Radius: ${rootReport.blastRadius} modules
Severity: ${rootReport.severity}
Root Likelihood: ${rootReport.rootLikelihood}
Predicted Risk: ${predictedRisk || "n/a"}

Affected Chain (top dependents):
${chainPreview || "• None"}

Fix Strategy:
${buildFixStrategy(rootReport)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
};

module.exports = { buildFixStrategy, formatPlanForPrompt, simulateFix };
