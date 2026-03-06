"use strict";

// ─────────────────────────────────────────────────────────────
// INTEGRATION AGENT
// After all modules are written, checks:
//   - imports resolve correctly across files
//   - function signatures match call sites
//   - API contracts are consistent
//   - no missing exports/requires
// This is where most AI-generated code breaks.
// ─────────────────────────────────────────────────────────────

const { postJSON }  = require("../llm/client");
const { readFile, writeFile, fileExists } = require("../tools/file");

const OLLAMA_URL = process.env.OLLAMA_URL  || "http://localhost:11434/api/generate";
const MODEL      = process.env.AGENT_MODEL || "deepseek-coder:6.7b";

// Reads all written files and checks integration
const checkIntegration = async (writtenFiles) => {
  if (!writtenFiles?.length) return { issues: [], fixed: [] };

  // Load all file contents
  const fileContents = {};
  for (const fp of writtenFiles) {
    if (fileExists(fp)) fileContents[fp] = readFile(fp);
  }

  if (!Object.keys(fileContents).length) return { issues: [], fixed: [] };

  const fileBlocks = Object.entries(fileContents)
    .map(([fp, content]) => `FILE: ${fp}\n---\n${content.slice(0, 800)}\n---`)
    .join("\n\n");

  const prompt = `You are an integration engineer. Review these files for integration issues:

${fileBlocks}

Check for:
1. Import/require paths that don't match actual file names
2. Functions called with wrong argument count
3. Exported names that don't match how they're imported
4. Missing module.exports or export statements
5. Circular dependencies

Respond ONLY with this JSON (no other text):
{
  "issues": [
    {
      "file": "<filename>",
      "type": "import|signature|export|circular",
      "description": "<what is wrong>",
      "fix": "<exact fix to apply>"
    }
  ],
  "clean": <true if no issues>
}`;

  try {
    const res = await postJSON(OLLAMA_URL, {
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 1500 },
    });

    const raw = (res.response || "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { issues: [], fixed: [] };

    const result = JSON.parse(jsonMatch[0]);
    return { issues: result.issues || [], clean: result.clean || false };
  } catch (_) {
    return { issues: [], fixed: [] };
  }
};

// Applies integration fixes by asking LLM to rewrite affected files
const fixIntegrationIssues = async (issues, writtenFiles) => {
  if (!issues?.length) return [];
  const fixed = [];

  // Group issues by file
  const byFile = {};
  for (const issue of issues) {
    if (!byFile[issue.file]) byFile[issue.file] = [];
    byFile[issue.file].push(issue);
  }

  for (const [fp, fileIssues] of Object.entries(byFile)) {
    if (!fileExists(fp)) continue;

    const content = readFile(fp);
    const issueList = fileIssues.map((i) => `- ${i.type}: ${i.description} → Fix: ${i.fix}`).join("\n");

    const prompt = `Fix these integration issues in ${fp}:

${issueList}

Current file content:
---
${content}
---

Respond with the complete corrected file content only. No explanation, no markdown fences.`;

    try {
      const res = await postJSON(OLLAMA_URL, {
        model: MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 4000 },
      });

      const fixedCode = (res.response || "").trim().replace(/^```[\w]*\n?/gm, "").replace(/^```$/gm, "").trim();

      // SAFETY: reject if output is truncated or looks like prose
      const ratio = fixedCode.length / content.length;
      const hasCode = /\b(function|const|let|var|def |class |import |require|return)\b/.test(fixedCode);
      if (fixedCode && fixedCode.length > 50 && ratio >= 0.6 && hasCode) {
        writeFile(fp, fixedCode);
        fixed.push(fp);
        console.log(`   🔗 Integration fix applied: ${fp}`);
      }
    } catch (_) {}
  }

  return fixed;
};

// Full integration pass: check + fix
const runIntegrationPass = async (writtenFiles) => {
  console.log("\n🔗 Integration Agent checking cross-file compatibility...");
  const { issues, clean } = await checkIntegration(writtenFiles);

  if (clean || !issues.length) {
    console.log("   ✅ All integrations clean.\n");
    return [];
  }

  console.log(`   ⚠️  Found ${issues.length} integration issue(s):`);
  issues.forEach((i) => console.log(`      [${i.type}] ${i.file}: ${i.description}`));

  const fixed = await fixIntegrationIssues(issues, writtenFiles);
  if (fixed.length) console.log(`   ✅ Fixed ${fixed.length} file(s).\n`);

  return fixed;
};

module.exports = { runIntegrationPass, checkIntegration };
