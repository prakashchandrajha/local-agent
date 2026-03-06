const express = require('express');
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
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;