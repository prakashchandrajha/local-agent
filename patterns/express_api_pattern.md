# Express API Pattern

When generating or refactoring an Express API route, controller, or service, use the following architectural pattern to ensure clean separation of concerns, error handling, and maintainability.

## 1. Controller Layer
The controller handles the HTTP request, invokes the service layer, and handles the HTTP response. It does NOT contain business logic.

```javascript
const userService = require('../services/userService');

exports.createUser = async (req, res, next) => {
  try {
    // 1. Extract validated data
    const userData = req.body;
    
    // 2. Call service layer
    const newUser = await userService.createUser(userData);
    
    // 3. Send response
    res.status(201).json({
      success: true,
      data: newUser
    });
  } catch (error) {
    // 4. Pass errors to global error handler
    next(error);
  }
};
```

## 2. Route Layer
The router ties the HTTP path, middleware (authentication, validation), and the controller function together. No logic here.

```javascript
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const validate = require('../middlewares/validate');
const { userSchema } = require('../validations/userValidation');

router.post(
  '/',
  validate(userSchema),
  userController.createUser
);

module.exports = router;
```

## 3. Global Error Handler
Express applications should have a centralized global error handler middleware.

```javascript
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    message: message
  });
};

module.exports = errorHandler;
```
