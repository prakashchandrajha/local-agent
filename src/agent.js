"use strict";

const readline = require("readline-sync");
const fs = require("fs");
const path = require("path");

// Import new modular components
const { getConfig } = require("../config");
const { getLogger } = require("./utils/logger");
const LLMService = require("./services/llm");
const ToolParser = require("./parsers/tool-parser");

// Import existing tools
const { readFile, writeFile, listFiles } = require("../tools/file");
const memory = require("../tools/memory");
const scanner = require("../tools/scanner");
const { refineCode, shouldRefine, formatRefinementResult } = require("../tools/refiner");
const patternLibrary = require("../tools/pattern_library");
const testRunner = require("../tools/test_runner");

/**
 * Main Agent Class - Orchestrates all services and handles user interaction
 */
class Agent {
  constructor() {
    // Initialize configuration and logging
    this.config = getConfig();
    this.logger = getLogger(this.config.config);
    
    // Initialize services
    this.llmService = new LLMService(this.config.config, this.logger);
    this.toolParser = new ToolParser(this.logger);
    
    // Conversation state
    this.conversationHistory = [];
    this.activeFile = null;
    this.projectMap = null;
    
    this.logger.info("Agent initialized", {
      environment: this.config.getEnvironment(),
      llmModel: this.config.get("llm.model"),
      debugMode: this.config.isDebug()
    });
  }

  /**
   * Starts the main agent loop
   */
  async run() {
    this.logger.operationStart("agent_startup");
    
    try {
      // Load initial context
      const systemPrompt = this._buildSystemPrompt();
      this._loadProjectContext();
      
      this.logger.success("Agent ready", {
        systemPromptLoaded: !!systemPrompt,
        projectContextLoaded: !!this.projectMap
      });

      // Main conversation loop
      while (true) {
        const userInput = this._getUserInput();
        if (!userInput) continue;

        if (this._handleSpecialCommands(userInput)) {
          continue;
        }

        await this._processUserRequest(userInput, systemPrompt);
      }
    } catch (err) {
      this.logger.operationFail("agent_startup", err);
      throw err;
    }
  }

  /**
   * Gets user input from command line
   */
  _getUserInput() {
    const input = readline.question("You: ").trim();
    if (!input) return null;
    
    this.logger.debug("User input received", { 
      length: input.length,
      preview: input.substring(0, 50) 
    });
    
    return input;
  }

  /**
   * Handles special commands like exit, help, memory, scan
   */
  _handleSpecialCommands(input) {
    const command = input.toLowerCase();
    
    switch (command) {
      case "exit":
        this.logger.info("Exiting agent");
        process.exit(0);
        return true;
        
      case "help":
        this._showHelp();
        return true;
        
      case "memory":
        this._showMemoryStats();
        return true;
        
      case "history":
        this._showHistory();
        return true;
        
      case "scan":
        this._handleScanCommand();
        return true;
        
      default:
        return false;
    }
  }

  /**
   * Processes user request through the LLM and tool pipeline
   */
  async _processUserRequest(userInput, systemPrompt) {
    this.logger.operationStart("process_request", { 
      userInput: userInput.substring(0, 100) 
    });

    try {
      // Add user input to conversation history
      this._rememberTurn("user", userInput);

      // Build memory context if available
      const memoryContext = this._buildMemoryContext(this.activeFile);
      
      // Process request with fix loop
      const result = await this._executeFixLoop(
        userInput, 
        systemPrompt, 
        memoryContext
      );

      // Handle results
      if (result.summaries.length === 0) {
        const errMsg = "Sorry, I couldn't complete that after multiple attempts.";
        console.log(`\n❌ ${errMsg}\n`);
        this._rememberTurn("assistant", errMsg);
      } else {
        const assistantSummary = result.summaries.join(" | ");
        this._rememberTurn("assistant", assistantSummary);
        
        if (result.activeFile) {
          this.activeFile = result.activeFile;
          this._promptForContinuation();
        }
      }

      this.logger.operationComplete("process_request", {
        summariesCount: result.summaries.length,
        activeFile: result.activeFile
      });

    } catch (err) {
      this.logger.operationFail("process_request", err);
      console.log(`\n❌ Error processing request: ${err.message}\n`);
    }
  }

