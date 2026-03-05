"use strict";

/**
 * Knowledge Wrapper System
 * Searches and injects curated knowledge files into agent prompts
 */

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

/**
 * Load all knowledge files from knowledge/ directory
 * @returns {Array} Array of {file, content} objects
 */
const loadAllKnowledge = () => {
  const knowledge = [];
  
  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      console.log("⚠️  Knowledge directory not found");
      return knowledge;
    }
    
    const files = fs.readdirSync(KNOWLEDGE_DIR);
    
    for (const file of files) {
      if (file.endsWith(".md")) {
        const filePath = path.join(KNOWLEDGE_DIR, file);
        const content = fs.readFileSync(filePath, "utf8");
        knowledge.push({
          file,
          content,
          lines: content.split("\n")
        });
      }
    }
    
    console.log(`📚 Loaded ${knowledge.length} knowledge files`);
  } catch (err) {
    console.error("❌ Error loading knowledge:", err.message);
  }
  
  return knowledge;
};

/**
 * Search knowledge for relevant content
 * @param {string} query - Search query (problem description)
 * @param {number} limit - Max results to return
 * @returns {Array} Relevant knowledge lines with context
 */
const searchKnowledge = (query, limit = 5) => {
  const knowledge = loadAllKnowledge();
  const queryLower = query.toLowerCase();
  const results = [];
  
  // Extract keywords from query
  const keywords = queryLower
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !["the", "and", "with", "from", "have", "this", "that"].includes(word));
  
  for (const file of knowledge) {
    let score = 0;
    let matchedLines = [];
    
    // Check if filename matches
    if (keywords.some(k => file.file.toLowerCase().includes(k))) {
      score += 10;
    }
    
    // Search each line
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i].trim();
      const lineLower = line.toLowerCase();
      
      // Skip empty lines, headers, code fences
      if (!line || line.startsWith("#") || line.startsWith("```")) continue;
      
      let lineScore = 0;
      
      // Check for keyword matches
      for (const keyword of keywords) {
        if (lineLower.includes(keyword)) {
          lineScore += 3;
        }
      }
      
      // Check for code examples
      if (line.includes("if (") || line.includes("throw new Error") || line.includes("function")) {
        lineScore += 2;
      }
      
      if (lineScore > 0) {
        // Get context (previous and next lines)
        const contextStart = Math.max(0, i - 1);
        const contextEnd = Math.min(file.lines.length, i + 2);
        const context = file.lines.slice(contextStart, contextEnd).join("\n").trim();
        
        matchedLines.push({
          line,
          context,
          score: lineScore,
          file: file.file
        });
      }
    }
    
    // Add top matches from this file
    matchedLines.sort((a, b) => b.score - a.score);
    for (const match of matchedLines.slice(0, 2)) {
      results.push(match);
    }
  }
  
  // Sort all results by score and limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
};

/**
 * Build knowledge injection for prompt
 * @param {string} problem - Problem description
 * @param {number} limit - Max knowledge items
 * @returns {string} Formatted knowledge string for prompt
 */
const buildKnowledgeInjection = (problem, limit = 3) => {
  const results = searchKnowledge(problem, limit);
  
  if (results.length === 0) {
    return "";
  }
  
  let injection = "\n\n📚 RELEVANT KNOWLEDGE:\n";
  
  results.forEach((result, i) => {
    injection += `\n[${i + 1}] From ${result.file}:\n`;
    injection += `    ${result.context}\n`;
  });
  
  injection += "\n";
  
  return injection;
};

/**
 * Get knowledge statistics
 * @returns {Object} Stats about knowledge base
 */
const getKnowledgeStats = () => {
  const knowledge = loadAllKnowledge();
  
  const stats = {
    totalFiles: knowledge.length,
    totalLines: 0,
    files: []
  };
  
  for (const file of knowledge) {
    stats.totalLines += file.lines.length;
    stats.files.push(file.file);
  }
  
  return stats;
};

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  searchKnowledge,
  buildKnowledgeInjection,
  loadAllKnowledge,
  getKnowledgeStats,
  KNOWLEDGE_DIR
};
