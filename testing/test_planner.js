#!/usr/bin/env node

/**
 * Test script to demonstrate the planner functionality
 */

const { planTask, needsPlanning, formatPlan } = require('./tools/simple_planner');

async function testPlanner() {
    console.log('🧠 Testing Planner Agent\n');
    
    // Test 1: Simple task (should not need planning)
    const simpleTask = 'read calculator.js';
    console.log(`Task: "${simpleTask}"`);
    console.log(`Needs planning: ${needsPlanning(simpleTask)}`);
    console.log('---\n');
    
    // Test 2: Complex task (should need planning)
    const complexTask = 'create express api with authentication';
    console.log(`Task: "${complexTask}"`);
    console.log(`Needs planning: ${needsPlanning(complexTask)}`);
    
    if (needsPlanning(complexTask)) {
        console.log('Generating plan...\n');
        const plan = await planTask(complexTask, 'Current project has calculator module');
        console.log(formatPlan(plan));
    }
    
    // Test 3: Another complex task
    console.log('\n---\n');
    const anotherTask = 'improve the calculator with error handling';
    console.log(`Task: "${anotherTask}"`);
    console.log(`Needs planning: ${needsPlanning(anotherTask)}`);
    
    if (needsPlanning(anotherTask)) {
        console.log('Generating plan...\n');
        const plan = await planTask(anotherTask, 'calculator.js has basic functions');
        console.log(formatPlan(plan));
    }
}

testPlanner().catch(console.error);
