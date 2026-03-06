#!/usr/bin/env node

const { reviewCode } = require('./tools/critic');

async function testCritic() {
    console.log('Testing critic directly...');
    
    const code = `function divide(a,b){
  return a/b
}`;
    
    try {
        const result = await reviewCode('create divide function', code, 'calculator.js');
        console.log('Critic raw output:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

testCritic().catch(console.error);
