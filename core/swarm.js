"use strict";

// ─────────────────────────────────────────────────────────────
// SWARM COORDINATOR
// Manages parallel speculative fix cycles.
// ─────────────────────────────────────────────────────────────

const path = require("path");
const { postJSON } = require("../llm/client");
const { readFile, writeFile, fileExists } = require("../tools/file");
const sandbox = require("../tools/sandbox");
const fis = require("../memory/fis");
const { searchForFix } = require("../browser/search");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const MODEL = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

/**
 * ADAPTIVE VARIANT COUNT (Dynamic Swarm Sizing)
 * Simple error? 2 variants.
 * Complex? Up to 5.
 */
const getVariantCount = (errorOutput) => {
  const lo = (errorOutput || "").toLowerCase();
  
  // High complexity: trace with many lines or fundamental errors
  if (lo.split("\n").length > 10 || lo.includes("syntaxerror")) return 5;
  
  // Medium complexity: unexpected behavior or missing core files
  if (lo.includes("modulenotfound") || lo.includes("typeerror")) return 3;
  
  // Low complexity: simple undefined or typo
  if (lo.includes("not defined") || lo.includes("cannot find module")) return 2;
  
  return 3; // Default
};

/**
 * CLEAN CODE
 * Strips markdown backticks and yapping.
 */
const cleanCode = (text) => {
  let code = text.trim();
  // Remove markdown blocks if present
  if (code.includes("```")) {
    const match = code.match(/```(?:[\w]*)\n([\s\S]*?)\n```/);
    if (match) code = match[1];
    else code = code.replace(/```[\w]*\n?/gm, "").replace(/```$/gm, "");
  }
  return code.trim();
};

/**
 * CALCULATE SIMILARITY
 * Checks how much of the original core structure remains.
 * Prevents "hallucinating" completely new functions/imports.
 */
const calculateSimilarity = (original, fixed) => {
  // Strip all whitespace and split into words/tokens
  const oTokens = original.replace(/[^a-zA-Z0-9{};=]/g, "");
  const fTokens = fixed.replace(/[^a-zA-Z0-9{};=]/g, "");
  
  if (oTokens.length === 0) return 100;
  if (fTokens.length === 0) return 0;

  // Use simple Longest Common Subsequence or chunky overlap
  // For speed, just check how many of the original tokens appear in the fixed
  let common = 0;
  const chunkSize = 10;
  const totalChunks = Math.floor(oTokens.length / chunkSize);
  
  if (totalChunks === 0) return 100;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = oTokens.slice(i * chunkSize, (i + 1) * chunkSize);
    if (fTokens.includes(chunk)) common++;
  }

  return (common / totalChunks) * 100;
};

/**
 * GENERATE SPECULATIVE PROMPT (Predictive Generation)
 */
const buildSpeculativePrompt = (filePath, content, errorOutput, variantType, predictionHint) => {
  const types = {
    simple: "Provide the simplest, most direct fix. Don't refactor.",
    robust: "Provide a robust fix with error handling and defensive checks.",
    optimized: "Provide a high-performance fix. Focus on efficiency.",
    experimental: "Try an experimental or modern approach if possible.",
    exhaustive: "Analyze the code deeply. Rewrite the broken logic completely if needed.",
  };

  const hintBlock = predictionHint ? `\n### PREDICTIVE HINT:\n${predictionHint}\n` : "";

  return `### TASK: FIX THE ERROR IN ${filePath}
### RULE: RETURN THE COMPLETE FILE. NO EXPLANATION. NO MARKDOWN CHUNKS.
### STRATEGY: ${types[variantType]}
${hintBlock}
### ERROR:
${errorOutput.slice(0, 500)}

### FILE CONTENT:
${content}

### FIXED FILE (NO YAPPING):`;
};

/**
 * LLM WORKER (Parallelizable & Async-Optimized)
 * In v7.1 we rely heavily on parallel promise dispatching.
 */
const generateVariant = async (filePath, content, errorOutput, type, predictionHint) => {
  const prompt = buildSpeculativePrompt(filePath, content, errorOutput, type, predictionHint);
  try {
    const startTime = Date.now();
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false, // Node fetch optimization over full TCP streaming
      options: { 
        temperature: 0.3 + (Math.random() * 0.4), 
        num_predict: 4000 
      },
    });
    let code = cleanCode(res.response || "");
    const latency = Date.now() - startTime;
    console.log(`      ⚡ LLM (${type}) generated ${code.length} chars in ${latency}ms`);
    return { type, code, success: code.length > 20 };
  } catch (_) {
    return { type, success: false };
  }
};