  /**
   * Executes the fix loop for handling file operations
   */
  async _executeFixLoop(userInput, systemPrompt, memoryContext) {
    let currentPrompt = userInput;
    let contextFile = this.activeFile;

    for (let attempt = 1; attempt <= this.config.get("llm.maxRetries"); attempt++) {
      this.logger.debug("Fix loop attempt", { attempt, maxRetries: this.config.get("llm.maxRetries") });

      // Add architectural patterns dynamically
      const patternContext = patternLibrary.getRelevantPatterns(currentPrompt, contextFile);
      const executionPrompt = systemPrompt + memoryContext + patternContext;

      // Call LLM
      const llmResponse = await this.llmService.callLLM(
        currentPrompt,
        executionPrompt,
        this.conversationHistory
      );

      if (!llmResponse) {
        this.logger.warn("LLM service returned null response");
        continue;
      }

      // Parse tool operations
      const operations = this.toolParser.parseToolBlocks(llmResponse.raw);
      
      if (operations.length === 0) {
        this.logger.warn("No operations parsed from LLM response");
        continue;
      }

      // Execute operations
      const result = await this._executeOperations(operations, userInput, contextFile);
      
      if (result.summaries.length > 0) {
        return result;
      }

      // If we get here, we need to retry with the file content
      if (result.fileContent) {
        currentPrompt = this._buildRetryPrompt(userInput, result.fileContent);
        contextFile = result.contextFile;
      } else if (this._isConversionRequest(userInput) && attempt < this.config.get("llm.maxRetries")) {
        // Special handling for failed conversions
        this.logger.warn("Conversion attempt failed, retrying with explicit instructions", { attempt });
        currentPrompt = this._buildConversionRetryPrompt(userInput, contextFile);
      }
    }

    return { summaries: [], activeFile: contextFile };
  }

  /**
   * Executes parsed operations
   */
  async _executeOperations(operations, userInput, contextFile) {
    const readResults = [];
    const writeResults = [];
    const allSummaries = [];
    let lastWrittenFile = null;

    for (const op of operations) {
      switch (op.tool) {
        case "chat":
          console.log(`\n💬 ${op.message}\n`);
          allSummaries.push(op.message);
          break;

        case "list_files":
          const files = listFiles();
          console.log(`\n📁 Files in current directory:\n${files}\n`);
          allSummaries.push("Listed directory files");
          break;

        case "read_file":
          const content = readFile(op.path);
          if (content && !content.startsWith("ERROR:")) {
            console.log(`\n📖 Read: ${op.path}\n`);
            readResults.push({ path: op.path, content });
            allSummaries.push(`Read: ${op.path}`);
            // Update contextFile to the file that was read
            contextFile = op.path;
          }
          break;

        case "write_file":
          const writeResult = await this._handleWriteOperation(op, lastWrittenFile, userInput);
          if (writeResult.success) {
            writeResults.push(writeResult.path);
            lastWrittenFile = writeResult.path;
            allSummaries.push(`Created/updated: ${writeResult.path}`);
          }
          break;

        case "run_tests":
          const testResult = await testRunner.runTests(op.command);
          console.log(`\n🧪 Test Results:\n${testResult.output}\n`);
          if (testResult.success) {
            allSummaries.push(`Ran tests successfully: ${op.command}`);
          } else {
            allSummaries.push(`Test failure: ${op.command}`);
            readResults.push({ path: `Test Output for ${op.command}`, content: `Command: ${op.command}\nOutput:\n${testResult.output}` });
          }
          break;

        case "_raw_code":
          const rawResult = await this._handleRawCodeOperation(op, userInput, contextFile);
          if (rawResult.success) {
            writeResults.push(rawResult.path);
            lastWrittenFile = rawResult.path;
            allSummaries.push(`Created: ${rawResult.path}`);
          }
          break;
      }
    }

    // Return appropriate result based on operations executed
    if (writeResults.length > 0) {
      return { summaries: allSummaries, activeFile: lastWrittenFile };
    }

    if (readResults.length > 0) {
      return { 
        summaries: allSummaries, 
        activeFile: contextFile,
        fileContent: readResults.map(r => `FILE: ${r.path}\n---\n${r.content}\n---`).join("\n\n"),
        contextFile: contextFile
      };
    }

    return { summaries: allSummaries, activeFile: contextFile };
  }

