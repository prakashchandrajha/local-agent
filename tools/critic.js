"use strict";

/**
 * Critic Agent - Reviews and improves code quality
 * The secret sauce that makes agents write much better code
 */

const axios = require("axios");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";
const DEBUG = false;

/**
 * Review code and suggest improvements
 * @param {string} task - Original task description
 * @param {string} code - Code to review
 * @param {string} context - Additional context (file type, etc.)
 * @returns {Object} Review result with issues and improved code
 */
async function reviewCode(task, code, context = "") {
  const prompt = `
You are a senior software engineer conducting a code review.

TASK: ${task}

CONTEXT: ${context}

CODE TO REVIEW:
\`\`\`javascript
${code}
\`\`\`

Review the code for:
1. Correctness - Does it work as intended?
2. Error handling - Are edge cases handled?
3. Input validation - Are inputs validated?
4. Code quality - Is it clean and maintainable?
5. Security - Any security vulnerabilities?
6. Performance - Any obvious performance issues?
7. Best practices - Follows conventions?

Return JSON format exactly:
{
  "issues": ["issue 1", "issue 2"],
  "improved_code": "improved version if needed, otherwise same code"
}

Common issues to check:
- Missing input validation
- Unhandled error cases
- Division by zero
- Null/undefined checks
- Type checking
- Security issues
- Poor variable names
- Missing error messages`;

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.2, // Low temperature for consistent analysis
        top_p: 0.9,
        num_predict: 2000
      }
    });

    const content = response.data.response || "";
    
    // Try to extract JSON more robustly
    let jsonStr = "";
    
    // Look for JSON object pattern
    const jsonMatch = content.match(/\{[\s\S]*?"issues"[\s\S]*?"improved_code"[\s\S]*?\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else {
      // Fallback: try to find any JSON-like structure
      const fallbackMatch = content.match(/\{[\s\S]*\}/);
      if (fallbackMatch) {
        jsonStr = fallbackMatch[0];
      }
    }
    
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        
        // Ensure the structure is correct
        if (!parsed.issues) parsed.issues = [];
        if (!parsed.improved_code) parsed.improved_code = code;
        
        return parsed;
      } catch (e) {
        console.log("⚠️  Failed to parse critic JSON");
        if (DEBUG) console.log("JSON string:", jsonStr);
      }
    }
    
    // Fallback if JSON parsing fails
    return { issues: [], improved_code: code };
    
  } catch (err) {
    console.error("❌ Critic review failed:", err.message);
    return { issues: [], improved_code: code };
  }
}

/**
 * Quick quality check for simple issues
 * @param {string} code - Code to check
 * @returns {Array} List of found issues
 */
function quickQualityCheck(code) {
  const issues = [];
  
  // Check for common issues
  if (code.includes("==") && !code.includes("===")) {
    issues.push("Use strict equality (===) instead of (==)");
  }
  
  if (code.includes("var ")) {
    issues.push("Use const/let instead of var");
  }
  
  if (code.includes("console.log") && !code.includes("console.error")) {
    issues.push("Remove debug console.log statements");
  }
  
  if (code.includes("/") && !code.includes("try") && !code.includes("catch")) {
    if (!code.includes("=== 0") && !code.includes("== 0")) {
      issues.push("Consider division by zero handling");
    }
  }
  
  if (code.includes("parseFloat") || code.includes("parseInt")) {
    if (!code.includes("isNaN") && !code.includes("Number.isNaN")) {
      issues.push("Add NaN check after parsing numbers");
    }
  }
  
  return issues;
}

/**
 * Check if code needs review
 * @param {string} code - Code to check
 * @returns {boolean} True if review is needed
 */
function needsReview(code) {
  // Very simple code doesn't need review
  const lines = code.split("\n").filter(line => line.trim()).length;
  if (lines < 5) return false;
  
  // Check for patterns that indicate complexity
  const complexPatterns = [
    /function\s+\w+\([^)]*\)\s*{/,  // Function definitions
    /if\s*\(/,                     // Conditionals
    /for\s*\(/,                    // Loops
    /while\s*\(/,                  // While loops
    /try\s*{/,                     // Error handling
    /catch\s*\(/,                  // Error handling
    /throw\s+/,                    // Throwing errors
    /class\s+\w+/,                 // Class definitions
  ];
  
  return complexPatterns.some(pattern => pattern.test(code));
}

/**
 * Format review results for display
 * @param {Object} review - Review result
 * @returns {string} Formatted review summary
 */
function formatReview(review) {
  if (!review.issues || review.issues.length === 0) {
    return "✅ Code review passed - no issues found";
  }
  
  let output = `🔍 Code Review Found ${review.issues.length} Issue(s):\n`;
  review.issues.forEach((issue, i) => {
    output += `  ${i + 1}. ${issue}\n`;
  });
  
  if (review.improved_code && review.improved_code !== review.improved_code) {
    output += "\n✅ Code has been improved automatically";
  }
  
  return output;
}

module.exports = { 
  reviewCode, 
  quickQualityCheck,
  needsReview,
  formatReview 
};