/**
 * PROJECT-ADAPTIVE SCORING (Self-Learning)
 * Weighting depends on project type and past successes.
 */
const getWeights = (filePath) => {
  const isSecurity = /auth|crypt|vault|login|permission/i.test(filePath);
  const isPerf     = /engine|core|math|async|sync/i.test(filePath);
  
  // Default base weights
  let weights = {
    testPass: 100,
    security: isSecurity ? 40 : 10,
    perf:     isPerf ? 30 : 10,
    cleanup:  10,
  };

  // Merge with learned weights (Reinforcement Loop)
  try {
    const memoryPath = path.join(process.cwd(), ".agent-memory", "eval-weights.json");
    if (fileExists(memoryPath)) {
      const learned = JSON.parse(readFile(memoryPath));
      if (learned.testPass) Object.assign(weights, learned);
    }
  } catch (_) {}

  return weights;
};

/**
 * REINFORCEMENT LOOP
 * Adjusts weights slightly based on the winning variant type
 */
const tuneWeights = (winnerType) => {
  try {
    const memoryPath = path.join(process.cwd(), ".agent-memory", "eval-weights.json");
    let w = getWeights("default");
    
    // Nudge weights towards the strategy that worked
    if (winnerType === "optimized") w.perf += 5;
    if (winnerType === "robust") w.security += 5;
    if (winnerType === "simple") w.cleanup += 5;

    // Cap weights so they don't spiral out of control
    w.perf = Math.min(w.perf, 80);
    w.security = Math.min(w.security, 80);
    w.cleanup = Math.min(w.cleanup, 50);

    const fs = require("fs");
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
    fs.writeFileSync(memoryPath, JSON.stringify(w, null, 2));
  } catch (_) {}
};

/**
 * EVALUATE VARIANT (Updated with adaptive scoring)
 */
