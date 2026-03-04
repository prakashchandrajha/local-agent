const axios = require("axios");
const readline = require("readline-sync");
const { readFile, writeFile, listFiles } = require("./tools/file");

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b"; // main brain

const SYSTEM_PROMPT = `
You are a coding agent with access to file system tools.

When the user asks to list files, show directory contents, or see what files are present, you must respond EXACTLY with:

TOOL: list_files

When the user asks to read a file, view a file, or get file contents, you must respond EXACTLY with:

TOOL: read_file
PATH: file.js

When the user asks to write a file, create a file, or save content, you must respond EXACTLY with:

TOOL: write_file
PATH: file.js
CONTENT:
<full file content>

If the user asks to fix, debug, repair, correct, or says there is an error in a file, you MUST FIRST read the file using:

TOOL: read_file
PATH: filename_here

Respond ONLY with these exact tool formats when dealing with file operations. Do NOT mention terminal commands or external tools. If the user asks about file operations, ALWAYS use the available tools. Do NOT include any additional text or explanations.
`;

async function askLLM(prompt, customSystem = null) {
  const systemToUse = customSystem || SYSTEM_PROMPT;
  const response = await axios.post(OLLAMA_URL, {
    model: MODEL,
    prompt: systemToUse + "\nUser: " + prompt,
    stream: false
  });

  return response.data.response;
}

async function run() {
  while (true) {
    const userInput = readline.question("\nYou: ");

    if (userInput.toLowerCase() === "exit") break;

    // Check if this is a fix/debug intent
    const fixIntent = /fix|debug|repair|correct|error/i.test(userInput);

    const result = await askLLM(userInput);

    console.log("DEBUG: Raw LLM response:", result);

    if (result.includes("TOOL: list_files")) {
      const files = listFiles();
      console.log("\n📂 Files in current directory:\n", files);
    } else if (result.includes("TOOL: read_file")) {
      const pathMatch = result.match(/PATH:\s*(.*)/);
      if (pathMatch) {
        const filePath = pathMatch[1].trim();
        const fileContent = readFile(filePath);
        console.log("\n📄 File Content:\n", fileContent);

        // If fix intent, make second LLM call to analyze and fix
        if (fixIntent) {
          console.log("\n🔧 Analyzing file for errors...");
          const fixPrompt = `Fix the error in this file.

File: ${filePath}
Current Content:
${fileContent}

Provide the corrected code. Use this exact format:
TOOL: write_file
PATH: ${filePath}
CONTENT:
${fileContent}`;

          // Use simpler system for fix
          const fixSystem = `You are a code fixer. When given code with errors, respond ONLY with the corrected code in this exact format:
TOOL: write_file
PATH: filename.js
CONTENT:
<corrected code>

Do NOT explain the errors. Just output the fixed code.`;

          const fixResult = await askLLM(fixPrompt, fixSystem);
          console.log("DEBUG: Fix LLM response:", fixResult);

          if (fixResult.includes("TOOL: write_file")) {
            const fixPathMatch = fixResult.match(/PATH:\s*(.*)/);
            const fixContentMatch = fixResult.split("CONTENT:")[1];

            if (fixPathMatch && fixContentMatch) {
              const fixedFilePath = fixPathMatch[1].trim();
              let fixedContent = fixContentMatch.trim();
              
              // Remove markdown code fences if present
              // Handle ```javascript or ``` at start and end
              const lines = fixedContent.split('\n');
              if (lines[0].match(/^```\w*$/)) {
                lines.shift(); // Remove first line with ```
              }
              if (lines.length > 0 && lines[lines.length - 1].match(/^```$/)) {
                lines.pop(); // Remove last line with ```
              }
              fixedContent = lines.join('\n').trim();
              
              const status = writeFile(fixedFilePath, fixedContent);
              console.log("\n✅ File fixed!\n", status);
            }
          }
        }
      }
    } else if (result.includes("TOOL: write_file")) {
      console.log("DEBUG: Detected write_file tool");
      const pathMatch = result.match(/PATH:\s*(.*)/);
      const contentMatch = result.split("CONTENT:")[1];

      console.log("DEBUG: pathMatch:", pathMatch);
      console.log("DEBUG: contentMatch:", contentMatch);

      if (pathMatch && contentMatch) {
        const filePath = pathMatch[1].trim();
        const content = contentMatch.trim();
        console.log("DEBUG: filePath:", filePath);
        console.log("DEBUG: content:", content);
        const status = writeFile(filePath, content);
        console.log("\n", status);
      }
    } else {
      console.log("\nAgent:\n", result);
    }
  }
}

run();