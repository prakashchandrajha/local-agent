"use strict";

/**
 * Self-Refinement Loop
 * Keeps improving code until quality threshold is met
 * This is the secret sauce that makes small models produce great code
 */

const { reviewCode, formatReview } = require("./critic");

/**
 * Refine code through multiple iterations
 * @param {string} task - Original task
 * @param {string} initialCode - First draft of code
 * @param {string} context - File context
 * @param {Object} options - Refinement options
 * @returns {Object} Final code and improvement history
 */
async function refineCode(task, initialCode, context = "", options = {}) {
  const {
    maxIterations = 3,
    targetScore = 8,
    minImprovement = 1
  } = options;

  let currentCode = initialCode;
  let currentScore = 0;
  const history = [];
  
  console.log(`🔄 Starting refinement loop (max: ${maxIterations}, target: ${targetScore}/10)`);
  
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n--- Iteration ${iteration} ---`);
    
    // Get critic review
    const review = await reviewCode(task, currentCode, context);
    
    // Calculate quality score (simple heuristic)
    const score = calculateQualityScore(review);
    const issuesCount = review.issues ? review.issues.length : 0;
    
    console.log(`📊 Quality Score: ${score}/10 (Issues: ${issuesCount})`);
    
    // Record this iteration
    history.push({
      iteration,
      score,
      issues: review.issues || [],
      code: currentCode
    });
    
    // Check if we should stop
    if (score >= targetScore) {
      console.log(`✅ Target score ${targetScore} reached! Stopping refinement.`);
      break;
    }
    
    if (issuesCount === 0) {
      console.log(`✅ No issues found! Code is good enough.`);
      break;
    }
    
    // Check if improvement is worth it
    if (iteration > 1 && score - currentScore < minImprovement) {
      console.log(`⚠️  Improvement too small (${score - currentScore} < ${minImprovement}). Stopping.`);
      break;
    }
    
    // Apply improvements if critic provided them
    if (review.improved_code && review.improved_code !== currentCode) {
      console.log(`🔧 Applying ${issuesCount} improvements...`);
      currentCode = review.improved_code;
      currentScore = score;
    } else {
      console.log(`⚠️  No improvements suggested by critic. Stopping.`);
      break;
    }
    
    // Safety check for last iteration
    if (iteration === maxIterations) {
      console.log(`🏁 Reached max iterations (${maxIterations}).`);
    }
  }
  
  // Final summary
  const finalScore = history[history.length - 1]?.score || 0;
  const improvement = history.length > 1 ? finalScore - history[0].score : 0;
  
  console.log(`\n📈 Refinement Summary:`);
  console.log(`   Initial score: ${history[0]?.score || 0}/10`);
  console.log(`   Final score: ${finalScore}/10`);
  console.log(`   Improvement: +${improvement}`);
  console.log(`   Iterations: ${history.length}`);
  
  return {
    finalCode: currentCode,
    finalScore,
    improvement,
    iterations: history.length,
    history
  };
}

/**
 * Calculate quality score from review
 * @param {Object} review - Critic review result
 * @returns {number} Score 0-10
 */
function calculateQualityScore(review) {
  let score = 10; // Start with perfect score
  
  if (!review.issues || review.issues.length === 0) {
    return 10;
  }
  
  // Deduct points for each issue
  const issuePenalties = {
    'missing input validation': 2,
    'unhandled error cases': 2,
    'division by zero': 3,
    'security': 3,
    'performance': 1,
    'type checking': 1,
    'null/undefined': 1,
    'best practices': 1,
    'naming': 0.5,
    'console.log': 0.5
  };
  
  review.issues.forEach(issue => {
    const lowerIssue = issue.toLowerCase();
    for (const [pattern, penalty] of Object.entries(issuePenalties)) {
      if (lowerIssue.includes(pattern)) {
        score -= penalty;
        break;
      }
    }
  });
  
  return Math.max(0, Math.round(score));
}

/**
 * Check if code is good enough for refinement
 * @param {string} code - Code to check
 * @returns {boolean} True if refinement should be attempted
 */
function shouldRefine(code) {
  // Very simple code doesn't need refinement
  const lines = code.split("\n").filter(line => line.trim()).length;
  if (lines < 5) return false; // Changed from 8 to 5
  
  // Check if it has complex patterns worth refining
  const complexPatterns = [
    /function\s+\w+/,           // Functions
    /class\s+\w+/,              // Classes
    /if\s*\(/,                  // Conditionals
    /try\s*{/,                  // Try-catch
    /for\s*\(|while\s*\(/,      // Loops
    /\/\//,                     // Comments (indicates some complexity)
  ];
  
  return complexPatterns.some(pattern => pattern.test(code));
}

/**
 * Format refinement results for display
 * @param {Object} result - Refinement result
 * @returns {string} Formatted summary
 */
function formatRefinementResult(result) {
  let output = `\n🎯 Refinement Results:\n`;
  output += `   Final Score: ${result.finalScore}/10\n`;
  output += `   Improvement: +${result.improvement}\n`;
  output += `   Iterations: ${result.iterations}\n`;
  
  if (result.iterations > 1) {
    output += `\n📈 Progress:\n`;
    result.history.forEach(h => {
      const issues = h.issues.length > 0 ? ` (${h.issues.length} issues)` : "";
      output += `   Iteration ${h.iteration}: ${h.score}/10${issues}\n`;
    });
  }
  
  return output;
}

module.exports = {
  refineCode,
  shouldRefine,
  calculateQualityScore,
  formatRefinementResult
};
