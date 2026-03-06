# Agent Instructions

This file is automatically loaded by the agent on startup.
Write your custom instructions below — they will be injected directly into the agent's system prompt.

---

## Coding Style

- Always use `const` instead of `var` for variable declarations.
- Use arrow functions instead of traditional `function` declarations where possible.
- Add a brief comment above every function explaining what it does.
- Always handle errors with try/catch blocks and log meaningful error messages.

## Language & Framework Preferences

- Default language: JavaScript (Node.js)
- Preferred framework for servers: Express.js
- Preferred framework for CLIs: Commander.js
- For async work: always use async/await, never raw Promises or callbacks.

## File Conventions

- File names should be `kebab-case` (e.g., `my-module.js`, not `myModule.js`)
- Every new JS file should start with `"use strict";`
- Always add a newline at the end of every file.

## Output Behavior

- When generating code, include a short `// Usage:` comment at the top of the file showing how to run it.
- When fixing a file, fix ALL issues found — do not stop at the first error.
- Never use placeholder comments like `// TODO` or `// add logic here` in generated code; always include real, working code

## Project Context

<!--
  Fill this section in to give the agent context about your project.
  Example:
  - This is a REST API for a task management app.
  - The database is PostgreSQL accessed via the `pg` npm package.
  - Auth is handled with JWT tokens stored in Authorization headers.
-->

---

## Persistent Memory

This agent has **Persistent Memory** enabled via `tools/memory.js`. It automatically:
- Records every code fix with before/after diffs
- Retrieves relevant past fixes when working on similar files
- Tags fixes by file type and change category for easy lookup

**Commands:**
- `memory` - View statistics about recorded fixes

**Storage:**
- Memory entries: `persistent_memory.jsonl`
- Index: `memory_index.json`

See `MEMORY_USAGE.md` for detailed usage instructions.

---

## How to Customize This File

You can change any of the sections above to match your preferences. The agent reads this file fresh on every run, so your changes take effect immediately — no restart needed

**Tips:**
- Be specific. "Use 2-space indentation" works better than "format nicely."
- Add project context so the agent understands your codebase.
- Remove sections you don't need to keep prompts focused.
