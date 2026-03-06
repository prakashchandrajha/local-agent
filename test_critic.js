#!/usr/bin/env node

/**
 * Test script to demonstrate the Critic Agent
 */

const { reviewCode, needsReview, formatReview } = require('./tools/critic');

async function testCritic() {
    console.log('🔍 Testing Critic Agent\n');
    
    // Test 1: Bad code that needs improvement
    const badCode = `function divide(a,b){
 return a/b
}`;
    
    console.log('📝 Testing bad code:');
    console.log(badCode);
    console.log(`\nNeeds review: ${needsReview(badCode)}\n`);
    
    console.log('🔍 Critic reviewing...');
    const review1 = await reviewCode('create divide function', badCode, 'calculator.js');
    console.log(formatReview(review1));
    
    if (review1.improved_code && review1.improved_code !== badCode) {
        console.log('\n✅ Improved code:');
        console.log(review1.improved_code);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Code with multiple issues
    const problematicCode = `function calculate(x, y) {
  var result = x + y;
  console.log("Result is: " + result);
  return result == 0 ? "zero" : result;
}`;
    
    console.log('📝 Testing problematic code:');
    console.log(problematicCode);
    console.log(`\nNeeds review: ${needsReview(problematicCode)}\n`);
    
    console.log('🔍 Critic reviewing...');
    const review2 = await reviewCode('create calculate function', problematicCode, 'utils.js');
    console.log(formatReview(review2));
    
    if (review2.improved_code && review2.improved_code !== problematicCode) {
        console.log('\n✅ Improved code:');
        console.log(review2.improved_code);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: Good code that should pass
    const goodCode = `function addNumbers(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both arguments must be numbers');
  }
  
  if (isNaN(a) || isNaN(b)) {
    throw new Error('Arguments cannot be NaN');
  }
  
  return a + b;
}`;
    
    console.log('📝 Testing good code:');
    console.log(goodCode);
    console.log(`\nNeeds review: ${needsReview(goodCode)}\n`);
    
    console.log('🔍 Critic reviewing...');
    const review3 = await reviewCode('create add function', goodCode, 'math.js');
    console.log(formatReview(review3));
}

testCritic().catch(console.error);
