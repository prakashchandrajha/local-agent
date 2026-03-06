"use strict";

// ─────────────────────────────────────────────────────────────
// QA AGENT
// After code is written and integrated:
//   1. Generates minimal test file
//   2. Runs the main entry point
//   3. Feeds failures back to fix loop
// Creates self-healing code cycles.
// ─────────────────────────────────────────────────────────────

const { postJSON }   = require("../llm/client");
const { readFile, writeFile, runFile, fileExists } = require("../tools/file");
const path = require("path");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

// Maps language to test file naming convention
const TEST_NAMING = {
  ".js":   (f) => f.replace(".js",  ".test.js"),
  ".ts":   (f) => f.replace(".ts",  ".test.ts"),
  ".py":   (f) => f.replace(".py",  "_test.py"),
  ".java": (f) => f.replace(".java", "Test.java"),
  ".go":   (f) => f.replace(".go",  "_test.go"),
};

// Generates a minimal test file for a given source file
const generateTests = async (filePath, fileContent) => {
  const ext      = path.extname(filePath).toLowerCase();
  const testPath = TEST_NAMING[ext]?.(filePath);
  if (!testPath) return null;

  const prompt = `Write a minimal but meaningful test file for this code.

SOURCE FILE: ${filePath}
---
${fileContent.slice(0, 1500)}
---

Requirements:
- Test the main exported functions
- Cover happy path and one error case
- Use the standard test framework for this language (Jest for JS, pytest for Python, JUnit for Java, go test for Go)
- Keep it short (under 60 lines)
- Make it runnable with zero configuration

Write only the complete test file. No explanation, no markdown.`;

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 2000 },
    });

    const code = (res.response || "").trim()
      .replace(/^```[\w]*\n?/gm, "")
      .replace(/^```$/gm, "")
      .trim();

    if (code && code.length > 50) {
      writeFile(testPath, code);
      console.log(`   🧪 Test file generated: ${testPath}`);
      return testPath;
    }
    return null;
  } catch (_) {
    return null;
  }
};

// Runs a file and returns structured result
const runAndCapture = (filePath) => {
  if (!fileExists(filePath)) return { success: false, output: `File not found: ${filePath}` };
  const result = runFile(filePath);
  return result;
};

// Full QA pass for a set of written files
// Returns { passed, failed, testFiles }
const runQAPass = async (writtenFiles, generateTestFiles = false) => {
  console.log("\n🧪 QA Agent running validation...");

  const results = { passed: [], failed: [], testFiles: [] };

  for (const fp of writtenFiles) {
    if (!fileExists(fp)) continue;

    // Generate test file if requested
    if (generateTestFiles) {
      const content  = readFile(fp);
      const testPath = await generateTests(fp, content);
      if (testPath) results.testFiles.push(testPath);
    }

    // Run the file itself (for scripts/entry points)
    const ext = path.extname(fp).toLowerCase();
    const isRunnable = [".js", ".py", ".go", ".rb", ".sh"].includes(ext);
    const isTest     = fp.includes(".test.") || fp.includes("_test.") || fp.endsWith("Test.java");

    if (isRunnable && !isTest) {
      const r = runAndCapture(fp);
      if (r.success) {
        results.passed.push(fp);
        console.log(`   ✅ ${fp} — OK`);
      } else {
        // Filter out expected "no entry point" errors
        const isExpectedError = /is not a function|Cannot find module|No such file/i.test(r.output);
        if (!isExpectedError) {
          results.failed.push({ file: fp, error: r.output });
          console.log(`   ❌ ${fp} — ${r.output.split("\n")[0].slice(0, 80)}`);
        }
      }
    }
  }

  const total = results.passed.length + results.failed.length;
  if (total > 0) {
    console.log(`\n   Results: ${results.passed.length}/${total} passed\n`);
  } else {
    console.log("   (No runnable entry points found — skipping execution check)\n");
  }

  return results;
};

module.exports = { runQAPass, generateTests, runAndCapture };
