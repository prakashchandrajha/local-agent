"use strict";

const readline = require("readline-sync");
const config = require("../config/prompts");
const ollama = require("../llm/ollama");
const parser = require("../parsers/tool-parser");
const fileTools = require("../tools/file-tools");
const executeTool = require("../tools/run-code");

/**
 * The Agent Orchestrator.
 * It has exactly ONE job: Manage the Execution Loop.
 */
class AgentOrchestrator {
  constructor() {
    this.history = [];
  }

  async start() {
    const isAwake = await ollama.ping();
    if (!isAwake) {
      console.warn("⚠️  LLM might not be awake or Ollama is not running on 11434.");
    }

    console.log("🤖 Agent Ready. Type 'exit' to quit.");

    while (true) {
      const input = readline.question("\nYou: ").trim();
      if (!input) continue;
      if (input.toLowerCase() === "exit") break;

      await this.runExecutionLoop(input);
    }
  }

  /**
   * The Core Autonomous Coding Loop
   * Planner -> Tool -> Execution Feedback -> Refiner
   */
  async runExecutionLoop(userRequest) {
    this.history.push(`User: ${userRequest}`);
    
    let loopCount = 0;
    const maxLoops = 15; // Prevent infinite runaway

    while (loopCount < maxLoops) {
      loopCount++;
      
      const prompt = this.buildPrompt();
      console.log(`\n🧠 Thinking (Loop ${loopCount}/${maxLoops})...`);
      
      const response = await ollama.generateResponse(prompt);
      const tools = parser.parseToolBlocks(response);

      if (tools.length === 0) {
        console.log("🤖 Agent replied without tools:\n", response);
        this.history.push(`Assistant: ${response}`);
        break; // Stop loop if the agent just talks naturally
      }

      // Execute tools sequentially and feed results back into history immediately
      let toolOutputs = [];
      for (const t of tools) {
        const result = await this.executeTool(t);
        toolOutputs.push(result);
      }

      const combinedFeedback = toolOutputs.join("\n\n");
      this.history.push(`Assistant:\n${response}`);
      this.history.push(`System Tool Feedback:\n${combinedFeedback}`);

      // Check if the agent called "chat" as its final tool, which usually means it's done for the turn
      const hasChat = tools.some(t => t.tool === "chat");
      if (hasChat) {
        break;
      }
    }

    if (loopCount >= maxLoops) {
      console.log("⚠️ Agent reached maximum loops. Stopping for safety.");
    }
  }

  /**
   * Single Responsibility: Route tool objects to their execute functions.
   */
  async executeTool(t) {
    try {
      switch (t.tool) {
        case "chat":
          console.log(`\n💬 Agent: ${t.message || ""}\n`);
          return `Chat delivered: ${t.message || ""}`;

        case "read_file":
          console.log(`📖 Reading: ${t.path}`);
          const content = fileTools.readFileSync(t.path);
          return `[FILE: ${t.path}]\n${content}`;

        case "write_file":
          console.log(`✍️ Writing: ${t.path}`);
          const writeRes = fileTools.writeFileSync(t.path, t.content || "");
          return writeRes;

        case "run_code":
          console.log(`⚙️ Running: ${t.command}`);
          const runRes = await executeTool.runCode(t.command);
          if (runRes.success) {
             console.log(`✅ Success`);
          } else {
             console.log(`❌ Failed\n${runRes.output}`);
          }
          return `Execution Result for ${t.command}:\n${runRes.output}`;

        default:
          return `Error: Unknown tool ${t.tool}`;
      }
    } catch (err) {
      return `Error executing tool ${t.tool}: ${err.message}`;
    }
  }

  /**
   * Constructs the conversation history + system prompt
   */
  buildPrompt() {
    let p = config.SYSTEM_PROMPT + "\n\n=== CONVERSATION HISTORY ===\n";
    // Send the last 10 messages for context window safety
    const recentHistory = this.history.slice(-10);
    p += recentHistory.join("\n\n");
    p += "\n\nAssistant (respond ONLY in tool format):";
    return p;
  }
}

module.exports = AgentOrchestrator;
