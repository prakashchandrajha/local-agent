#!/usr/bin/env node

const { execSync } = require('child_process');

const tests = [
  { name: 'Basic Code Quality', file: 'test_basic_improvement_force.js' },
  { name: 'Bug Fixing', file: 'test_bug_fixing.js' },
  { name: 'Large Task (Express Server)', file: 'test_large_task.js' },
  { name: 'Project Awareness', file: 'test_project_awareness.js' },
  { name: 'Memory Retrieval', file: 'test_memory_application.js' }
];

console.log('🎯 Running all tests...');
console.log('=' . repeat(60));

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  try {
    console.log(`\n🔍 Test ${index + 1}: ${test.name}`);
    console.log('-'.repeat(60));
    
    const result = execSync(`node ${test.file}`, { encoding: 'utf8', stdio: 'pipe' });
    
    // Check if test passed
    if (result.includes('✅') && !result.includes('❌')) {
      passed++;
      console.log('✅ PASS');
    } else {
      failed++;
      console.log('❌ FAIL');
      console.log(result);
    }
    
  } catch (error) {
    failed++;
    console.log('❌ FAIL');
    console.log(error.stdout || error.stderr || error.message);
  }
});

console.log('\n' + '=' . repeat(60));
console.log(`📊 Results: ${passed} PASS, ${failed} FAIL`);

if (failed === 0) {
  console.log('\n🎉 All tests passed!');
} else {
  console.log(`\n⚠️  ${failed} test(s) failed`);
}
