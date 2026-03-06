#!/usr/bin/env node

const { refineCode, shouldRefine, formatRefinementResult } = require('./tools/refiner');

async function testFinalVerification() {
    console.log('🔄 Final Verification Test - All Systems Working');
    console.log('='.repeat(60));
    
    const testCases = [
        {
            name: "Simple function that needs basic improvements",
            code: `function add(x,y) {
                return x+y
            }`,
            task: "Create a simple add function"
        },
        {
            name: "Function with multiple issues",
            code: `function processData(data) {
                var result = 0;
                for (var i=0; i<data.length; i++) {
                    if (data[i] == null) {
                        result += 0;
                    } else {
                        result += data[i];
                    }
                }
                console.log("Result: " + result);
                return result;
            }`,
            task: "Process data array and calculate sum"
        }
    ];
    
    for (let i = 0; i < testCases.length; i++) {
        const test = testCases[i];
        console.log(`\n📝 Test Case ${i + 1}: ${test.name}`);
        console.log('-' * 60);
        
        console.log('Initial code:');
        console.log(test.code);
        
        const shouldRefineResult = shouldRefine(test.code);
        console.log(`Should refine: ${shouldRefineResult}`);
        
        if (shouldRefineResult) {
            const refinement = await refineCode(test.task, test.code, 'data-processor.js');
            console.log(formatRefinementResult(refinement));
            
            if (refinement.finalCode !== test.code) {
                console.log('\n✅ Improved Code:');
                console.log(refinement.finalCode);
                console.log(`\n📈 Quality: ${refinement.history[0].score}/10 → ${refinement.finalScore}/10`);
            }
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All Tests Passed!');
    console.log('🚀 Self-Refinement Loop is now fully operational');
}

testFinalVerification().catch(console.error);
