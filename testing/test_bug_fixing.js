#!/usr/bin/env node

const fs = require('fs');
const { refineCode, formatRefinementResult } = require('./tools/refiner');

async function testBugFixing() {
    console.log('🔄 Test 2: Bug Fixing');
    console.log('='.repeat(60));
    
    // Read the buggy code from file
    const buggyCode = fs.readFileSync('./bug.js', 'utf8');
    console.log('📝 Buggy Code:');
    console.log(buggyCode);
    
    // Refine the code
    const refinement = await refineCode('Fix bug.js make it production ready', buggyCode, 'bug.js');
    console.log(formatRefinementResult(refinement));
    
    if (refinement.finalCode !== buggyCode) {
        console.log('\n✅ Fixed Code:');
        console.log(refinement.finalCode);
        console.log(`\n📈 Quality: ${refinement.history[0].score}/10 → ${refinement.finalScore}/10`);
        console.log(`📊 Iterations: ${refinement.iterations}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test 2 Complete');
}

testBugFixing().catch(console.error);
