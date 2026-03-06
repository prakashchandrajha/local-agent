"use strict";

const path = require("path");
const fs = require("fs");

/**
 * Tool Parser - Parses LLM responses into structured operations
 * Handles extraction and validation of tool commands from LLM output
 */
class ToolParser {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Parses one or more TOOL blocks from an LLM response
   * @param {string} response - Raw LLM response
   * @returns {Array} - Array of { tool, path?, content? } objects
   */
  parseToolBlocks(response) {
    const operations = [];
    const seenFiles = new Set(); // prevent duplicate reads/writes for same file

    try {
      // First try the standard parsing approach
      const standardOps = this._parseStandardToolBlocks(response, seenFiles);
      if (standardOps.length > 0) {
        this.logger.debug("Parsed using standard method", { 
          operationCount: standardOps.length,
          operations: standardOps.map(op => ({ tool: op.tool, path: op.path }))
        });
        return standardOps;
      }

      // If standard parsing fails, try mixed content extraction
      const mixedOps = this._parseMixedContentToolBlocks(response, seenFiles);
      if (mixedOps.length > 0) {
        this.logger.debug("Parsed using mixed content method", { 
          operationCount: mixedOps.length,
          operations: mixedOps.map(op => ({ tool: op.tool, path: op.path }))
        });
        return mixedOps;
      }

      // Fallback: check if raw response looks like code
      const fallbackOp = this._parseRawCode(response);
      if (fallbackOp) {
        operations.push(fallbackOp);
      }

      this.logger.debug("Final operations parsed", { 
        operationCount: operations.length,
        operations: operations.map(op => ({ tool: op.tool, path: op.path }))
      });

    } catch (err) {
      this.logger.error("Error parsing tool blocks", { 
        error: err.message,
        responsePreview: response.substring(0, 200)
      });
    }

    return operations;
  }

  /**
   * Parses standard tool blocks (original method)
   */
  _parseStandardToolBlocks(response, seenFiles) {
    const operations = [];
    const toolMarkerRegex = /^TOOL:\s*(\w+)/gm;
    let marker;

    while ((marker = toolMarkerRegex.exec(response)) !== null) {
      const tool = marker[1].toLowerCase();
      const afterMarker = response.slice(marker.index + marker[0].length);

      const operation = this._parseToolBlock(tool, afterMarker, seenFiles);
      if (operation) {
        operations.push(operation);
      }
    }

    return operations;
  }

  /**
   * Parses tool blocks from mixed content (LLM responses with explanations)
   */
  _parseMixedContentToolBlocks(response, seenFiles) {
    const operations = [];
    const toolBlocks = this._extractToolBlocksFromMixedContent(response);

    for (const block of toolBlocks) {
      const operation = this._parseToolBlock(block.tool, block.content, seenFiles);
      if (operation) {
        operations.push(operation);
      }
    }

    return operations;
  }

  /**
   * Parses a single tool block
   * @param {string} tool - Tool name
   * @param {string} afterMarker - Content after tool marker
   * @param {Set} seenFiles - Set of already processed files
   * @returns {Object|null} - Parsed operation or null
   */
  _parseToolBlock(tool, afterMarker, seenFiles) {
    switch (tool) {
      case "chat":
        return this._parseChatBlock(afterMarker);
      
      case "list_files":
        return this._parseListFilesBlock(seenFiles);
      
      case "read_file":
        return this._parseReadFileBlock(afterMarker, seenFiles);
      
      case "write_file":
        return this._parseWriteFileBlock(afterMarker, seenFiles);
      
      case "run_tests":
        return this._parseRunTestsBlock(afterMarker);
      
      default:
        this.logger.warn("Unknown tool type", { tool });
        return null;
    }
  }

