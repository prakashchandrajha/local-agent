#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { refineCode, formatRefinementResult } = require('./tools/refiner');
const memory = require('./tools/memory');

async function testMemoryApplication() {
    console.log('🔄 Test 5: Memory Retrieval and Application');
    console.log('='.repeat(60));
    
    // First, let's see what memory knows about divide functions
    const divideMemories = memory.loadMemory().filter(entry => 
        entry.function?.toLowerCase().includes('divide') ||
        entry.description?.toLowerCase().includes('divide')
    );
    
    console.log(`📚 Existing divide function memories: ${divideMemories.length}`);
    divideMemories.forEach((entry, index) => {
        console.log(`\n${index + 1}. ${entry.function} (${entry.change_type})`);
        if (entry.diff) {
            console.log(`   Before: ${entry.diff.before.substring(0, 50)}...`);
            console.log(`   After: ${entry.diff.after.substring(0, 50)}...`);
        }
    });
    
    // Now simulate asking the agent to create a divide function
    console.log('\n🎯 Agent request: "create divide function"');
    
    // Create a temporary test file
    const testFile = path.join(__dirname, 'test_divide.js');
    const initialCode = `function divide(a,b){
    return a / b;
}`;
    
    fs.writeFileSync(testFile, initialCode);
    
    try {
        // Run the refinement process
        const refinement = await refineCode('create divide function', initialCode, testFile);
        
        console.log('\n🔄 Refinement results:');
        console.log(formatRefinementResult(refinement));
        
        // Check if the final code has the division by zero check
        const hasDivisionCheck = refinement.finalCode.includes('divide by zero');
        const hasTypeCheck = refinement.finalCode.includes('typeof');
        
        console.log(`\n✅ Division by zero check: ${hasDivisionCheck}`);
        console.log(`✅ Type validation: ${hasTypeCheck}`);
        
        if (hasDivisionCheck) {
            console.log('\n🎯 Success! Agent automatically applied memory fix');
        }
        
        console.log('\n📝 Final code:');
        console.log(refinement.finalCode);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test 5 Complete');
}

testMemoryApplication().catch(console.error);
