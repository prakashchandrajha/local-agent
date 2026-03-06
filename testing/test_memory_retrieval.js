#!/usr/bin/env node

const memory = require('./tools/memory');

async function testMemoryRetrieval() {
    console.log('🔄 Test 5: Memory Retrieval');
    console.log('='.repeat(60));
    
    // Check current memory
    const allEntries = memory.loadMemory();
    console.log(`📊 Total memory entries: ${allEntries.length}`);
    
    // Look for existing divide function fixes
    const divideEntries = allEntries.filter(entry => 
        entry.function?.toLowerCase().includes('divide') ||
        entry.description?.toLowerCase().includes('divide') ||
        entry.diff?.before?.includes('divide') ||
        entry.diff?.after?.includes('divide')
    );
    
    console.log(`🔍 Divide function fixes: ${divideEntries.length}`);
    
    if (divideEntries.length > 0) {
        console.log('\n📝 Found existing divide function memories:');
        divideEntries.forEach((entry, index) => {
            console.log(`\n   ${index + 1}. ${entry.function || 'Unknown function'} (${entry.change_type})`);
            if (entry.description) {
                console.log(`      ${entry.description}`);
            }
        });
    } else {
        console.log('\n⚠️  No existing divide function memories found');
    }
    
    // Test memory retrieval
    console.log('\n🧠 Testing memory retrieval:');
    const suggestions = memory.getContextSuggestions('calculator.js');
    console.log(`   Suggestions for calculator.js: ${suggestions.length}`);
    
    if (suggestions.length > 0) {
        console.log('\n   Relevant context suggestions:');
        suggestions.forEach((suggestion, index) => {
            console.log(`\n      ${index + 1}. ${suggestion.function || 'Unknown function'}`);
            if (suggestion.description) {
                console.log(`         ${suggestion.description}`);
            }
        });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test 5 Complete');
}

testMemoryRetrieval().catch(console.error);