  /**
   * Extracts tool blocks from mixed content (LLM responses with explanations)
   * @param {string} content - Content that may contain tool blocks
   * @returns {Array} - Array of extracted tool blocks
   */
  _extractToolBlocksFromMixedContent(content) {
    const toolBlocks = [];
    
    // Find all TOOL: markers and their content up to the next TOOL: or end
    const toolRegex = /TOOL:\s*(\w+)\s*([\s\S]*?)(?=TOOL:\s*\w+|$)/g;
    let match;
    
    while ((match = toolRegex.exec(content)) !== null) {
      const toolName = match[1].trim();
      let toolContent = match[2].trim();
      
      // Remove any trailing explanatory text after tool blocks
      if (toolName === 'write_file') {
        const contentEndMatch = toolContent.match(/([\s\S]*?END_CONTENT)/);
        if (contentEndMatch) {
          toolContent = contentEndMatch[1];
        } else {
          // If no END_CONTENT, try to extract up to the next logical break
          const lines = toolContent.split('\n');
          let contentLines = [];
          let inContent = false;
          
          for (const line of lines) {
            if (line.trim().startsWith('CONTENT:')) {
              inContent = true;
              continue;
            }
            if (inContent && (line.trim().startsWith('END_CONTENT') || line.match(/^\s*TOOL:/))) {
              break;
            }
            if (inContent) {
              contentLines.push(line);
            }
          }
          
          if (contentLines.length > 0) {
            toolContent = 'CONTENT:\n' + contentLines.join('\n');
          }
        }
      }
      
      toolBlocks.push({
        tool: toolName,
        content: toolContent
      });
    }
    
    return toolBlocks;
  }

  /**
   * Parses chat tool block
   * @param {string} content - Content after TOOL: chat
   * @returns {Object|null} - Chat operation or null
   */
  _parseChatBlock(content) {
    const msgMatch = content.match(/^\s*\nMESSAGE:\s*\n([\s\S]*?)(?:END_MESSAGE|(?=\nTOOL:)|$)/i);
    if (msgMatch) {
      return { tool: "chat", message: msgMatch[1].trim() };
    }
    
    this.logger.warn("Invalid chat block format");
    return null;
  }

  /**
   * Parses list_files tool block
   * @param {Set} seenFiles - Set of already processed files
   * @returns {Object|null} - List files operation or null
   */
  _parseListFilesBlock(seenFiles) {
    // Only add once per response
    if (seenFiles.has("list_files")) {
      return null;
    }
    seenFiles.add("list_files");
    
    return { tool: "list_files" };
  }

  /**
   * Parses read_file tool block
   * @param {string} content - Content after TOOL: read_file
   * @param {Set} seenFiles - Set of already processed files
   * @returns {Object|null} - Read file operation or null
   */
  _parseReadFileBlock(content, seenFiles) {
    // More lenient pattern - allow various whitespace and formatting
    const pathMatch = content.match(/PATH:\s*([^\n\s]+)/i);
    if (!pathMatch) {
      this.logger.warn("Invalid read_file block - missing PATH", { contentPreview: content.substring(0, 100) });
      return null;
    }

    const filePath = pathMatch[1].trim();
    const fileKey = `read:${filePath}`;
    
    if (seenFiles.has(fileKey)) {
      this.logger.debug("Skipping duplicate read operation", { filePath });
      return null;
    }
    
    seenFiles.add(fileKey);

    // Validate file exists
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      this.logger.debug("File not found, skipping read", { filePath });
      return null;
    }

