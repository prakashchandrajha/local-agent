#!/usr/bin/env node

/**
 * Demonstration of the complete enhanced agent flow with Self-Refinement Loop:
 * Planner → Coder → Refinement Loop (Critic → Improve → Repeat) → Final Code
 */

const { planTask, needsPlanning, formatPlan } = require('./tools/simple_planner');
const { refineCode, shouldRefine, formatRefinementResult } = require('./tools/refiner');

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
        
        // Simulate what a basic coder might write that needs refinement
        const basicCode = `function calculateTotal(price, quantity, discount) {
  var total = price * quantity;
  if (discount == 0) {
    return total;
  }
  var final = total - discount;
  console.log("Calculated total: " + final);
  return final;
}`;
        
        console.log('📝 Coder writes:');
        console.log(basicCode);
        console.log(`\nShould refine: ${shouldRefine(basicCode)}`);
        
        // Step 3: Self-Refinement Loop
        if (shouldRefine(basicCode)) {
            console.log('\n🔄 Step 3: Self-Refinement Loop');
            const refinement = await refineCode(userRequest, basicCode, 'calculator.js');
            console.log(formatRefinementResult(refinement));
            
            if (refinement.finalCode !== basicCode) {
                console.log('\n✅ Final Improved Code:');
                console.log(refinement.finalCode);
                
                console.log('\n🎯 Result:');
                console.log('  • Planner broke down the task');
                console.log('  • Coder implemented basic version');
                console.log('  • Refinement loop improved quality');
                console.log(`  • Quality score improved from ${refinement.history[0].score}/10 to ${refinement.finalScore}/10`);
                console.log('  • Final code is production-ready!');
            }
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏆 This is why your agent now writes MUCH BETTER CODE!');
    console.log('   Think → Plan → Code → Critic → Improve → Repeat');
}

demonstrateCompleteFlow().catch(console.error);