  /**
   * Handles write file operations with memory recording and self-refinement
   */
  async _handleWriteOperation(operation, fallbackFilename, userInput) {
    try {
      const fullPath = path.join(process.cwd(), operation.path);
      let oldContent = null;

      // Read old content for memory recording
      if (this.config.get("memory.enabled") && fs.existsSync(fullPath)) {
        oldContent = fs.readFileSync(fullPath, "utf8");
      }

      // Check for file overwrite
      if (fs.existsSync(fullPath)) {
        const confirm = readline.keyInYN(`\n⚠️  ${operation.path} already exists. Overwrite?`);
        if (!confirm) {
          console.log(`⏭️  Skipped ${operation.path}`);
          return { success: false, path: operation.path };
        }
      }

      // Refinement Loop
      let finalContent = operation.content;
      if (shouldRefine(finalContent)) {
        console.log("🔄 Starting self-refinement loop...");
        this.logger.info("Starting code refinement", { path: operation.path });
        try {
          // Provide userInput as task, or fallback message
          const task = userInput || `Fix and write file ${operation.path}`;
          const refinement = await refineCode(
            task,
            finalContent,
            `File: ${operation.path}`,
            { maxIterations: 3, targetScore: 8, minImprovement: 1 }
          );
          console.log(formatRefinementResult(refinement));
          
          if (refinement.finalCode !== finalContent) {
            console.log("🔧 Applying refined improvements...");
            finalContent = refinement.finalCode;
            this.logger.info("Applied refined code", { path: operation.path, improvement: refinement.improvement });
          } else {
            console.log("✅ Code is already at target quality");
          }
        } catch (err) {
          console.log("⚠️  Refinement failed, keeping code");
          this.logger.warn("Refinement failed", { error: err.message });
        }
      }

      // Write file
      writeFile(operation.path, finalContent);
      console.log(`\n✅ Written: ${operation.path}`);

      // Record in memory
      if (this.config.get("memory.enabled") && oldContent && oldContent !== finalContent) {
        memory.autoRecordChange(operation.path, oldContent, finalContent, "Agent-applied fix");
      }

      return { success: true, path: operation.path };

    } catch (err) {
      this.logger.error("Write operation failed", { 
        path: operation.path, 
        error: err.message 
      });
      return { success: false, path: operation.path };
    }
  }

  /**
   * Handles raw code operations (fallback)
   */
  async _handleRawCodeOperation(operation, userInput, contextFile) {
    const filename = this.toolParser.extractFilename(userInput) || contextFile || "output.txt";
    
    const writeOp = {
      tool: "write_file",
      path: filename,
      content: operation.content
    };

    return this._handleWriteOperation(writeOp, filename, userInput);
  }

  /**
   * Builds retry prompt with file content
   */
  _buildRetryPrompt(originalRequest, fileContent) {
    return (
      `Original request: "${originalRequest}"\n\n` +
      `Here is the content of the file(s):\n\n${fileContent}\n\n` +
      `Now complete the original request. Do NOT use read_file again — ` +
      `use write_file to save changes, or chat to reply with suggestions.`
    );
  }

  /**
   * Builds system prompt with documentation
   */
  _buildSystemPrompt() {
    const base = `
You are an expert coding assistant with file operation capabilities.
You have memory of the entire conversation — use it to understand "that file", "add to it", "fix it", etc.

🚨 CRITICAL: ALWAYS use EXACT tool format - NO explanations, NO conversational text outside tool blocks!

TOOL FORMAT — respond using ONLY these blocks, nothing else:

Just talk to the user (suggestions, explanations, questions):
TOOL: chat
MESSAGE:
<your message here>
END_MESSAGE

List files:
TOOL: list_files

Run tests:
TOOL: run_tests
COMMAND: npm test

Read a file:
TOOL: read_file
PATH: filename.js

Write or create a file:
TOOL: write_file
PATH: filename.js
CONTENT:
<complete working code — no placeholders>
END_CONTENT

For tasks that involve multiple files, stack blocks one after another.

FILE TYPE CONVERSION EXAMPLE:
User: "change demojango.md to js type"
Agent should:
1. TOOL: read_file PATH: demojango.md
2. (After reading the content) TOOL: write_file PATH: demojango.js CONTENT: 
   // Actual converted JavaScript code here
   function add(x, y) { return x + y; }
   // ... rest of conversion
END_CONTENT

WARNING: NEVER use placeholders like "<complete working code>" in conversions!

CRITICAL RULES:
1. If the user says "check X" or "review X" or "tell me how to improve X" → read the file first, then respond with TOOL: chat listing your suggestions. Do NOT write the file unless the user says to.
2. If the user says "improve X", "fix X", "make it better" → read the file first, then write the improved version.
3. If the user says "change X to js/python/md/etc" or "convert X to [language]" or "change type of X" → 
   - First: read the original file to understand its content
   - Then: ACTUALLY CONVERT the code/content to the new language (Python → JavaScript, Markdown → HTML, etc.)
   - Finally: write the converted content to a NEW file with the correct extension
   - IMPORTANT: You must provide REAL converted code, not placeholders like "<complete working code>"
4. NEVER write a file without reading it first, unless it is a brand new file.
5. NEVER read files that were not mentioned. Only read files the user explicitly named.
6. Each file must appear ONCE only — never write the same file twice.
7. Always include 100% complete code in CONTENT — never truncate or use placeholders.
8. Do NOT add any text outside of tool blocks.
9. For file type conversions: ALWAYS change the file extension to match the new type (e.g., .md → .js, .py → .js, etc.).
`.trim();

    let enhanced = base;

    // Add README instructions
    const readmeContent = this._loadReadme();
    if (readmeContent) {
      enhanced += `\n\n─────────────────────────────────────────\nCUSTOM INSTRUCTIONS (README.md):\n${readmeContent}\n─────────────────────────────────────────`;
    }

    // Add agent documentation
    const agentDocsContent = this._loadAgentDocs();
    if (agentDocsContent) {
      enhanced += `\n\n─────────────────────────────────────────\nAGENT CAPABILITIES & TOOLS (docs/for-agent/AGENT_GUIDE.md):\n${agentDocsContent}\n─────────────────────────────────────────`;
    }

    return enhanced;
  }

