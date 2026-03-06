"use strict";

// ─────────────────────────────────────────────────────────────
// READLINE WRAPPER — Node.js built-in only
// Replaces readline-sync with synchronous-style async calls.
// Uses readline/promises (Node 17+) with sync fallback.
// ─────────────────────────────────────────────────────────────

const readline = require("readline");

// Creates a readline interface for stdin/stdout
const makeRL = () =>
  readline.createInterface({ input: process.stdin, output: process.stdout });

// Asks a question and returns the answer (async)
const question = (prompt) =>
  new Promise((resolve) => {
    const rl = makeRL();
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

// Asks a Y/N question, returns boolean
const keyInYN = async (prompt) => {
  const answer = await question(`${prompt} [y/N] `);
  return /^y(es)?$/i.test(answer);
};

module.exports = { question, keyInYN };
