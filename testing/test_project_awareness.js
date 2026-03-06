#!/usr/bin/env node

const fs = require('fs');
const { planTask, needsPlanning, formatPlan } = require('./tools/simple_planner');
const { reviewCode, formatReview, needsReview } = require('./tools/critic');
const { refineCode, formatRefinementResult } = require('./tools/refiner');

async function testProjectAwareness() {
    console.log('🔄 Test 4: Project Awareness');
    console.log('='.repeat(60));
    
    // Check initial state
    console.log('📁 Project Files:');
    const mathContent = fs.readFileSync('./math.js', 'utf8');
    console.log('math.js:');
    console.log(mathContent);
    const indexContent = fs.readFileSync('./index.js', 'utf8');
    console.log('index.js:');
    console.log(indexContent);
    
    // Current functionality
    console.log('\n🚀 Current Functionality:');
    const { execSync } = require('child_process');
    const result = execSync('node index.js').toString().trim();
    console.log(`node index.js = ${result}`);
    
    // Request improvement
    console.log('\n🎯 Request: Improve math.js and make sure index.js still works');
    
    // First, review math.js
    console.log('\n🔍 Code Review (math.js):');
    const review = await reviewCode('Improve math.js and make sure index.js still works', mathContent, 'math.js');
    console.log(formatReview(review));
    
    // Now refine math.js
    console.log('\n🔄 Refinement Loop:');
    const refinement = await refineCode('Improve math.js and make sure index.js still works', mathContent, 'math.js');
    console.log(formatRefinementResult(refinement));
    
    // Test the new code
    if (refinement.finalCode !== mathContent) {
        console.log('\n✅ Applying Changes to math.js');
        fs.writeFileSync('./math.js', refinement.finalCode);
        
        // Test if index.js still works
        console.log('\n🚀 Testing Updated Functionality:');
        const newResult = execSync('node index.js').toString().trim();
        console.log(`node index.js = ${newResult}`);
        
        if (newResult === result) {
            console.log('✅ Success: index.js still works');
        } else {
            console.log('❌ Error: index.js functionality changed');
            // Revert to original
            fs.writeFileSync('./math.js', mathContent);
        }
        
        console.log('\n📈 Quality:');
        console.log(`Before: ${review.issues ? review.issues.length : 0} issues`);
        console.log(`After: ${refinement.finalCode === mathContent ? 'Unchanged' : 'Improved'}`);
    } else {
        console.log('\n✅ No Changes Needed');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test 4 Complete');
}

testProjectAwareness().catch(async error => {
    console.error('❌ Error:', error);
    // Revert to original math.js
    const originalContent = `function add(a,b){
 return a+b
}
module.exports = add`;
    require('fs').writeFileSync('./math.js', originalContent);
});
