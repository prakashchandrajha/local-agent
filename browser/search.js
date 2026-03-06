"use strict";

const https = require("https");
const http = require("http");
const { addAtom } = require("../memory/knowledge-store");

// ─────────────────────────────────────────────────────────────
// BROWSER / WEB SEARCH MODULE
// When the agent is stuck after N fix attempts, it searches
// the web for solutions, extracts code snippets, applies them,
// and crystallizes working solutions as knowledge atoms.
//
// Uses DuckDuckGo Instant Answer API (no key needed) +
// direct Stack Overflow API (no key for basic use).
// ─────────────────────────────────────────────────────────────

const SEARCH_TIMEOUT = 8000;
const MAX_SEARCH_RESULTS = 5;

// ─────────────────────────────────────────────────────────────
// HTTP FETCH UTILITY
// ─────────────────────────────────────────────────────────────
const fetchUrl = (url, options = {}) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      timeout: SEARCH_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 CodingAgent/1.0",
        "Accept": "application/json",
      },
      ...options,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (_) {
          resolve({ raw: data });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });

// ─────────────────────────────────────────────────────────────
// STACK OVERFLOW SEARCH
// Free API, no key required for basic search
// ─────────────────────────────────────────────────────────────
const searchStackOverflow = async (query, lang = "") => {
  try {
    const encoded = encodeURIComponent(`${query} ${lang}`);
    const url = `https://api.stackexchange.com/2.3/search/advanced?q=${encoded}&tagged=${lang}&order=desc&sort=votes&site=stackoverflow&filter=withbody&pagesize=${MAX_SEARCH_RESULTS}`;

    const data = await fetchUrl(url);
    if (!data.items?.length) return [];

    return data.items.map((item) => ({
      title: item.title,
      url: item.link,
      score: item.score,
      answered: item.is_answered,
      // Strip HTML tags from body
      body: (item.body || "")
        .replace(/<code>([\s\S]*?)<\/code>/gi, "\n```\n$1\n```\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 800),
    }));
  } catch (err) {
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// DUCKDUCKGO INSTANT ANSWER
// Good for error messages — often returns SO answers directly
// ─────────────────────────────────────────────────────────────
const searchDuckDuckGo = async (query) => {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
    const data = await fetchUrl(url);

    const results = [];

    if (data.Abstract) {
      results.push({
        title: data.Heading || "DuckDuckGo",
        body: data.Abstract,
        url: data.AbstractURL,
        score: 99,
      });
    }

    if (data.RelatedTopics?.length) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text) {
          results.push({
            title: topic.Text.slice(0, 60),
            body: topic.Text,
            url: topic.FirstURL || "",
            score: 50,
          });
        }
      }
    }

    return results;
  } catch (_) {
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// CODE SNIPPET EXTRACTOR
// Pulls code blocks from search result bodies
// ─────────────────────────────────────────────────────────────
const extractCodeSnippets = (results) => {
  const snippets = [];

  for (const r of results) {
    const matches = (r.body || "").matchAll(/```[\s\S]*?```/g);
    for (const m of matches) {
      const code = m[0].replace(/^```\w*\n?/, "").replace(/```$/, "").trim();
      if (code.length > 20 && code.length < 2000) {
        snippets.push({ code, source: r.url, title: r.title });
      }
    }
  }

  return snippets;
};

// ─────────────────────────────────────────────────────────────
// ERROR SIGNATURE NORMALIZER
// Extracts the key error phrase from a full error output
// to build a better search query
// ─────────────────────────────────────────────────────────────
const normalizeErrorSignature = (errorOutput, lang = "") => {
  if (!errorOutput) return "";

  // Common error patterns by language
  const patterns = [
    // JS/TS
    /TypeError:\s+([^\n]{0,80})/i,
    /ReferenceError:\s+([^\n]{0,80})/i,
    /SyntaxError:\s+([^\n]{0,80})/i,
    /Error:\s+([^\n]{0,80})/i,
    // Python
    /(\w+Error):\s+([^\n]{0,80})/i,
    // Java/Spring
    /(Exception|Error):\s+([^\n]{0,80})/i,
    // Go
    /\.\/([\w.]+):\d+:\d+: ([^\n]{0,60})/i,
    // General
    /([A-Z]\w+Exception):\s+([^\n]{0,60})/i,
  ];

  for (const p of patterns) {
    const m = errorOutput.match(p);
    if (m) return `${lang} ${m[0].slice(0, 100)}`.trim();
  }

  // Fallback: first non-empty line
  return errorOutput.split("\n").find((l) => l.trim())?.slice(0, 100) || "";
};

// ─────────────────────────────────────────────────────────────
// MAIN: SEARCH FOR FIX
// Called when agent exhausts local fix attempts
// Returns { found, context, snippets }
// ─────────────────────────────────────────────────────────────
const searchForFix = async (errorOutput, lang = "", fileContext = "") => {
  const query = normalizeErrorSignature(errorOutput, lang);
  if (!query) return { found: false, context: "", snippets: [] };

  console.log(`\n🌐 Searching web for: "${query}"`);

  const [soResults, ddgResults] = await Promise.allSettled([
    searchStackOverflow(query, lang),
    searchDuckDuckGo(query),
  ]);

  const allResults = [
    ...(soResults.status === "fulfilled" ? soResults.value : []),
    ...(ddgResults.status === "fulfilled" ? ddgResults.value : []),
  ].sort((a, b) => (b.score || 0) - (a.score || 0));

  if (allResults.length === 0) {
    console.log("   No results found.");
    return { found: false, context: "", snippets: [] };
  }

  console.log(`   Found ${allResults.length} results`);

  const snippets = extractCodeSnippets(allResults);
  const summaries = allResults.slice(0, 3).map((r) => `  • ${r.title}\n    ${r.body?.slice(0, 150)}`);

  const context = `
WEB SEARCH RESULTS (for: "${query}"):
${summaries.join("\n")}

${snippets.length > 0 ? `CODE SNIPPETS FROM WEB:\n${snippets.map((s) => `// From: ${s.title}\n${s.code}`).join("\n\n---\n\n")}` : ""}
`.trim();

  return { found: true, context, snippets, query };
};

// ─────────────────────────────────────────────────────────────
// CRYSTALLIZE: Saves a web-sourced solution as a knowledge atom
// Called after a web-assisted fix is confirmed working
// ─────────────────────────────────────────────────────────────
const crystallizeSolution = ({ lang, query, solution, source }) => {
  if (!solution || solution.length < 20) return;

  // Distill the solution into a concise fact
  const fact = `[Web-learned] For "${query}": ${solution.slice(0, 200)}`;

  addAtom({
    lang,
    tags: query.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 4),
    fact,
    source: source || "web-search",
  });

  console.log(`\n🔬 Solution crystallized into knowledge base.`);
};

// Checks if network is available by pinging a reliable endpoint
const isOnline = async () => {
  try {
    await fetchUrl("https://api.duckduckgo.com/?q=test&format=json");
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = {
  searchForFix,
  crystallizeSolution,
  normalizeErrorSignature,
  isOnline,
};
