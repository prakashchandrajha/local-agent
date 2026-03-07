"use strict";

// ─────────────────────────────────────────────────────────────
// LLM CLIENT — uses Node.js built-in http/https only
// Zero external dependencies. Replaces axios entirely.
// ─────────────────────────────────────────────────────────────

const http  = require("http");
const https = require("https");

// Makes a JSON POST request and returns parsed response body
const postJSON = (url, body, timeoutMs = 600000) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const lib     = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data",  (chunk) => (data += chunk));
      res.on("end",   () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}\nRaw: ${data.slice(0, 200)}`)); }
      });
    });

    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    req.write(payload);
    req.end();
  });

// Streaming JSON POST for Ollama — yields tokens incrementally
const postJSONStream = (url, body, { onToken, timeoutMs = 600000, shouldStop } = {}) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const lib     = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    };

    const req = lib.request(options, (res) => {
      let buffer = "";
      let full   = "";

      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            if (json.response) {
              full += json.response;
              if (onToken) onToken(json.response);
              if (shouldStop && shouldStop(full)) {
                res.destroy();
                req.destroy();
                return resolve({ response: full, done: true, stoppedEarly: true });
              }
            }
            if (json.done) return resolve({ response: full, done: true });
          } catch (_) {
            // Ignore partial parse errors; keep accumulating
          }
        }
      });

      res.on("end",   () => resolve({ response: full, done: true }));
    });

    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    req.write(payload);
    req.end();
  });

module.exports = { postJSON, postJSONStream };
