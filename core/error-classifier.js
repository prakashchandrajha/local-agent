"use strict";

// Fast, regex-based error classifier. Pure and side-effect free.

const RULES = [
  {
    type: "syntax",
    confidence: 0.9,
    match: /(syntaxerror|unexpected token|unexpected end of|unterminated)/i,
  },
  {
    type: "missing-dependency",
    confidence: 0.9,
    match: /(cannot find module '([^']+)'|modulenotfounderror: no module named '([^']+)')/i,
    detail: (m) => m[2] || m[3],
  },
  {
    type: "missing-file",
    confidence: 0.8,
    match: /(enoent|no such file or directory)/i,
    detail: (m, text) => {
      const p = text.match(/'(.*?)'/);
      return p ? p[1] : null;
    },
  },
  {
    type: "permission",
    confidence: 0.8,
    match: /(eacces|permission denied)/i,
    detail: (m, text) => {
      const p = text.match(/'(.*?)'/);
      return p ? p[1] : null;
    },
  },
  {
    type: "port-in-use",
    confidence: 0.85,
    match: /(eaddrinuse[^\d]*(\d{2,5}))/i,
    detail: (m) => m[2],
  },
  {
    type: "runtime",
    confidence: 0.7,
    match: /(typeerror|referenceerror|is not a function|cannot read|cannot set property|NaN\b)/i,
  },
];

const classify = (errorText = "", lang = "") => {
  const text = String(errorText || "");
  for (const rule of RULES) {
    const m = text.match(rule.match);
    if (m) {
      return {
        type: rule.type,
        confidence: rule.confidence,
        detail: rule.detail ? rule.detail(m, text, lang) : null,
      };
    }
  }
  return { type: "logic", confidence: 0.3, detail: null };
};

module.exports = { classify };
