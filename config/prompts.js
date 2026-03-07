"use strict";

// ─────────────────────────────────────────────────────────────
// PROMPTS — Fixed for 6.7b model reliability
//
// Root cause of confusion:
//   Old order: base → tools → patterns → fis → lang → atoms →
//              memory → project → readme → RULES
//   Problem:   6.7b model reads 8 context blocks, then hits RULES
//              and has already forgotten the TOOL FORMAT.
//
// Fix — NEW order (critical for small models):
//   1. IDENTITY    — one sentence, who you are
//   2. CONTEXT     — knowledge, memory, project (optional)
//   3. RULES       — absolute constraints, short
//   4. TOOL FORMAT — exact format with examples LAST
//
// Principle: small models follow the LAST clear instruction
// they saw before generating. Put format + rules LAST.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// CORE IDENTITY — ultra short, no fluff
// ─────────────────────────────────────────────────────────────
const IDENTITY = `You are an expert autonomous coding agent. You write complete, production-ready code. You never truncate. You never use placeholders.`.trim();

// ─────────────────────────────────────────────────────────────
// RULES — short, numbered, zero contradictions
// ─────────────────────────────────────────────────────────────
const RULES = `RULES (follow exactly):
1. Always read a file before editing it — unless it is brand new.
2. Write 100% complete code — no TODO, no "...", no placeholders.
3. Fix ALL errors in one pass — never stop at the first one.
4. Respond using ONLY the TOOL blocks defined below. No prose outside them.
5. Use actual project file paths — never invent paths like "path/to/file".
6. Write multi-file tasks in dependency order — imports/utils first.
7. NEVER use list_files when the user asked you to create or write something.`.trim();


// ─────────────────────────────────────────────────────────────
// TOOL FORMAT — explicit, with concrete examples
// Shown LAST so it is freshest in model memory when generating
// ─────────────────────────────────────────────────────────────
const TOOL_FORMAT = `TOOL FORMAT — respond using ONLY these exact blocks:

── Talk to user ──────────────────────────────────────────────
TOOL: chat
MESSAGE:
Your message here.
END_MESSAGE

── List files ────────────────────────────────────────────────
TOOL: list_files

── Read a file ───────────────────────────────────────────────
TOOL: read_file
PATH: filename.js

── Write / create / overwrite a file ────────────────────────
TOOL: write_file
PATH: filename.js
CONTENT:
// full file content here — never truncated
END_CONTENT

── Delete a file ─────────────────────────────────────────────
TOOL: delete_file
PATH: filename.js

── Rename a file ─────────────────────────────────────────────
TOOL: rename_file
FROM: old.js
TO: new.js

── Run a file ────────────────────────────────────────────────
TOOL: run_file
PATH: filename.js

── Search web for error fix ─────────────────────────────────
TOOL: search_web
ERROR: <the error message>
LANG: javascript

Stack multiple blocks for multi-file tasks. One block per file.`.trim();

// Few-shot examples keep small models on-format
const TOOL_EXAMPLES = `
Example 1 — create a file
TOOL: write_file
PATH: hello.py
CONTENT:
def hello(name: str) -> str:
    return f"Hello {name}"

if __name__ == "__main__":
    print(hello("world"))
END_CONTENT

Example 2 — read then write
TOOL: read_file
PATH: app.js

TOOL: write_file
PATH: app.js
CONTENT:
// updated code here
END_CONTENT`.trim();

// ─────────────────────────────────────────────────────────────
// SECTION WRAPPER
// Keeps context blocks visually separated
// ─────────────────────────────────────────────────────────────
const wrapSection = (title, content) => {
  if (!content || !content.trim()) return "";
  return `${"─".repeat(56)}\n${title}:\n${content.trim()}`;
};

// ─────────────────────────────────────────────────────────────
// MAIN BUILDER
//
// NEW ORDER (fixes 6.7b confusion):
//   Identity → Custom instructions → Knowledge → Error patterns
//   → Memory → Project context → RULES → TOOL FORMAT
//
// RULES + TOOL FORMAT always last = recency bias works FOR us.
// ─────────────────────────────────────────────────────────────
const buildSystemPrompt = ({
  langProfile,
  atomBlock,
  memoryBlock,
  projectBlock,
  patternBlock,
  fisBlock,
  readmeContent,
} = {}) => {
  const parts = [IDENTITY];

  // Custom instructions (README) — before knowledge so agent
  // knows the project style when reading patterns
  if (readmeContent) {
    parts.push(wrapSection("CUSTOM PROJECT INSTRUCTIONS", readmeContent));
  }

  // Knowledge context — patterns, atoms, language profile grouped
  const knowledgeParts = [patternBlock, langProfile, atomBlock]
    .filter(Boolean)
    .join("\n\n");
  if (knowledgeParts) {
    parts.push(wrapSection("KNOWLEDGE & PATTERNS", knowledgeParts));
  }

  // Error intelligence — what this error means + known fix
  if (fisBlock) {
    parts.push(wrapSection("KNOWN ERROR PATTERNS", fisBlock));
  }

  // Past fixes from memory
  if (memoryBlock) {
    parts.push(wrapSection("MEMORY — PAST FIXES", memoryBlock));
  }

  // Project / repo context (CCE output)
  if (projectBlock) {
    parts.push(wrapSection("PROJECT CONTEXT", projectBlock));
  }

  // ── CRITICAL: RULES + FORMAT always at the very end ─────────
  parts.push(RULES);
  parts.push(TOOL_FORMAT);
  parts.push(TOOL_EXAMPLES);

  return parts.filter(Boolean).join("\n\n");
};

// ─────────────────────────────────────────────────────────────
// RETRY PROMPT BUILDER
//
// Old: "WRONG FORMAT. Only TOOL blocks. Original: ${prompt}"
// Problem: scolding without showing what correct looks like.
// A confused 6.7b model needs a CONCRETE EXAMPLE, not an error.
//
// New strategy per attempt:
//   Attempt 1 → show a full correct example
//   Attempt 2 → ultra minimal, force "TOOL:" as first token
//   Attempt 3 → force at minimum a chat block
// ─────────────────────────────────────────────────────────────
const buildRetryPrompt = (originalPrompt, attempt) => {
  if (attempt === 1) {
    return `Your previous response was not in the correct format.

You MUST respond using ONLY TOOL blocks. Example of correct output:

TOOL: chat
MESSAGE:
I will create the file now.
END_MESSAGE

TOOL: write_file
PATH: example.js
CONTENT:
"use strict";
const greet = (name) => \`Hello \${name}\`;
console.log(greet("world"));
END_CONTENT

Now respond correctly to: ${originalPrompt}`;
  }

  if (attempt === 2) {
    return `TOOL blocks only. No prose. Start with TOOL:

Task: ${originalPrompt}`;
  }

  // Last attempt — force at minimum a valid chat block
  return `Respond with this format minimum:
TOOL: chat
MESSAGE:
<your answer here>
END_MESSAGE

Task: ${originalPrompt}`;
};

// ─────────────────────────────────────────────────────────────
// LEGACY EXPORT — keeps any code using SYSTEM_PROMPT working
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = buildSystemPrompt();

module.exports = {
  buildSystemPrompt,
  buildRetryPrompt,
  SYSTEM_PROMPT,
  IDENTITY,
  RULES,
  TOOL_FORMAT,
  TOOL_EXAMPLES,
};
