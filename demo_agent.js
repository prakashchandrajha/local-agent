#!/usr/bin/env node

/**
 * Quick demo of the enhanced agent with planner
 */

// Simulate what the agent does now
const { planTask, needsPlanning, formatPlan } = require('./tools/simple_planner');

async function demonstrateAgent() {
    console.log('🤖 Enhanced Agent Demo\n');
    console.log('User asks: "make calculator better with validation"\n');
    
    // Step 1: Agent checks if planning is needed
    const task = 'make calculator better with validation';
    console.log('🧠 Agent: Checking if planning needed...');
    console.log(`Needs planning: ${needsPlanning(task)}\n`);
    
    if (needsPlanning(task)) {
        // Step 2: Agent generates plan
        console.log('📋 Agent: Generating plan...');
        const plan = await planTask(task, 'calculator.js has add, subtract, divide functions');
        console.log(formatPlan(plan));
        
        // Step 3: Agent executes steps (simulated)
        console.log('🚀 Agent: Executing plan steps...\n');
        
        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            console.log(`--- Step ${i + 1}: ${step} ---`);
            
            // Simulate what the agent would do for each step
            if (step.includes('validation')) {
                console.log('✅ Added input validation to all functions');
                console.log('✅ Added proper error messages');
            } else if (step.includes('error')) {
                console.log('✅ Enhanced error handling');
            } else if (step.includes('types')) {
                console.log('✅ Added type checking');
            }
            
            // Small delay to show step-by-step execution
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('\n✅ Plan execution completed!');
        console.log('🎯 Result: Calculator is now more robust with validation!');
    }
}

demonstrateAgent().catch(console.error);
