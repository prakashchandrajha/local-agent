"use strict";

const axios = require("axios");

/**
 * LLM Service - Handles communication with Ollama API
 * Provides retry logic and error handling for LLM interactions
 */
class LLMService {
  constructor(config, logger) {
    this.url = config.llm.url;
    this.model = config.llm.model;
    this.maxRetries = config.llm.maxRetries;
    this.logger = logger;
  }

  /**
   * Makes a request to the LLM with retry logic
   * @param {string} prompt - The user prompt
   * @param {string} systemPrompt - The system prompt
   * @returns {Promise<{raw: string, ops: Array}|null>} - Parsed response or null on failure
   */
  async callLLM(prompt, systemPrompt) {
    let lastResponse = null;
    let currentPrompt = prompt;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const fullPrompt = this._buildFullPrompt(systemPrompt, currentPrompt);
        
        const response = await axios.post(this.url, {
          model: this.model,
          prompt: fullPrompt,
          stream: false,
          options: { 
            temperature: 0.1, 
            max_tokens: 4000 
          },
        });

        const raw = response.data.response.trim();
        this.logger.debug(`LLM response attempt ${attempt}`, { 
          preview: raw.substring(0, 400) 
        });

        // Note: This will be handled by the tool parser
        // For now, return the raw response
        return { raw, ops: [] }; // ops will be parsed by tool parser

      } catch (err) {
        this.logger.error(`LLM error (attempt ${attempt})`, {
          error: err.message,
          url: this.url,
          model: this.model
        });
        
        if (attempt === this.maxRetries) {
          return null;
        }
      }
    }

    // If we have a last response but couldn't parse it, return it
    if (lastResponse) {
      return { raw: lastResponse, ops: [] };
    }

    return null;
  }

  /**
   * Builds the full prompt including system prompt and conversation history
   * @param {string} systemPrompt - The system prompt
   * @param {string} currentPrompt - The current user prompt
   * @param {Array} conversationHistory - Previous conversation turns
   * @returns {string} - The complete prompt
   */
  _buildFullPrompt(systemPrompt, currentPrompt, conversationHistory = []) {
    const historyText = this._formatHistory(conversationHistory);
    
    return (
      systemPrompt +
      historyText +
      `\n\nUser: ${currentPrompt}` +
      `\n\nAssistant (respond ONLY in tool format):`
    );
  }

  /**
   * Formats conversation history into a readable block
   * @param {Array} history - Conversation history
   * @returns {string} - Formatted history
   */
  _formatHistory(history) {
    if (history.length === 0) return "";
    
    const lines = history.map((t) => 
      `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`
    );
    
    return "\n\nCONVERSATION HISTORY (most recent at bottom):\n" + 
           lines.join("\n");
  }
}

module.exports = LLMService;
