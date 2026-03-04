const axios = require("axios");
const readline = require("readline-sync");
const { readFile, writeFile } = require("./tools/file");

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen3:8b"; // main brain

const SYSTEM_PROMPT = `
You are a coding agent.

If the user asks to:
- read a file
- create a file
- modify code

Respond ONLY in one of these formats.

For reading a file:

TOOL: read_file
PATH: path/to/file.js

For writing a file:

TOOL: write_file
PATH: path/to/file.js
CONTENT:
<full file content here>

If no tool is needed, answer normally.
`;

async function askLLM(prompt) {
  const response = await axios.post(OLLAMA_URL, {
    model: MODEL,
    prompt: SYSTEM_PROMPT + "\nUser: " + prompt,
    stream: false
  });

  return response.data.response;
}

async function run() {
  while (true) {
    const userInput = readline.question("\nYou: ");

    if (userInput.toLowerCase() === "exit") break;

    const result = await askLLM(userInput);

    if (result.includes("TOOL: read_file")) {
      const pathMatch = result.match(/PATH:\s*(.*)/);
      if (pathMatch) {
        const filePath = pathMatch[1].trim();
        const fileContent = readFile(filePath);
        console.log("\n📄 File Content:\n", fileContent);
      }
    } else if (result.includes("TOOL: write_file")) {
      const pathMatch = result.match(/PATH:\s*(.*)/);
      const contentMatch = result.split("CONTENT:")[1];

      if (pathMatch && contentMatch) {
        const filePath = pathMatch[1].trim();
        const content = contentMatch.trim();
        const status = writeFile(filePath, content);
        console.log("\n", status);
      }
    } else {
      console.log("\nAgent:\n", result);
    }
  }
}

run();