  /**
   * Loads README content
   */
  _loadReadme() {
    try {
      const readmePath = path.join(process.cwd(), this.config.get("project.readmePath"));
      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, "utf8");
        this.logger.debug("Loaded README instructions");
        return content;
      }
    } catch (err) {
      this.logger.warn("Failed to load README", { error: err.message });
    }
    return null;
  }

  /**
   * Loads agent documentation
   */
  _loadAgentDocs() {
    try {
      const docsPath = path.join(process.cwd(), this.config.get("project.docsPath"));
      if (fs.existsSync(docsPath)) {
        const content = fs.readFileSync(docsPath, "utf8");
        this.logger.debug("Loaded agent documentation");
        return content;
      }
    } catch (err) {
      this.logger.warn("Failed to load agent docs", { error: err.message });
    }
    return null;
  }

  /**
   * Loads project context using scanner
   */
  _loadProjectContext() {
    try {
      this.projectMap = scanner.scanProject(scanner.PROJECT_ROOT, true);
      this.logger.info("Project context loaded", {
        fileCount: this.projectMap.files?.length || 0,
        recentlyModified: this.projectMap.recentlyModified?.length || 0
      });
    } catch (err) {
      this.logger.error("Failed to load project context", { error: err.message });
      this.projectMap = null;
    }
  }

  /**
   * Builds memory context for a file
   */
  _buildMemoryContext(file) {
    if (!this.config.get("memory.enabled") || !file) return "";

    try {
      const suggestions = memory.getContextSuggestions(file);
      if (suggestions.length === 0) return "";

      let context = "\n\n📚 RELEVANT PAST FIXES:\n";
      suggestions.forEach((s, i) => {
        context += `\n[${i + 1}] ${s.function} in ${s.file}:\n`;
        context += `    ${s.description}\n`;
        context += `    Tags: ${s.tags.join(', ')}\n`;
        if (s.diff) {
          context += `    Before: ${s.diff.before.substring(0, 100)}${s.diff.before.length > 100 ? '...' : ''}\n`;
          context += `    After: ${s.diff.after.substring(0, 100)}${s.diff.after.length > 100 ? '...' : ''}\n`;
        }
      });
      context += "\n";

      return context;
    } catch (err) {
      this.logger.error("Memory context error", { error: err.message, file });
      return "";
    }
  }

  /**
   * Adds conversation turn to history
   */
  _rememberTurn(role, content) {
    this.conversationHistory.push({ 
      role, 
      content, 
      timestamp: Date.now() 
    });

    // Trim history if over limit
    const maxHistory = this.config.get("conversation.maxHistory");
    if (this.conversationHistory.length > maxHistory) {
      this.conversationHistory.splice(0, this.conversationHistory.length - maxHistory);
    }

    this.logger.debug("Conversation turn remembered", { 
      role, 
      contentLength: content.length,
      historySize: this.conversationHistory.length 
    });
  }

  /**
   * Shows help information
   */
  _showHelp() {
    console.log(`
🤖 Local Agent Commands:
  help     - Show this help message
  memory   - Show memory statistics
  history  - Show conversation history
  scan     - Refresh project context
  exit     - Exit the agent

💬 Usage Tips:
  - "Create a file called hello.js" - Creates new files
  - "Read package.json" - Reads existing files
  - "Fix the bug in app.js" - Reads and fixes files
  - "Check index.html" - Reviews files and suggests improvements
  - "Make it better" - Improves the last worked-on file
    `);
  }

  /**
   * Shows memory statistics
   */
  _showMemoryStats() {
    if (!this.config.get("memory.enabled")) {
      console.log("\n📝 Memory is disabled in configuration\n");
      return;
    }

    try {
      const stats = memory.getStats();
      console.log(`
📝 Memory Statistics:
  Total entries: ${stats.totalEntries}
  Unique files: ${stats.uniqueFiles}
  Unique functions: ${stats.uniqueFunctions}
  Change types: ${Object.keys(stats.byType).join(', ')}
  Top tags: ${stats.topTags.map(t => `${t.tag}(${t.count})`).slice(0, 5).join(', ')}
      `);
    } catch (err) {
      this.logger.error("Failed to get memory stats", { error: err.message });
      console.log("\n❌ Failed to retrieve memory statistics\n");
    }
  }

  /**
   * Shows conversation history
   */
  _showHistory() {
    if (this.conversationHistory.length === 0) {
      console.log("\n📜 No conversation history yet\n");
      return;
    }

    console.log("\n📜 Conversation history:");
    console.log("─".repeat(40));
    this.conversationHistory.forEach((turn, i) => {
      const role = turn.role === "user" ? "You  " : "Agent";
      const preview = turn.content.length > 80 ? 
        turn.content.substring(0, 80) + "..." : turn.content;
      console.log(`[${String(i + 1).padStart(2)}] ${role}: ${preview}`);
    });
    console.log("─".repeat(40) + "\n");
  }

  /**
   * Handles scan command
   */
  _handleScanCommand() {
    console.log("\n🔄 Refreshing project context...");
    const confirm = readline.keyInYN("Perform full rescan? (recommended after major changes)");
    
    if (confirm) {
      this.projectMap = scanner.scanProject(scanner.PROJECT_ROOT, false);
    } else {
      const quickConfirm = readline.keyInYN("Perform quick refresh (changed files only)?");
      if (quickConfirm) {
        this.projectMap = scanner.quickRefresh();
      } else {
        console.log("Scan cancelled.");
        return;
      }
    }

    if (this.projectMap) {
      console.log(`✅ Project context updated (${this.projectMap.files?.length || 0} files)`);
      if (this.projectMap.recentlyModified?.length > 0) {
        console.log(`   🕐 ${this.projectMap.recentlyModified.length} recently modified`);
      }
    }
  }

  /**
   * Prompts user for continuation when actively working on a file
   */
  _promptForContinuation() {
    const followUp = readline.question("\n🔧 Keep working on this file? (y/n/solved): ").trim().toLowerCase();
    
    if (followUp === "n" || followUp === "no") {
      this.activeFile = null;
      console.log("✅ Switched to general mode\n");
    } else if (followUp === "solved" || this._isSolved(followUp)) {
      this.activeFile = null;
      console.log("🎉 Great! Marked as solved.\n");
    }
  }

  /**
   * Checks if user input is a file conversion request
   */
  _isConversionRequest(input) {
    const conversionPatterns = [
      /change.*to.*js|javascript/i,
      /convert.*to.*js|javascript/i,
      /change.*type.*to/i,
      /convert.*type.*to/i
    ];
    return conversionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Builds retry prompt specifically for file conversions
   */
  _buildConversionRetryPrompt(originalRequest, contextFile) {
    return (
      `Your previous conversion attempt failed or used placeholder content.\n\n` +
      `Original request: "${originalRequest}"\n\n` +
      `CRITICAL: You MUST:\n` +
      `1. Read the original file content first\n` +
      `2. ACTUALLY CONVERT the code to the target language\n` +
      `3. Write REAL converted code, NEVER placeholders like "<complete working code>"\n` +
      `4. Use the correct file extension for the new file\n\n` +
      `Example: If converting Python to JavaScript, convert:\n` +
      `def add(a, b): return a + b\n` +
      `To:\n` +
      `function add(a, b) { return a + b; }\n\n` +
      `Now complete the conversion properly.`
    );
  }

  /**
   * Checks if user indicates problem is solved
   */
  _isSolved(input) {
    return /\b(done|solved|fixed|good|great|perfect|ok|okay|looks good|all good|that'?s? (it|fine|good|correct|right)|no more|no issues?|works?( now)?|yeah)\b/i.test(input);
  }
}

// Start the agent if this file is run directly
if (require.main === module) {
  const agent = new Agent();
  agent.run().catch((err) => {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
  });
}

module.exports = Agent;
