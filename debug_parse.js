#!/usr/bin/env node

const content = `{
  "issues": [
    "Missing input validation",
    "Unhandled error cases",
    "Division by zero is not handled",
    "Null/undefined checks are missing",
    "Type checking is missing"
  ],
  "improved_code": "function divide(a, b){
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both inputs must be numbers');
  }

  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }

  return a / b;
}"
}`;

console.log('Content:', content);
console.log('\n--- Finding jsonStr ---');
let cleanContent = content.replace(/```(?:json)?\n?([\s\S]*?)```/g, '$1').trim();
console.log('Clean content:', cleanContent);

const jsonMatch = cleanContent.match(/\{[\s\S]*?"issues"[\s\S]*?"improved_code"[\s\S]*?\}/);
if (jsonMatch) {
    const jsonStr = jsonMatch[0];
    console.log('jsonStr:', jsonStr);

    console.log('\n--- Debugging newline issue ---');
    // Iterate through each character to find where parsing fails
    for (let i = 300; i < 360; i++) {
        const char = jsonStr[i];
        if (char) {
            const code = char.charCodeAt(0);
            let description = char;
            if (code === 10) description = '\\n';
            if (code === 13) description = '\\r';
            if (code === 32) description = ' ';
            if (code === 9) description = '\\t';
            console.log(`Position ${i}: charCode=${code} '${description}'`);
        }
    }
}
