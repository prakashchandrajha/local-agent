"use strict";

/**
 * Extracts tool commands from the LLM output.
 * Looks for exact matches of TOOL: <name> and its parameters.
 *
 * @param {string} text - Raw text from the LLM
 * @returns {Array<{tool: string, [key: string]: string}>}
 */
function parseToolBlocks(text) {
  const operations = [];

  // Match: TOOL: <tool_name>\n<optional_params>\nEND_<optional_capitals> or end of block naturally
  // For safety, we look for TOOL:
  const lines = text.split('\n');
  let currentOp = null;
  let capturingKey = null;
  let capturedContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("TOOL: ")) {
      if (currentOp) {
        if (capturingKey) {
          currentOp[capturingKey] = capturedContent.join('\n').trim();
        }
        operations.push(currentOp);
      }
      currentOp = { tool: line.substring(6).trim() };
      capturingKey = null;
      capturedContent = [];
      continue;
    }

    if (!currentOp) continue;

    // Check if it's the start of a multi-line block (like CONTENT:)
    const match = line.match(/^([A-Z_]+):(.*)$/);
    if (match) {
      if (capturingKey) {
        currentOp[capturingKey] = capturedContent.join('\n');
      }
      capturingKey = match[1].toLowerCase();
      
      const inlineData = match[2].trim();
      capturedContent = inlineData ? [inlineData] : [];
      continue;
    }

    // Check if it's the end of a block
    if (line.startsWith("END_")) {
      if (capturingKey) {
        currentOp[capturingKey] = capturedContent.join('\n');
      }
      capturingKey = null;
      capturedContent = [];
      continue;
    }

    // Stop capturing multi-line block if another TOOL or explicit boundaries appear
    if (capturingKey && (line.startsWith("TOOL:") || line.startsWith("System Tool Feedback:"))) {
      currentOp[capturingKey] = capturedContent.join('\n');
      capturingKey = null;
      capturedContent = [];
      // Don't continue, might be another TOOL line we need to process next iteration
    }

    // Accumulate multi-line
    if (capturingKey) {
      capturedContent.push(line);
    }
  }

  if (currentOp) {
    if (capturingKey) {
      let finalContent = capturedContent.join('\n');
      // Strip markdown codeblocks if accidentally included
      finalContent = finalContent.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
      currentOp[capturingKey] = finalContent;
    }
    operations.push(currentOp);
  }

  // Pre-process all operations to ensure clean content
  return operations.map(op => {
    // Strip trailing newlines/spaces from single-line args
    Object.keys(op).forEach(k => {
      if (typeof op[k] === 'string' && k !== 'content') {
         op[k] = op[k].trim();
      }
    });

    if (op.content) {
       op.content = op.content.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
    }
    return op;
  });
}

module.exports = { parseToolBlocks };
