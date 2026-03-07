"use strict";

const path = require("path");
const { postJSON } = require("../llm/client");
const { readFile, writeFile, fileExists } = require("../tools/file");
const sandbox = require("../tools/sandbox");
const fis = require("../memory/fis");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const MODEL = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

const getVariantCount = (errorOutput) => {
  const lo = (errorOutput || "").toLowerCase();
  if (lo.split("\n").length > 10 || lo.includes("syntaxerror")) return 4;
  if (lo.includes("modulenotfound") || lo.includes("typeerror")) return 3;
  return 2;
};

const cleanCode = (text) => {
  let code = text.trim();
  if (code.includes("```")) {
    const match = code.match(/```(?:[\w]*)\n([\s\S]*?)\n```/);
    if (match) code = match[1];
    else code = code.replace(/```[\w]*\n?/gm, "").replace(/```$/gm, "");
  }
  return code.trim();
};

// KEY FIX: Better similarity that actually works
const calculateSimilarity = (original, fixed) => {
  if (!original || !fixed) return 0;
  const oWords = original.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const fWords = new Set(fixed.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (oWords.length === 0) return 100;
  let common = 0;
  for (const w of oWords) { if (fWords.has(w)) common++; }
  return Math.round((common / oWords.length) * 100);
};

const buildSpeculativePrompt = (filePath, content, errorOutput, variantType) => {
  const strategies = {
    simple: "Provide the simplest, most direct fix. Change as little as possible.",
    robust: "Add null checks, default values, and defensive coding.",
    optimized: "Fix the bug and also improve performance where possible.",
    experimental: "Try a creative approach. Restructure the broken logic if needed.",
  };

  return `FIX THE ERROR in ${filePath}:
ERROR: ${errorOutput.slice(0, 400)}

STRATEGY: ${strategies[variantType]}

CURRENT CODE:
${content}

RULES:
- Return the COMPLETE fixed file
- Keep the same purpose and structure
- Do NOT add dependencies on files that don't exist
- Do NOT rewrite into a different program
- NO markdown, NO explanation, ONLY code

FIXED CODE:`;
};

const generateVariant = async (filePath, content, errorOutput, type) => {
  const prompt = buildSpeculativePrompt(filePath, content, errorOutput, type);
  try {
    const start = Date.now();
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2 + (Math.random() * 0.3), num_predict: 4000 },
    });
    const code = cleanCode(res.response || "");
    console.log(`      ⚡ ${type}: ${code.length} chars, ${Date.now() - start}ms`);
    return { type, code, success: code.length > 30 };
  } catch (_) {
    return { type, success: false };
  }
};

// KEY FIX: Evaluate in sandbox properly
const evaluateVariant = (sbId, filePath, type, originalCode, code) => {
  const sbPath = sandbox.getPath(sbId);
  if (!sbPath) return { type, score: -999, success: false, similarity: 0 };

  // Write the variant code
  sandbox.write(sbId, filePath, code);

  // Calculate similarity BEFORE running
  const similarity = calculateSimilarity(originalCode, code);

  // Run in sandbox
  const testResult = sandbox.run(sbId, `node "${filePath}"`, 10000);
  let score = 0;

  if (testResult.success) {
    score += 100;

    // Validate output quality
    const output = testResult.output || "";
    if (/\bNaN\b/.test(output)) score -= 50;
    if (/\bundefined\b/.test(output) && !/["']undefined["']/.test(output)) score -= 40;
    if (/\b(Error|TypeError|ReferenceError)\b/.test(output)) score -= 80;
    if (!output.trim()) score -= 20; // no output at all
  } else {
    score -= 100;
  }

  // Similarity bonus/penalty
  if (similarity > 50) score += 20;
  else if (similarity > 30) score += 10;
  else if (similarity < 10 && originalCode.length > 100) score -= 200; // hallucination

  // Reject if code has dangerous patterns the original didn't have
  if (!/eval\(/.test(originalCode) && /eval\(/.test(code)) score -= 50;

  return { type, score, success: testResult.success, similarity, output: (testResult.output || "").slice(0, 150) };
};

const displayReport = (results, winner) => {
  console.log(`\n🐝 SWARM REPORT`);
  console.log(`${"═".repeat(60)}`);
  for (const r of results) {
    const icon = r.score > 0 ? "✅" : "❌";
    const star = r === winner ? " ⭐" : "";
    console.log(`${icon} [${r.type.padEnd(12)}] Score: ${String(r.score).padStart(4)} | Sim: ${String(r.similarity).padStart(3)}% | ${r.success ? "PASS" : "FAIL"}${star}`);
  }
  console.log(`${"═".repeat(60)}\n`);
};

const speculateFix = async (filePath, errorOutput, lang = "") => {
  const content = readFile(filePath);
  if (!content || content.startsWith("ERROR")) return { success: false, variants: [] };

  const count = getVariantCount(errorOutput);
  console.log(`   🐝 Swarm: ${count} variants`);

  // FIS check
  const known = fis.instantLookup(errorOutput, lang);
  const strategies = ["simple", "robust", "optimized", "experimental"].slice(0, count);

  // Generate variants in parallel
  const tasks = strategies.map((s, i) => {
    if (i === 0 && known && known.codeAfter) {
      return Promise.resolve({ type: "fis-recall", code: known.codeAfter, success: true });
    }
    return generateVariant(filePath, content, errorOutput, s);
  });

  const variants = await Promise.all(tasks);
  let valid = variants.filter(v => v.success && v.code);

  if (!valid.length) return { success: false, variants: [] };

  // Deduplicate
  const seen = new Set();
  valid = valid.filter(v => {
    const hash = v.code.replace(/\s+/g, "");
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });

  // Test in sandboxes
  console.log(`   🧪 Testing ${valid.length} variants...`);
  sandbox.initPool();

  const results = (await Promise.all(valid.map(async (v) => {
    const sb = await sandbox.checkout(filePath);
    if (!sb) return null;
    try {
      const evalResult = evaluateVariant(sb.id, filePath, v.type, content, v.code);
      return { ...v, ...evalResult };
    } finally {
      sandbox.release(sb.id);
    }
  }))).filter(Boolean);

  if (!results.length) return { success: false, variants: [] };

  // Sort by score, pick best
  results.sort((a, b) => b.score - a.score);
  const winner = results[0];
  displayReport(results, winner);

  // KEY FIX: Only accept winner if score is POSITIVE
  if (winner.score <= 0) {
    console.log(`   ⚠️  No variant scored positive — all rejected`);
    return { success: false, winner: null, allVariants: results, count: results.length };
  }

  return {
    success: winner.success && winner.score > 0,
    winner,
    allVariants: results,
    count: results.length,
    fixSource: winner.type,
  };
};

module.exports = { speculateFix, getVariantCount, displayReport };
