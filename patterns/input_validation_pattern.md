# Input Validation Pattern

Input validation is a crucial step to ensure data integrity and security. Use robust validation before data reaches your business logic.

## 1. Schema-Based Validation
Use a validation library (like `Joi`, `Yup`, or `Zod`) to define clear schemas for incoming data.

```javascript
// validations/userValidation.js
const Joi = require('joi');

const userSchema = Joi.object({
  name: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(new RegExp('^[a-zA-Z0-9]{3,30}$')).required(),
  age: Joi.number().integer().min(18)
});

module.exports = {
  userSchema
};
```

## 2. Express Middleware for Validation
Create a reusable middleware function that takes a schema and validates the request body (or query/params).

```javascript
// middlewares/validate.js
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      // Map Joi errors to a clean format
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    // Replace req.body with validated and sanitized values
    req.body = value;
    next();
  };
};

module.exports = validate;
```

## 3. Usage inside Routes
Apply the validation middleware directly on your routes.

```javascript
const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { userSchema } = require('../validations/userValidation');
const userController = require('../controllers/userController');

// The controller is only called if validation passes
router.post('/register', validate(userSchema), userController.register);

module.exports = router;
```
