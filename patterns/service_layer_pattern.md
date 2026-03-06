# Service Layer Pattern

When implementing business logic for an application, use a Service Layer. This separates business rules from HTTP transport details (Controllers) and Database operations (Data Access Objects/Repositories).

## 1. Clean Service Methods
Service methods should accept raw data or plain objects, perform business validation, orchestrate database calls, and return results. They should throw Domain Errors (not HTTP errors).

```javascript
const userRepository = require('../repositories/userRepository');
const emailService = require('./emailService');
const { ValidationError, ConflictError } = require('../utils/errors');

class UserService {
  /**
   * Create a new user with required business rules
   * @param {Object} userData 
   * @returns {Object} Created user
   */
  async createUser(userData) {
    // 1. Business Validation
    const existingUser = await userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // 2. Data Transformation (e.g., hashing password)
    // Note: Hashing could also be a Mongoose pre-save hook depending on architecture
    const processedData = {
      ...userData,
      status: 'pending_verification'
    };

    // 3. Database Operation
    const newUser = await userRepository.create(processedData);

    // 4. Trigger Side Effects (e.g., send welcome email)
    // Don't wait for email to send if it's not critical
    emailService.sendWelcomeEmail(newUser.email).catch(console.error);

    return newUser;
  }
}

module.exports = new UserService();
```

## 2. Best Practices
1. **Never pass `req` or `res` objects into the service layer.** Services should know nothing about HTTP.
2. **Keep services stateless.** Store configuration in the constructor but do not store request-specific data as properties.
3. **Use simple data structures (DTOs).**
4. **Throw specific errors**, such as `NotFoundError` or `ConflictError`, which the global error handler or controller can map to HTTP status codes (404, 409).
