"use strict";

const fs = require("fs");
const path = require("path");

const PATTERNS_DIR = path.join(process.cwd(), "patterns");

/**
 * Pattern utility to load and match good architectural patterns 
 * to guide the LLM instead of letting it invent weak architectures.
 */
class PatternLibrary {
  constructor() {
    this.patterns = new Map();
    this._loadPatterns();
  }

  _loadPatterns() {
    if (!fs.existsSync(PATTERNS_DIR)) {
      return;
    }

    const files = fs.readdirSync(PATTERNS_DIR);
    for (const file of files) {
      if (file.endsWith(".md")) {
        const fullPath = path.join(PATTERNS_DIR, file);
        const content = fs.readFileSync(fullPath, "utf8");
        this.patterns.set(file.toLowerCase(), content);
      }
    }
  }

  /**
   * Identifies relevant architectural patterns based on user input or active file
   * @param {string} task
   * @param {string} fileContext
   * @returns {string} Pattern content string
   */
  getRelevantPatterns(task, fileContext = "") {
    const keywords = {
      "express": ["express", "route", "api", "controller"],
      "react": ["react", "component", "jsx", "tsx", "ui"],
      "service": ["service", "business logic"],
      "validation": ["validation", "joi", "yup", "zod", "input", "schema"]
    };

    const combined = `${task} ${fileContext}`.toLowerCase();
    const matchedPatterns = [];

    // Simple heuristic matcher
    if (keywords.express.some(k => combined.includes(k))) {
      matchedPatterns.push("express_api_pattern.md");
    }
    if (keywords.react.some(k => combined.includes(k))) {
      matchedPatterns.push("react_component_pattern.md");
    }
    if (keywords.service.some(k => combined.includes(k))) {
      matchedPatterns.push("service_layer_pattern.md");
    }
    if (keywords.validation.some(k => combined.includes(k))) {
      matchedPatterns.push("input_validation_pattern.md");
    }

    if (matchedPatterns.length === 0) return "";

    let patternText = "\n\n📚 STANDARD ARCHITECTURAL PATTERNS TO FOLLOW:\n";
    matchedPatterns.forEach(filename => {
      const content = this.patterns.get(filename);
      if (content) {
        patternText += `\n--- Pattern: ${filename} ---\n${content}\n`;
      }
    });

    if (matchedPatterns.length > 0) {
        console.log(`📦 Injecting ${matchedPatterns.length} standard pattern(s) into context...`);
    }

    return patternText;
  }
}

module.exports = new PatternLibrary();