    return { tool: "read_file", path: filePath };
  }

  /**
   * Parses write_file tool block
   * @param {string} content - Content after TOOL: write_file
   * @param {Set} seenFiles - Set of already processed files
   * @returns {Object|null} - Write file operation or null
   */
  _parseWriteFileBlock(content, seenFiles) {
    // More lenient patterns - allow various whitespace and formatting
    const pathMatch = content.match(/PATH:\s*([^\n\s]+)/i);
    const contentMatch = content.match(/CONTENT:\s*\n([\s\S]*?)(?:\nEND_CONTENT|(?=\nTOOL:)|$)/i);
    
    if (!pathMatch || !contentMatch) {
      this.logger.warn("Invalid write_file block - missing PATH or CONTENT", { 
        contentPreview: content.substring(0, 100) 
      });
      return null;
    }

    const filePath = pathMatch[1].trim();
    const fileKey = `write:${filePath}`;
    
    if (seenFiles.has(fileKey)) {
      this.logger.debug("Skipping duplicate write operation", { filePath });
      return null;
    }
    
    seenFiles.add(fileKey);

    const cleanedContent = this._cleanCodeFences(contentMatch[1].trim());
    
    // Check for placeholder content in conversions
    if (cleanedContent.includes("<complete working code>") || 
        cleanedContent.includes("complete working code") ||
        cleanedContent.length < 20) {
      this.logger.warn("Detected placeholder content in write operation", { 
        filePath, 
        contentPreview: cleanedContent.substring(0, 100) 
      });
      // Return null to skip this operation and force retry
      return null;
    }
    
    return { 
      tool: "write_file", 
      path: filePath, 
      content: cleanedContent 
    };
  }

  /**
   * Parses run_tests tool block
   * @param {string} content - Content after TOOL: run_tests
   * @returns {Object} - Run tests operation
   */
  _parseRunTestsBlock(content) {
    const cmdMatch = content.match(/COMMAND:\s*([^\n]+)/i);
    return {
      tool: "run_tests",
      command: cmdMatch ? cmdMatch[1].trim() : "npm test"
    };
  }

  /**
   * Parses raw code as fallback
   * @param {string} response - Raw response
   * @returns {Object|null} - Raw code operation or null
   */
  _parseRawCode(response) {
    const codePatterns = [
      /^const\s+/m,
      /^function\s+/m,
      /^import\s+/m,
      /^export\s+/m,
      /^class\s+/m,
      /^def\s+/m
    ];

    if (codePatterns.some((pattern) => pattern.test(response))) {
      const cleanedContent = this._cleanCodeFences(response);
      return { 
        tool: "_raw_code", 
        content: cleanedContent 
      };
    }

    return null;
  }

  /**
   * Cleans markdown code fences from extracted content
   * @param {string} content - Content with potential code fences
   * @returns {string} - Cleaned content
   */
  _cleanCodeFences(content) {
    if (!content) return "";
    
    let lines = content.split("\n");
    
    // Remove opening code fences
    while (lines.length > 0 && lines[0].match(/^```\w*$/)) {
      lines.shift();
    }
    
    // Remove closing code fences
    while (lines.length > 0 && lines[lines.length - 1].match(/^```$/)) {
      lines.pop();
    }
    
    // Remove any remaining code fence lines
    lines = lines.filter((line) => !line.match(/^```/));
    
    return lines.join("\n").trim();
  }

  /**
   * Extracts filename from natural language input
   * @param {string} input - Natural language input
   * @returns {string|null} - Extracted filename or null
   */
  extractFilename(input) {
    const patterns = [
      /(?:create|make|write|save|generate|fix|read|open|show)\s+(?:a\s+)?(?:file\s+)?(?:called\s+)?["']?([\w\-\.]+\.[\w]+)["']?/i,
      /(?:file|filename)\s+(?:called\s+)?["']?([\w\-\.]+\.[\w]+)["']?/i,
      /["']?([\w\-\.]+\.[\w]+)["']?\s+file/i,
      // File type conversion patterns
      /(?:change|convert)\s+([\w\-\.]+)\.(?:md|js|py|html|css|txt|json)\s+(?:to\s+)?(?:js|javascript|python|py|html|css|markdown|md)/i,
      /(?:change|convert)\s+(?:type\s+of\s+)?([\w\-\.]+\.[\w]+)\s+(?:to\s+)?(?:js|javascript|python|py|html|css|markdown|md)/i,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}

module.exports = ToolParser;
