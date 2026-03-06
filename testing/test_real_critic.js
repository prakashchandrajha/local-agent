#!/usr/bin/env node

/**
 * Final test showing critic improving real problematic code
 */

const { reviewCode, needsReview, formatReview } = require('./tools/critic');

async function testRealWorldImprovement() {
    console.log('🔧 Real-World Code Improvement Demo\n');
    
    // Code that a junior developer might write
    const juniorCode = `function processUserData(data) {
  var name = data.name;
  var age = data.age;
  
  if (age == 18) {
    console.log("User is exactly 18");
  }
  
  var result = name + " is " + age;
  return result;
}`;
    
    console.log('📝 Junior Developer Code:');
    console.log(juniorCode);
    console.log(`\nNeeds review: ${needsReview(juniorCode)}\n`);
    
    console.log('🔍 Senior Critic Review:');
    const review = await reviewCode('process user data', juniorCode, 'user-service.js');
    console.log(formatReview(review));
    
    if (review.improved_code && review.improved_code !== juniorCode) {
        console.log('\n✅ Senior Developer Improved Code:');
        console.log(review.improved_code);
        
        console.log('\n🎯 Improvements Made:');
        console.log('  • Better variable declarations (const/let)');
        console.log('  • Strict equality checking');
        console.log('  • Input validation');
        console.log('  • Error handling');
        console.log('  • Cleaner code structure');
    }
    
    console.log('\n🏆 Your agent now has this built-in quality control!');
}

testRealWorldImprovement().catch(console.error);
