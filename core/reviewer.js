"use strict";

const { postJSON } = require("../llm/client");
const fs = require("fs");
const path = require("path");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const MODEL = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

const REVIEW_CHECKLISTS = {
  js: `- No undefined variables\n- All require() paths are local or installed\n- No missing brackets/braces\n- No placeholder TODO comments\n- All functions complete`,
  py: `- All imports exist\n- Consistent indentation\n- All functions have return\n- No undefined variables`,
  default: `- No syntax errors\n- All functions complete\n- No placeholders`,
};

const reviewCode = async (filePath, code, lang = "default") => {
  // FAST VALIDATION: Check for obvious problems WITHOUT calling LLM
  const issues = [];

  // Check for obvious code problems
  if (!code || code.trim().length < 10) {
    issues.push("File is nearly empty");
  }

  // Check for placeholder patterns
  if (/\/\/\s*(TODO|FIXME|add.*here|implement|placeholder)/i.test(code)) {
    issues.push("Contains placeholder/TODO comments");
  }

  // Check for "rest unchanged" or truncation
  if (/\/\/\s*(rest|remaining|\.\.\.)/i.test(code)) {
    issues.push("Code appears truncated");
  }

  // Check bracket balance for JS/TS
  if (["js", "ts", "default"].includes(lang)) {
    const opens = (code.match(/\{/g) || []).length;
    const closes = (code.match(/\}/g) || []).length;
    if (Math.abs(opens - closes) > 1) {
      issues.push(`Unbalanced braces: ${opens} open, ${closes} close`);
    }

    const parens_open = (code.match(/\(/g) || []).length;
    const parens_close = (code.match(/\)/g) || []).length;
    if (Math.abs(parens_open - parens_close) > 1) {
      issues.push(`Unbalanced parentheses: ${parens_open} open, ${parens_close} close`);
    }
  }

  // Check for files that require non-existent local files
  const localRequires = code.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g);
  for (const m of localRequires) {
    const reqPath = m[1];
    // Try to resolve relative to file location
    const dir = path.dirname(filePath);
    const resolved = path.join(dir, reqPath);
    const candidates = [resolved, resolved + ".js", resolved + ".ts", resolved + "/index.js"];
    const exists = candidates.some(c => {
      try { return fs.existsSync(path.join(process.cwd(), c)); } catch (_) { return false; }
    });
    if (!exists) {
      issues.push(`Requires non-existent local module: ${reqPath}`);
    }
  }

  if (issues.length > 0) {
    return { approved: false, issues, fixedCode: null };
  }

  // If fast check passes, approve without LLM call (saves time + avoids LLM hallucination)
  return { approved: true, issues: [], fixedCode: null };
};

const cleanFences = (code) => {
  if (!code) return code;
  return code.replace(/^```[\w]*\n?/gm, "").replace(/^```$/gm, "").trim();
};

// ── Reasoning Trace Logger ──
const TRACE_FILE = path.join(process.cwd(), ".agent-memory", "reasoning.log");

const logTrace = (entry) => {
  try {
    const dir = path.dirname(TRACE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(TRACE_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch (_) {}
};

const traceStep = (action, detail, outcome = "") => {
  logTrace({ action, detail: detail?.slice(0, 200), outcome: outcome?.slice(0, 100) });
};

const getRecentTrace = (limit = 20) => {
  try {
    const raw = fs.readFileSync(TRACE_FILE, "utf8");
    return raw.trim().split("\n").filter(Boolean).slice(-limit).map(l => {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
};

module.exports = { reviewCode, traceStep, getRecentTrace };