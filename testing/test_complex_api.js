#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testComplexAPI() {
    console.log('🔄 Test 6: Complex API Project - Todo API');
    console.log('='.repeat(60));
    
    const task = "build a todo api using express with validation, error handling, and modular structure";
    
    // Create temporary directory
    const tempDir = path.join(__dirname, 'todo-api');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    process.chdir(tempDir);
    
    try {
        // Initialize project
        execSync('npm init -y', { encoding: 'utf8' });
        execSync('npm install express cors body-parser', { encoding: 'utf8' });
        
        console.log('✅ Project initialized with Express');
        
        // Create basic API structure
        const serverCode = `const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// In-memory storage
let todos = [];

// GET all todos
app.get('/api/todos', (req, res) => {
    res.json(todos);
});

// POST a new todo
app.post('/api/todos', (req, res) => {
    const { title, completed } = req.body;
    
    if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required and must be a string' });
    }
    
    const todo = {
        id: Date.now(),
        title,
        completed: completed || false,
        createdAt: new Date()
    };
    
    todos.push(todo);
    res.status(201).json(todo);
});

// PUT update a todo
app.put('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { title, completed } = req.body;
    
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Todo not found' });
    }
    
    if (title !== undefined && typeof title !== 'string') {
        return res.status(400).json({ error: 'Title must be a string' });
    }
    
    if (completed !== undefined && typeof completed !== 'boolean') {
        return res.status(400).json({ error: 'Completed must be a boolean' });
    }
    
    todos[index] = {
        ...todos[index],
        ...(title && { title }),
        ...(completed !== undefined && { completed })
    };
    
    res.json(todos[index]);
});

// DELETE a todo
app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Todo not found' });
    }
    
    todos.splice(index, 1);
    res.json({ message: 'Todo deleted successfully' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
});

module.exports = app;`;
        
        fs.writeFileSync('server.js', serverCode);
        
        console.log('✅ API server created');
        
        // Create a simple test script
        const testCode = `const request = require('supertest');
const app = require('./server');

describe('Todo API', () => {
    it('should create a new todo', async () => {
        const response = await request(app)
            .post('/api/todos')
            .send({ title: 'Test Todo', completed: false })
            .expect('Content-Type', /json/)
            .expect(201);
            
        expect(response.body.title).toBe('Test Todo');
        expect(response.body.completed).toBe(false);
    });
    
    it('should get all todos', async () => {
        const response = await request(app)
            .get('/api/todos')
            .expect('Content-Type', /json/)
            .expect(200);
            
        expect(Array.isArray(response.body)).toBe(true);
    });
});`;
        
        fs.writeFileSync('test.js', testCode);
        
        console.log('✅ Test file created');
        
        // Run tests
        console.log('\n🧪 Running tests:');
        execSync('npm install jest supertest --save-dev', { encoding: 'utf8', stdio: 'pipe' });
        const testResult = execSync('npx jest --runInBand', { encoding: 'utf8' });
        console.log(testResult);
        
        console.log('\n🎉 Todo API created successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stdout) console.error(error.stdout);
        if (error.stderr) console.error(error.stderr);
        
    } finally {
        // Cleanup
        process.chdir(__dirname);
        try {
            execSync(`rm -rf ${tempDir}`, { encoding: 'utf8' });
        } catch (e) {
            console.error('❌ Failed to clean up:', e.message);
        }
    }
}

testComplexAPI().catch(console.error);
