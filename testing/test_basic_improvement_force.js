#!/usr/bin/env node

const { refineCode, formatRefinementResult } = require('./tools/refiner');
const { reviewCode } = require('./tools/critic');

async function testBasicImprovementForce() {
    console.log('🔄 Test 1: Basic Code Quality Improvement (Force Refinement)');
    console.log('='.repeat(60));
    
    const testCode = `function addNumbers(a,b) {
  return a + b;
}`;
    
    console.log('📝 Initial Code:');
    console.log(testCode);
    
    // Force refinement by directly calling refineCode without shouldRefine check
    console.log('\n🔄 Starting refinement process (forced):');
    const refinement = await refineCode('Create a function addNumbers(a,b)', testCode, 'math.js', {
        maxIterations: 3,
        targetScore: 8,
        minImprovement: 1
    });
    
    console.log(formatRefinementResult(refinement));
    
    if (refinement.finalCode !== testCode) {
        console.log('\n✅ Final Code:');
        console.log(refinement.finalCode);
        console.log(`\n📈 Quality: ${refinement.history[0].score}/10 → ${refinement.finalScore}/10`);
        console.log(`📊 Iterations: ${refinement.iterations}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test 1 Complete');
}

testBasicImprovementForce().catch(console.error);
