# Project Demo — Supercharged Local Coding Agent

## What it is now
1. Full software-company pipeline: CEO (clarify), Architect (design), Coders, Integrator (cross-file fixes), QA, Optimizer.
2. Fast tiers: INSTANT/NORMAL/FULL routing with dynamic `num_predict` (1500/3000/4000), optional fast model (`AGENT_FAST_MODEL`), and streaming responses.
3. Context control: minimal prompt for simple tasks, capped CCE for normal, full CCE + memory/FIS for complex work.
4. Reliability guards: file safety checks, overwrite length guard, syntax check before running JS, adaptive retry temperatures, few-shot tool examples to avoid format errors.
5. Learning loop: repo index + graph, knowledge atoms, failure intelligence patterns, fix history, and solution reuse hooks.
6. Self-tests: `npm test` runs `tests/selftest.js` to validate index building, prompt structure, and file-guard safety.

## How to run
1. Start your model server (Ollama) with the desired models (e.g., `deepseek-coder:6.7b`, optional fast model).
2. Start the agent: `npm start` (or `npm run dev` for debug, `npm run fast` to skip review).
3. Issue tasks at the prompt (examples):
   - `create demo.py`
   - `fix error in src/foo.js`
   - `build small express api` (triggers FULL tier)

## What it learns and stores
- Index, project map, and dependency graph in `.agent-memory/repo-index.json` and `graph.json`.
- Knowledge atoms and patterns in `.agent-memory/atoms.json` and `patterns.json`.
- Fix and failure history in `.agent-memory/fixes.json` and `failures.json`.
- Session and sandbox artifacts in `.agent-memory/`.

## Current limitations
1. LLM availability: requires reachable Ollama endpoint; timeouts surface if the model is down.
2. Streaming parser is best-effort; malformed tool output may still need a retry.
3. QA/test coverage is minimal; `tests/selftest.js` is a smoke check, not full regression.

## Quick next improvements to consider
1. Add fast-model autodetect and benchmark selection.
2. Expand selftests to run targeted project tests and linting.
3. Persist “solution DNA” snippets and TF-IDF lookup for faster reuse.
4. Predictive FIS injection before first write on complex tasks.
