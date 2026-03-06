#!/usr/bin/env node

/**
 * Demonstration of the complete enhanced agent flow:
 * Planner → Coder → Critic → Improved Code
 */

const { planTask, needsPlanning, formatPlan } = require('./tools/simple_planner');
const { reviewCode, needsReview, formatReview } = require('./tools/critic');

async function demonstrateCompleteFlow() {
    console.log('🤖 Complete Enhanced Agent Flow Demo\n');
    
    const userRequest = "create a safe divide function";
    console.log(`👤 User: "${userRequest}"\n`);
    
    // Step 1: Check if planning is needed
    console.log('🧠 Step 1: Planning Phase');
    console.log(`Needs planning: ${needsPlanning(userRequest)}`);
    
    if (needsPlanning(userRequest)) {
        console.log('Generating plan...\n');
        const plan = await planTask(userRequest, 'calculator.js module');
        console.log(formatPlan(plan));
        
        // Simulate executing the first step
        const firstStep = plan.steps[0] || userRequest;
        console.log(`\n🚀 Step 2: Coder executes: "${firstStep}"`);
        
        // Simulate what a basic coder might write
        const basicCode = `function divide(a, b) {
  return a / b;
}`;
        
        console.log('📝 Coder writes:');
        console.log(basicCode);
        console.log(`\nNeeds review: ${needsReview(basicCode)}`);
        
        // Step 3: Critic review
        if (needsReview(basicCode)) {
            console.log('\n🔍 Step 3: Critic Review');
            const review = await reviewCode(userRequest, basicCode, 'calculator.js');
            console.log(formatReview(review));
            
            if (review.improved_code && review.improved_code !== basicCode) {
                console.log('\n✅ Final Improved Code:');
                console.log(review.improved_code);
                
                console.log('\n🎯 Result:');
                console.log('  • Planner broke down the task');
                console.log('  • Coder implemented basic version');
                console.log('  • Critic identified issues and improved');
                console.log('  • Final code is production-ready!');
            }
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏆 This is why your agent now writes MUCH BETTER CODE!');
    console.log('   Think → Plan → Code → Review → Improve');
}

demonstrateCompleteFlow().catch(console.error);
