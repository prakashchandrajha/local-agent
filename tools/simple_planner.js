"use strict";

/**
 * Simple Planner Agent
 * Breaks user requests into clear, executable coding steps
 */

const axios = require("axios");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";

/**
 * Plan a coding task by breaking it into executable steps
 * @param {string} task - User's request
 * @param {string} context - Project context (files, imports, etc.)
 * @returns {Object} Plan with steps array
 */
async function planTask(task, context = "") {
  const prompt = `
You are a software planning agent.

Break the user request into clear coding steps.

Rules:
- return JSON only
- steps must be executable
- avoid explanation
- each step should be a single action
- use simple, clear language

Task:
${task}

Project Context:
${context}

Return format:
{"steps": ["step 1", "step 2", "step 3"]}`;

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.1, // Very low temperature for consistent JSON
        top_p: 0.9,
        num_predict: 500
      }
    });

    const content = response.data.response || "";
    
    // Try to parse JSON
    try {
      return JSON.parse(content);
    } catch (e) {
      console.log("⚠️  Failed to parse plan JSON, using fallback");
      return { steps: [task] };
    }
  } catch (err) {
    console.error("❌ Planning failed:", err.message);
    return { steps: [task] };
  }
}

/**
 * Check if a task needs planning (simple vs complex)
 * @param {string} task - User request
 * @returns {boolean} True if needs planning
 */
function needsPlanning(task) {
  // Simple requests that don't need planning
  const simplePatterns = [
    /^read\s+file/i,
    /^list\s+files/i,
    /^show\s+me/i,
    /^what\s+is/i,
    /^help/i,
    /^test/i,
    /^run/i,
    /^build/i,
    /^deploy/i,
    /^exit/i,
    /^history/i,
    /^clear/i,
    /^memory/i,
    /^knowledge/i,
    /^scan/i
  ];

  const text = task.toLowerCase().trim();
  
  // If it matches simple patterns, no planning needed
  if (simplePatterns.some(pattern => pattern.test(text))) {
    return false;
  }

  // If it contains complex keywords, needs planning
  const complexKeywords = [
    "create", "build", "implement", "add", "write", "make",
    "fix", "debug", "resolve", "refactor", "improve", "optimize",
    "server", "api", "auth", "login", "system", "feature", 
    "function", "class", "component", "module"
  ];

  return complexKeywords.some(keyword => text.includes(keyword));
}

/**
 * Format plan for display
 * @param {Object} plan - Plan object with steps
 * @returns {string} Formatted plan string
 */
function formatPlan(plan) {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return "";
  }

  let output = "\n📋 IMPLEMENTATION PLAN:\n\n";
  
  plan.steps.forEach((step, i) => {
    output += `${i + 1}. ${step}\n`;
  });

  return output;
}

module.exports = { 
  planTask, 
  needsPlanning,
  formatPlan 
};
