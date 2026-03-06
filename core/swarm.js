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
 * ADAPTIVE VARIANT COUNT
 * Simple error? 2 variants.
 * Complex? Up to 4.
 */
const getVariantCount = (errorOutput) => {
  const lo = (errorOutput || "").toLowerCase();
  if (lo.includes("cannot find module") || lo.includes("not defined")) return 2;
  if (lo.includes("syntaxerror") || lo.includes("modulenotfound")) return 3;
  return 4; // default for unknown/complex errors
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
  const oLines = original.split("\n").filter(l=>l.trim().length > 5);
  const fLines = fixed.split("\n").filter(l=>l.trim().length > 5);
  
  if (oLines.length === 0) return 100;
  if (fLines.length === 0) return 0;

  let common = 0;
  for (const o of oLines) {
    const oNorm = o.replace(/\s+/g, "").toLowerCase();
    for (const f of fLines) {
      if (f.replace(/\s+/g, "").toLowerCase().includes(oNorm)) {
        common++;
        break; 
      }
    }
  }

  return (common / oLines.length) * 100;
};

/**
 * GENERATE SPECULATIVE PROMPT
 */
const buildSpeculativePrompt = (filePath, content, errorOutput, variantType) => {
  const types = {
    simple: "Provide the simplest, most direct fix. Don't refactor.",
    robust: "Provide a robust fix with error handling and defensive checks.",
    optimized: "Provide a high-performance fix. Focus on efficiency.",
    experimental: "Try an experimental or modern approach if possible.",
  };

  return `### TASK: FIX THE ERROR IN ${filePath}
### RULE: RETURN THE COMPLETE FILE. NO EXPLANATION. NO MARKDOWN CHUNKS.
### STRATEGY: ${types[variantType]}

### ERROR:
${errorOutput.slice(0, 500)}

### FILE CONTENT:
${content}

### FIXED FILE (NO YAPPING):`;
};

/**
 * LLM WORKER (Parallelizable)
 */
const generateVariant = async (filePath, content, errorOutput, type) => {
  const prompt = buildSpeculativePrompt(filePath, content, errorOutput, type);
  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.3 + (Math.random() * 0.4), num_predict: 4000 },
    });
    let code = cleanCode(res.response || "");
    return { type, code, success: code.length > 20 };
  } catch (_) {
    return { type, success: false };
  }
};

/**
 * PROJECT-ADAPTIVE SCORING
 * Weighting depends on project type (from repo metadata or manual)
 */
const getWeights = (filePath) => {
  const isSecurity = /auth|crypt|vault|login|permission/i.test(filePath);
  const isPerf     = /engine|core|math|async|sync/i.test(filePath);
  
  return {
    testPass: 100,
    security: isSecurity ? 40 : 10,
    perf:     isPerf ? 30 : 10,
    cleanup:  10,
  };
};

/**
 * EVALUATE VARIANT (Updated with adaptive scoring)
 */
const evaluateVariant = async (sbId, filePath, type, weights, originalCode) => {
  const runResult = sandbox.run(sbId, `node "${filePath}"`);
  
  let score = 0;
  const fixedCode = readFile(path.join(sandbox.getPath(sbId), filePath));
  const similarity = calculateSimilarity(originalCode, fixedCode);

  if (runResult.success) {
    score += weights.testPass;
    // Perf: shorter execution time (hypothetical)
    score += weights.perf;
    // Security check
    if (!/eval\(|new Function\(|innerHTML/i.test(fixedCode)) score += weights.security;
  } else {
    // Partial points if error changed
    score += 5;
  }

  // MAJOR PENALTY for hallucinations (less than 20% similar to original)
  if (similarity < 20) score -= 200;
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
 * MAIN: SPECULATE FIX (v7 Optimized)
 */
const speculateFix = async (filePath, errorOutput, lang = "") => {
  const content = readFile(filePath);
  const count = getVariantCount(errorOutput);
  const weights = getWeights(filePath);
  
  console.log(`   🐝 Swarm starting... Speculating ${count} variants.`);

  // 1. FIS-Aware Filtering: Check if we already know a fix
  const known = fis.instantLookup(errorOutput, lang);
  const initialStrategies = ["simple", "robust", "optimized", "experimental"].slice(0, count);
  
  // 2. Parallel Generation + Parallel Internet Backup (if needed)
  const llmTasks = initialStrategies.map((s, i) => {
    if (i === 0 && known && known.codeAfter) {
      console.log(`   📚 Injecting FIS-Recall as Variant #1`);
      return Promise.resolve({ type: "fis-recall", code: known.codeAfter, success: true });
    }
    return generateVariant(filePath, content, errorOutput, s);
  });

  // If error looks tough, start internet search in parallel
  let webTask = null;
  if (count >= 3 && !known) {
    console.log(`   🌐 Triggering parallel internet search...`);
    webTask = searchForFix(errorOutput, lang);
  }

  const variants = await Promise.all(llmTasks);
  const webResult = webTask ? await webTask : null;
  
  // If internet found a solid snippet, add it as an extra variant
  if (webResult && webResult.found && webResult.snippets?.[0]) {
    console.log(`   🌐 Adding internet-sourced variant...`);
    variants.push({ type: "web-sourced", code: webResult.snippets[0].code, success: true });
  }

  const validVariants = variants.filter(v => v.success);
  if (validVariants.length === 0) return { success: false, variants: [] };

  // 3. Parallel Testing (in Sandboxes)
  console.log(`   🧪 Testing ${validVariants.length} variants in parallel sandboxes...`);
  
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
