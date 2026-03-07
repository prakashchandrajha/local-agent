#!/usr/bin/env node
"use strict";

// Lightweight smoke test for the local agent. Keeps runtime short and avoids network calls.

const assert = require("assert");

const { buildIndex, loadIndex }   = require("../core/repo-indexer");
const { buildSystemPrompt }       = require("../config/prompts");
const { isSafePath, enforceSafePath } = require("../core/fileGuard");

const results = [];
const record = (name, fn) => {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err });
  }
};

record("repo-index builds", () => {
  const stats = buildIndex(false); // incremental, fast
  const idx   = loadIndex();
  assert(idx && Object.keys(idx).length > 0, "index is empty");
  assert(stats.totalFiles > 0, "no files counted");
});

record("system prompt structure", () => {
  const prompt = buildSystemPrompt({});
  assert(prompt.includes("RULES"), "rules missing");
  assert(prompt.includes("TOOL"), "tool format missing");
});

record("file guard blocks escape", () => {
  assert(isSafePath("agent.js"), "agent.js should be safe");
  const unsafe = "../etc/passwd";
  let threw = false;
  try { enforceSafePath(unsafe); } catch (_) { threw = true; }
  assert(threw, "enforceSafePath must throw on unsafe path");
});

// Summary
const failed = results.filter((r) => !r.ok);
results.forEach((r) => {
  if (r.ok) console.log(`✓ ${r.name}`);
  else console.log(`✗ ${r.name}: ${r.err?.message || r.err}`);
});

if (failed.length) {
  process.exitCode = 1;
}
