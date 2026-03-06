#!/usr/bin/env node

const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🎯 Agent Demo');
console.log('='.repeat(60));
console.log('This demo will show you the agent working with different levels of complexity');
console.log('='.repeat(60));

const questions = [
  {
    text: "Create a simple add function with validation",
    test: "test_basic_improvement_force.js",
    description: "Basic code with validation"
  },
  {
    text: "Fix a buggy divide function",
    test: "test_bug_fixing.js",
    description: "Bug fixing test"
  },
  {
    text: "Create an Express server with validation",
    test: "test_large_task.js",
    description: "Large task planning"
  },
  {
    text: "Improve math.js while keeping index.js working",
    test: "test_project_awareness.js",
    description: "Project awareness"
  },
  {
    text: "Create a divide function using memory",
    test: "test_memory_application.js",
    description: "Memory retrieval"
  }
];

function runTest(index) {
  if (index >= questions.length) {
    console.log('\n🎉 All demos completed!');
    rl.close();
    return;
  }

  const question = questions[index];
  
  console.log(`\n📚 Demo ${index + 1}: ${question.description}`);
  console.log(`🎯 Prompt: "${question.text}"`);
  console.log('-' . repeat(60));
  
  try {
    // Run the test
    const output = execSync(`node ${question.test}`, { encoding: 'utf8' });
    console.log(output);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
  
  rl.question('Press Enter to continue to next demo...', () => runTest(index + 1));
}

rl.question('Press Enter to start the demo...', () => runTest(0));
