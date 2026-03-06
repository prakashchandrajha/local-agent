"use strict";

/**
 * Self-Review System - Agent critiques and improves its own code
 * Implements the "write -> review -> improve" cycle
 */

const axios = require("axios");
const { readFile } = require("./file");
const memory = require("./memory");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";

// ─────────────────────────────────────────────────────────────
// CODE REVIEW
// ─────────────────────────────────────────────────────────────

/**
 * Review and improve code automatically
 * @param {string} filePath - Path to the file that was just written
 * @param {string} originalCode - Code before changes (for comparison)
 * @param {string} context - What the code was supposed to do
 * @returns {Object} Review results with improvements
 */
const reviewAndImprove = async (filePath, originalCode, context = "") => {
  try {
    const currentCode = readFile(filePath);
    
    // Skip review for very simple files
    if (isSimpleFile(currentCode)) {
      return { improved: false, reason: "Simple file - no review needed" };
    }

    console.log("🔍 Starting code review...");
    
    const review = await generateReview(currentCode, context);
    
    if (review.needsImprovement && review.improvedCode) {
      // Save the improved version
      const fs = require("fs");
      fs.writeFileSync(filePath, review.improvedCode, "utf8");
      
      // Record the improvement in memory
      memory.addFix(
        filePath,
        "self_review",
        `Self-review improvement: ${review.mainIssue}`,
        currentCode,
        review.improvedCode,
        "improvement",
        ["self_review", "auto_improvement"]
      );

      console.log("✅ Code improved through self-review");
      return {
        improved: true,
        reason: review.mainIssue,
        improvements: review.improvements,
        before: currentCode,
        after: review.improvedCode
      };
    }

    console.log("✅ Code review passed - no improvements needed");
    return { improved: false, reason: "Code quality is good" };

  } catch (err) {
    console.error("❌ Self-review failed:", err.message);
    return { improved: false, reason: "Review system error" };
  }
};

/**
 * Generate code review using LLM
 */
const generateReview = async (code, context) => {
  const prompt = buildReviewPrompt(code, context);
  
  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.2, // Low temperature for consistent analysis
        top_p: 0.9,
        num_predict: 1500
      }
    });

    const reviewText = response.data.response || "";
    
    return parseReview(reviewText);
  } catch (err) {
    console.error("❌ Failed to generate review:", err.message);
    return { needsImprovement: false, reason: "Review generation failed" };
  }
};

/**
 * Build the code review prompt
 */
const buildReviewPrompt = (code, context) => {
  return `You are a Senior Code Reviewer conducting a quality review.

CONTEXT: ${context || "Code implementation"}

CODE TO REVIEW:
\`\`\`javascript
${code}
\`\`\`

REVIEW CRITERIA:
1. ✅ Correctness - Does the code work as intended?
2. ✅ Error Handling - Are edge cases handled properly?
3. ✅ Code Quality - Is it clean, readable, maintainable?
4. ✅ Performance - Any obvious performance issues?
5. ✅ Security - Any security vulnerabilities?
6. ✅ Best Practices - Follows language conventions?

COMMON ISSUES TO CHECK:
- Missing input validation
- Unhandled error cases  
- Memory leaks or resource issues
- Poor variable naming
- Complex nested logic
- Missing comments for complex parts
- Inefficient algorithms
- Security issues (injection, XSS, etc.)

RESPONSE FORMAT (exactly):
NEEDS_IMPROVEMENT: (yes/no)
MAIN_ISSUE: Brief description of the main problem if any
IMPROVEMENTS: List of specific improvements needed
IMPROVED_CODE: The complete improved code (if needs improvement)

Example responses:

Good code:
NEEDS_IMPROVEMENT: no
MAIN_ISSUE: none
IMPROVEMENTS: []
IMPROVED_CODE: 

Bad code:
NEEDS_IMPROVEMENT: yes
MAIN_ISSUE: Missing error handling and validation
IMPROVEMENTS: ["Add input validation", "Handle division by zero", "Add proper error messages"]
IMPROVED_CODE:
\`\`\`javascript
// improved code here
\`\`\`

Now review the provided code:`;
};

/**
 * Parse the review response
 */
const parseReview = (reviewText) => {
  const review = {
    needsImprovement: false,
    mainIssue: "none",
    improvements: [],
    improvedCode: "",
    rawText: reviewText
  };

  // Check if improvement is needed
  const needsImprovementMatch = reviewText.match(/NEEDS_IMPROVEMENT:\s*(yes|no)/i);
  if (needsImprovementMatch) {
    review.needsImprovement = needsImprovementMatch[1].toLowerCase() === "yes";
  }

  // Extract main issue
  const mainIssueMatch = reviewText.match(/MAIN_ISSUE:\s*([^\n]+)/i);
  if (mainIssueMatch) {
    review.mainIssue = mainIssueMatch[1].trim();
  }

  // Extract improvements list
  const improvementsMatch = reviewText.match(/IMPROVEMENTS:\s*\[([^\]]+)\]/i);
  if (improvementsMatch) {
    const improvementsText = improvementsMatch[1];
    review.improvements = improvementsText
      .split(",")
      .map(item => item.replace(/['"]/g, "").trim())
      .filter(item => item && item !== "none");
  }

  // Extract improved code
  const codeMatch = reviewText.match(/IMPROVED_CODE:\s*```javascript\s*([\s\S]*?)\s*```/i);
  if (codeMatch) {
    review.improvedCode = codeMatch[1].trim();
  }

  return review;
};

/**
 * Check if a file is too simple to need review
 */
const isSimpleFile = (code) => {
  const lines = code.split("\n").filter(line => line.trim()).length;
  
  // Very short files probably don't need review
  if (lines < 10) return true;
  
  // Check for simple patterns
  const simplePatterns = [
    /^module\.exports\s*=\s*{[^}]*};?$/m,  // Simple exports
    /^console\.log\(/m,                     // Just logging
    /^function\s+\w+\([^)]*\)\s*{\s*return\s*[^;]+;?\s*}$/m  // Simple one-liner functions
  ];

  return simplePatterns.some(pattern => pattern.test(code));
};

/**
 * Quick quality check without full review
 */
const quickQualityCheck = (code) => {
  const issues = [];
  
  // Check for common issues
  if (!code.includes("throw") && !code.includes("try") && !code.includes("catch")) {
    if (code.includes("/") || code.includes("parse") || code.includes("JSON")) {
      issues.push("Consider adding error handling");
    }
  }

  if (code.includes("==") && !code.includes("===")) {
    issues.push("Use strict equality (===) instead of (==)");
  }

  if (code.includes("var ")) {
    issues.push("Use const/let instead of var");
  }

  if (code.includes("console.log")) {
    issues.push("Remove debug console.log statements");
  }

  return {
    hasIssues: issues.length > 0,
    issues: issues
  };
};

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  reviewAndImprove,
  generateReview,
  quickQualityCheck,
  isSimpleFile
};
