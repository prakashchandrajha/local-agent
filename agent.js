const axios = require("axios");
const readline = require("readline-sync");
const { readFile, writeFile, listFiles } = require("./tools/file");

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b"; // main brain

// Extract filename from user request
function extractFilename(userInput) {
  // Match patterns like "create X.js", "make file Y.py", "write Z.ts"
  const patterns = [
    /(?:create|make|write|save)\s+(\w+\.\w+)/i,
    /(?:file|filename)\s+(?:called\s+)?(\w+\.\w+)/i,
    /(\w+\.\w+)\s+file/i
  ];
  
  for (const pattern of patterns) {
    const match = userInput.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Clean markdown code fences from content
function cleanCodeFences(content) {
  const lines = content.split('\n');
  
  // Remove opening fence (```javascript or ```)
  if (lines.length > 0 && lines[0].match(/^```\w*$/)) {
    lines.shift();
  }
  
  // Remove closing fence (```)
  if (lines.length > 0 && lines[lines.length - 1].match(/^```$/)) {
    lines.pop();
  }
  
  return lines.join('\n').trim();
}

// Extract path from LLM response - improved regex
function extractPath(response) {
  const match = response.match(/PATH:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

// Extract content from LLM response
function extractContent(response) {
  const parts = response.split(/CONTENT:/i);
  if (parts.length < 2) return null;
  return parts.slice(1).join('CONTENT:').trim();
}

// Try to detect and extract code from response without TOOL prefix
function tryExtractCode(response, userInput) {
  // Check for markdown code blocks
  const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const filename = extractFilename(userInput);
    if (filename) {
      return {
        path: filename,
        content: cleanCodeFences(codeBlockMatch[1])
      };
    }
  }
  
  // Check if response looks like code (starts with common patterns)
  const codePatterns = [
    /^const\s+\w+/m,
    /^function\s+\w+/m,
    /^let\s+\w+/m,
    /^var\s+\w+/m,
    /^import\s+/m,
    /^export\s+/m,
    /^class\s+\w+/m
  ];
  
  for (const pattern of codePatterns) {
    if (pattern.test(response)) {
      const filename = extractFilename(userInput);
      if (filename) {
        return {
          path: filename,
          content: cleanCodeFences(response)
        };
      }
    }
  }
  
  return null;
}

const SYSTEM_PROMPT = `
You are a coding assistant that helps with file operations. You MUST help with ANY coding task the user asks for.

When the user asks to list files, show directory contents, or see what files are present, you MUST respond EXACTLY with:

TOOL: list_files

When the user asks to read a file, view a file, or get file contents, you MUST respond EXACTLY with:

TOOL: read_file
PATH: file.js

When the user asks to write a file, create a file, or save content (like creating a calculator, game, script, etc), you MUST respond EXACTLY with:

TOOL: write_file
PATH: filename.js
CONTENT:
<complete code for the file - include ALL the code, no placeholders>

CRITICAL: You MUST output the actual code. Do NOT refuse, do NOT say you're not equipped, do NOT give explanations. Just output the TOOL format with the actual code.

If the user asks to fix, debug, repair, correct, or says there is an error in a file, you MUST FIRST read the file using:

TOOL: read_file
PATH: filename_here

Do NOT add any explanations, greetings, or text outside the TOOL format. ONLY output the tool call.
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
      const pathMatch = result.match(/PATH:\s*([^\n]+)/);
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
            const fixPath = extractPath(fixResult);
            const fixContent = extractContent(fixResult);

            if (fixPath && fixContent) {
              const fixedFilePath = fixPath;
              const fixedContent = cleanCodeFences(fixContent);
              
              const status = writeFile(fixedFilePath, fixedContent);
              console.log("\n✅ File fixed!\n", status);
            }
          }
        }
      }
    } else if (result.includes("TOOL: write_file")) {
      const filePath = extractPath(result);
      let content = extractContent(result);

      if (filePath && content) {
        content = cleanCodeFences(content);
        const status = writeFile(filePath, content);
        console.log("\n✅ File written!", status);
      }
    } else {
      // Try fallback: extract code from direct response
      console.log("DEBUG: No TOOL prefix found, trying fallback...");
      const extracted = tryExtractCode(result, userInput);
      
      if (extracted) {
        console.log("DEBUG: Extracted code from response");
        console.log("DEBUG: filePath:", extracted.path);
        const status = writeFile(extracted.path, extracted.content);
        console.log("\n✅ File written via fallback!", status);
      } else {
        console.log("\nAgent:\n", result);
      }
    }
  }
}

run();