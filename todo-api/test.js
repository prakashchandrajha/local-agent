const request = require('supertest');
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
});