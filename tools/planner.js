"use strict";

/**
 * Planning Layer - Makes agent think before coding
 * Creates structured plans for complex tasks
 */

const axios = require("axios");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";

// ─────────────────────────────────────────────────────────────
// PLAN GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * Generate a structured plan for a coding task
 * @param {string} userRequest - The user's request
 * @param {Object} context - Project context (file, imports, etc.)
 * @returns {Object} Structured plan with steps
 */
const generatePlan = async (userRequest, context = {}) => {
  const prompt = buildPlanningPrompt(userRequest, context);
  
  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3, // Lower temperature for consistent planning
        top_p: 0.9,
        num_predict: 1000
      }
    });

    const planText = response.data.response || "";
    
    return parsePlan(planText);
  } catch (err) {
    console.error("❌ Failed to generate plan:", err.message);
    return createFallbackPlan(userRequest);
  }
};

/**
 * Build the planning prompt with engineering mindset
 */
const buildPlanningPrompt = (userRequest, context) => {
  return `You are a Senior Software Engineer planning a coding task.

TASK: ${userRequest}

CONTEXT:
${context.file ? `Active file: ${context.file}` : ""}
${context.imports ? `Imports: ${context.imports.join(", ")}` : ""}
${context.structures ? `Available functions: ${context.structures.functions?.join(", ") || "none"}` : ""}

RULES:
1. Think step-by-step before coding
2. Break complex tasks into smaller steps
3. Consider edge cases and error handling
4. Plan for clean, maintainable code
5. Consider performance and security implications

Create a structured plan. Format exactly like this:

PLAN:
[Step 1]: Brief description of what to do first
[Step 2]: Brief description of what to do second  
[Step 3]: Brief description of what to do third
[etc...]

COMPLEXITY: (simple/medium/complex)
ESTIMATED_TIME: (quick/medium/long)
RISKS: List any potential risks or edge cases

Example:
PLAN:
[Step 1]: Create input validation function
[Step 2]: Implement core business logic
[Step 3]: Add error handling for edge cases
[Step 4]: Write tests for the functionality
COMPLEXITY: medium
ESTIMATED_TIME: medium
RISKS: Division by zero, invalid input types

Now create the plan for the given task:`;
};

/**
 * Parse the plan from LLM response
 */
const parsePlan = (planText) => {
  const plan = {
    steps: [],
    complexity: "medium",
    estimatedTime: "medium",
    risks: [],
    rawText: planText
  };

  // Extract steps
  const stepMatches = planText.match(/\[Step \d+\]:([^\n]+)/g);
  if (stepMatches) {
    plan.steps = stepMatches.map(step => 
      step.replace(/\[Step \d+\]:\s*/, "").trim()
    );
  }

  // Extract complexity
  const complexityMatch = planText.match(/COMPLEXITY:\s*(\w+)/i);
  if (complexityMatch) {
    plan.complexity = complexityMatch[1].toLowerCase();
  }

  // Extract time estimate
  const timeMatch = planText.match(/ESTIMATED_TIME:\s*(\w+)/i);
  if (timeMatch) {
    plan.estimatedTime = timeMatch[1].toLowerCase();
  }

  // Extract risks
  const risksMatch = planText.match(/RISKS:\s*([^\n]+)/i);
  if (risksMatch) {
    plan.risks = risksMatch[1].split(",").map(r => r.trim()).filter(r => r);
  }

  return plan;
};

/**
 * Create a fallback plan if LLM fails
 */
const createFallbackPlan = (userRequest) => {
  return {
    steps: [
      "Analyze the requirements",
      "Implement the core functionality", 
      "Add error handling",
      "Test the implementation"
    ],
    complexity: "medium",
    estimatedTime: "medium",
    risks: ["Unknown edge cases"],
    rawText: "Fallback plan generated"
  };
};

/**
 * Check if a request needs planning (simple vs complex)
 */
const needsPlanning = (userRequest) => {
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
    /^deploy/i
  ];

  // Complex requests that need planning
  const complexPatterns = [
    /create|build|implement|add|write/i,
    /fix|debug|resolve/i,
    /refactor|improve|optimize/i,
    /system|feature|function|class/i,
    /login|auth|api|database/i
  ];

  const text = userRequest.toLowerCase().trim();
  
  // Check if it's explicitly simple
  if (simplePatterns.some(pattern => pattern.test(text))) {
    return false;
  }

  // Check if it looks complex
  if (complexPatterns.some(pattern => pattern.test(text))) {
    return true;
  }

  // Default: if it's longer than 20 chars, probably needs planning
  return text.length > 20;
};

/**
 * Format plan for display to user
 */
const formatPlanForDisplay = (plan) => {
  let output = "\n📋 IMPLEMENTATION PLAN:\n\n";
  
  plan.steps.forEach((step, i) => {
    output += `${i + 1}. ${step}\n`;
  });

  output += `\n📊 Complexity: ${plan.complexity}`;
  output += `\n⏱️  Estimated time: ${plan.estimatedTime}`;
  
  if (plan.risks.length > 0) {
    output += `\n⚠️  Risks: ${plan.risks.join(", ")}`;
  }

  return output;
};

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  generatePlan,
  needsPlanning,
  formatPlanForDisplay,
  createFallbackPlan
};