const evaluateVariant = async (sbId, filePath, type, weights, originalCode) => {
  const sbPath = sandbox.getPath(sbId);
  const ext = path.extname(filePath);
  const incTest = require("./incremental-test");

  const start = Date.now();
  // 🔥 Now using the clever Incremental Test Runner 🔥
  const testRes = incTest.runIncrementalTests(sbId, path.join(sbPath, filePath));
  const timeMs = Date.now() - start;
  
  let score = 0;
  const fixedCode = readFile(path.join(sandbox.getPath(sbId), filePath));
  const similarity = calculateSimilarity(originalCode, fixedCode);

  if (testRes.success) {
    score += weights.testPass;
    // Perf: shorter execution time (hypothetical)
    score += weights.perf;
    // Security check
    if (!/eval\(|new Function\(|innerHTML/i.test(fixedCode)) score += weights.security;
  } else {
    // Partial points if error changed
    score += 5;
  }

  // MAJOR PENALTY for hallucinations (less than 10% similar to original)
  // Be more forgiving for very small files where fixes change a high percentage of tokens
  if (originalCode.length > 50 && similarity < 10) score -= 200;
  else if (similarity > 50) score += 20; // Bonus for preserving structure

  return { 
    type, 
    score, 
    success: runResult.success, 
    similarity,
    output: runResult.output.slice(0, 100) 
  };
};

/**
 * DISPLAY SWARM REPORT
 */
const displayReport = (results, winner) => {
  console.log(`\n🐝 SWARM REPORT`);
  console.log(`${"═".repeat(60)}`);
  for (const r of results) {
    const icon = r.success ? "✅" : "❌";
    const highlight = r.type === winner.type ? " ⭐ WINNER" : "";
    const sim = `Sim: ${Math.round(r.similarity)}%`.padEnd(10);
    console.log(`${icon} [${r.type.toUpperCase().padEnd(10)}] Score: ${String(r.score).padStart(3)} | ${sim} | ${r.success ? "PASS" : "FAIL"}${highlight}`);
  }
  console.log(`${"═".repeat(60)}\n`);
};

/**
 * MAIN: SPECULATE FIX (v7.1 Ultra-Optimized)
 */
const speculateFix = async (filePath, errorOutput, lang = "") => {
  const content = readFile(filePath);
  const count = getVariantCount(errorOutput);
  const weights = getWeights(filePath);
  
  console.log(`   🐝 Swarm starting... Speculating ${count} variants.`);

  // 1. Predictive Generation: Fetch CCE Hint
  const { getCompressedContext, logCCEStats } = require("./cce");
  const cceResult = getCompressedContext(`analyze error in ${filePath}: ${errorOutput.split("\n")[0]}`, MODEL);
  
  if (cceResult && cceResult.stats) {
    logCCEStats(cceResult.stats);
  }

  // Extract just the architecture and summary parts to keep it lightweight
  const predictiveHint = cceResult && cceResult.context ? cceResult.context.slice(0, 1500) : null;
  if (predictiveHint) {
    console.log(`   🧠 Injected CCE Predictive Hint (${predictiveHint.length} chars)`);
  }

  // 2. FIS-Aware Filtering: Check if we already know a fix
  const known = fis.instantLookup(errorOutput, lang);
  const initialStrategies = ["simple", "robust", "optimized", "experimental", "exhaustive"].slice(0, count);
  
  // 3. Parallel Generation + Parallel Internet Backup (if needed)
  const llmTasks = initialStrategies.map((s, i) => {
    if (i === 0 && known && known.codeAfter) {
      console.log(`   📚 Injecting FIS-Recall as Variant #1`);
      return Promise.resolve({ type: "fis-recall", code: known.codeAfter, success: true });
    }
    return generateVariant(filePath, content, errorOutput, s, predictiveHint);
  });

  // If error looks tough or we're exhaustive, start internet search in parallel
  let webTask = null;
  if (count >= 3 && !known) {
    console.log(`   🌐 Triggering parallel internet search (Hybrid Fusion)...`);
    webTask = searchForFix(errorOutput, lang);
  }

  const variants = await Promise.all(llmTasks);
  const webResult = webTask ? await webTask : null;
  
  // 3.5 Hybrid Knowledge Fusion
  // If internet found a solid snippet, add it as a prime variant
  if (webResult && webResult.found && webResult.snippets?.[0]) {
    console.log(`   🌐 Adding internet-sourced variant (Hybrid Knowledge Fusion)...`);
    // Ensure the snippet is actually code, not just markdown
    const webCode = cleanCode(webResult.snippets[0].code);
    if (webCode.length > 20) {
       variants.push({ type: "web-sourced", code: webCode, success: true });
    }
  }

  let validVariants = variants.filter(v => v.success);
  
  // Early exit if totally failed to generate
  if (validVariants.length === 0) return { success: false, variants: [] };

  // PREDICTIVE PRUNING (Phase 4): Skip variants that are exactly identical
  const uniqueCodes = new Set();
  validVariants = validVariants.filter(v => {
    const hash = v.code.replace(/\s+/g, "");
    if (uniqueCodes.has(hash)) return false;
    uniqueCodes.add(hash);
    return true;
  });

  // 4. Parallel Testing (in Sandboxes)
  console.log(`   🧪 Testing ${validVariants.length} unique variants in parallel sandboxes...`);
  
  const results = await Promise.all(validVariants.map(async (v) => {
    const sb = await sandbox.checkout(filePath);
    if (!sb) return { ...v, score: 0, success: false };

    try {
      console.log(`      • Variant ${v.type.padEnd(10)} | Code preview: ${v.code.slice(0, 50).replace(/\n/g, " ")}...`);
      sandbox.write(sb.id, filePath, v.code);
      const evalResult = await evaluateVariant(sb.id, filePath, v.type, weights, content);
      console.log(`        Result: ${evalResult.success ? "SUCCESS" : "FAIL"} | Sim: ${Math.round(evalResult.similarity)}% | Score: ${evalResult.score}`);
      return { ...v, ...evalResult };
    } finally {
      sandbox.release(sb.id);
    }
  }));

  // 4. Selection
  const winner = results.sort((a, b) => b.score - a.score)[0];
  displayReport(results, winner);

  // 5. Reinforcement Learning (Self-Tuning Evaluator)
  if (winner && winner.success) {
    tuneWeights(winner.type);
  }

  return {
    success: winner.success,
    winner,
    allVariants: results,
    count: results.length,
    fixSource: winner.type,
  };
};

module.exports = {
  speculateFix,
  getVariantCount,
  displayReport,
};
