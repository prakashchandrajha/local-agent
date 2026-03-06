#!/usr/bin/env node

const { refineCode, shouldRefine, formatRefinementResult } = require('./tools/refiner');

async function testBasicImprovement() {
    console.log('🔄 Test 1: Basic Code Quality Improvement');
    console.log('='.repeat(60));
    
    const testCode = `function addNumbers(a,b) {
  return a + b;
}`;
    
    console.log('📝 Initial Code:');
    console.log(testCode);
    
    const shouldRefineResult = shouldRefine(testCode);
    console.log(`Should refine: ${shouldRefineResult}`);
    
    if (shouldRefineResult) {
        const refinement = await refineCode('Create a function addNumbers(a,b)', testCode, 'math.js');
        console.log(formatRefinementResult(refinement));
        
        if (refinement.finalCode !== testCode) {
            console.log('\n✅ Final Code:');
            console.log(refinement.finalCode);
            console.log(`\n📈 Quality: ${refinement.history[0].score}/10 → ${refinement.finalScore}/10`);
            console.log(`📊 Iterations: ${refinement.iterations}`);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test 1 Complete');
}

testBasicImprovement().catch(console.error);
