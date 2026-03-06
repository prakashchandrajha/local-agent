"use strict";

const axios = require("axios");

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";
const TIMEOUT = 120000; // 2 minutes

/**
 * The single source of truth for interacting with the local model.
 * 
 * @param {string} prompt - The full combined prompt to send
 * @returns {Promise<string>} The raw text response from the model
 */
async function generateResponse(prompt) {
  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 4000,
      }
    }, { timeout: TIMEOUT });

    return response.data.response || "";
  } catch (err) {
    throw new Error(`Local LLM Error: ${err.message}`);
  }
}

/**
 * Simple ping to check if the LLM is awake.
 */
async function ping() {
  try {
    await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: "hi",
      stream: false,
      options: { num_predict: 5 }
    }, { timeout: TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  generateResponse,
  ping
};
