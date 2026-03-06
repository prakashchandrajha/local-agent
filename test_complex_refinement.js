#!/usr/bin/env node

/**
 * Test with more complex code that will trigger refinement
 */

const { refineCode, shouldRefine, formatRefinementResult } = require('./tools/refiner');

async function testComplexRefinement() {
    console.log('🔄 Testing Self-Refinement with Complex Code\n');
    
    // More complex code that definitely needs refinement
    const complexCode = `function calculateUserScore(userData) {
  var score = 0;
  var name = userData.name;
  var age = userData.age;
  
  if (age == 18) {
    score = score + 10;
  }
  
  if (name == "admin") {
    score = score + 50;
  }
  
  var result = name + " score is " + score;
  console.log("Calculated: " + result);
  return result;
}`;
    
    console.log('📝 Complex Code (Needs Refinement):');
    console.log(complexCode);
    console.log(`\nShould refine: ${shouldRefine(complexCode)}\n`);
    
    console.log('🚀 Starting refinement process...');
    const refinement = await refineCode(
        'create user score calculation function',
        complexCode,
        'user-service.js',
        {
            maxIterations: 3,
            targetScore: 8,
            minImprovement: 1
        }
    );
    
    console.log(formatRefinementResult(refinement));
    
    if (refinement.finalCode !== complexCode) {
        console.log('\n✨ Final Refined Code:');
        console.log(refinement.finalCode);
        
        console.log('\n🎯 Expected Improvements:');
        console.log('   • Use const/let instead of var');
        console.log('   • Use strict equality (===)');
        console.log('   • Add input validation');
        console.log('   • Better variable names');
        console.log('   • Remove console.log');
        console.log('   • Add error handling');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏆 This shows how refinement transforms basic code');
    console.log('   into production-quality code through iterations!');
}

testComplexRefinement().catch(console.error);
