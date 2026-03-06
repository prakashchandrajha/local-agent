#!/usr/bin/env node

const { planTask, needsPlanning, formatPlan } = require('./tools/simple_planner');
const { reviewCode, formatReview, needsReview } = require('./tools/critic');
const { refineCode, formatRefinementResult } = require('./tools/refiner');

async function testLargeTask() {
    console.log('🔄 Test 3: Large Task (Planner + Refinement)');
    console.log('='.repeat(60));
    
    const userRequest = "create an express server with one endpoint /add that validates numbers and returns sum";
    console.log(`📝 User Request: ${userRequest}`);
    
    // Step 1: Planning
    console.log('\n🧠 Step 1: Planning Phase');
    if (needsPlanning(userRequest)) {
        const plan = await planTask(userRequest, 'Express server project');
        console.log(formatPlan(plan));
    }
    
    // Step 2: Simulate initial implementation
    console.log('\n🚀 Step 2: Initial Implementation');
    const initialCode = `const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

app.post('/add', (req, res) => {
  const { a, b } = req.body;
  const sum = a + b;
  res.json({ sum });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});`;
    
    console.log('📝 Initial Code:');
    console.log(initialCode);
    
    // Step 3: Refinement
    console.log('\n🔄 Step 3: Refinement Loop');
    const refinement = await refineCode(userRequest, initialCode, 'server.js');
    console.log(formatRefinementResult(refinement));
    
    if (refinement.finalCode !== initialCode) {
        console.log('\n✅ Final Code:');
        console.log(refinement.finalCode);
        console.log(`\n📈 Quality: ${refinement.history[0].score}/10 → ${refinement.finalScore}/10`);
        console.log(`📊 Iterations: ${refinement.iterations}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test 3 Complete');
}

testLargeTask().catch(console.error);
