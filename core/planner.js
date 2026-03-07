"use strict";

// ─────────────────────────────────────────────────────────────
// TASK PLANNER
// Decomposes complex requests into ordered, focused steps.
// Local LLMs handle small focused tasks 10x better than one
// giant prompt. Complex = multi-file, architecture, frameworks.
// ─────────────────────────────────────────────────────────────

// Keywords that signal a complex, multi-step task
const COMPLEX_SIGNALS = [
  "oauth", "oauth2", "authentication", "jwt", "auth",
  "rest api", "rest server", "crud", "full stack",
  "spring boot", "fastapi", "express server", "graphql",
  "docker", "microservice", "websocket", "socket.io",
  "database", "migration", "schema", "prisma", "sequelize",
  "middleware", "interceptor", "guard", "filter",
  "implement", "build", "create", "scaffold", "setup", "full",
  "complete", "entire", "whole", "from scratch",
];

// Maps known task types to their canonical step plans
const TASK_BLUEPRINTS = {
  oauth2_node: {
    label: "OAuth2 / JWT Auth (Node.js)",
    match: (q) => /(oauth|jwt|auth)/i.test(q) && /(node|express|js)/i.test(q),
    files: ["jwt.js", "user-model.js", "auth-service.js", "auth-middleware.js", "auth-routes.js", "app.js"],
    steps: [
      { id: 1, title: "Create JWT utility",         focus: "Create a jwt.js utility with sign, verify, and refresh token functions using the jsonwebtoken package." },
      { id: 2, title: "Create User model",           focus: "Create a user model/schema with fields: id, email, passwordHash, role, refreshToken, createdAt." },
      { id: 3, title: "Create auth service",         focus: "Create auth-service.js with register, login, logout, and refreshToken business logic. Hash passwords with bcrypt." },
      { id: 4, title: "Create auth middleware",      focus: "Create auth-middleware.js that validates Bearer JWT tokens on protected routes. Attach user to req.user." },
      { id: 5, title: "Create auth routes",          focus: "Create auth-routes.js with POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/logout endpoints." },
      { id: 6, title: "Wire into main app",          focus: "Update or create app.js to import and use auth routes and middleware. Add error handler." },
    ],
  },

  oauth2_spring: {
    label: "OAuth2 / Spring Security (Spring Boot)",
    match: (q) => /(oauth|jwt|auth|spring security)/i.test(q) && /(spring|java|boot)/i.test(q),
    files: ["SecurityConfig.java", "JwtUtil.java", "CustomUserDetailsService.java", "JwtRequestFilter.java", "AuthController.java", "AuthRequest.java", "AuthResponse.java", "User.java"],
    steps: [
      { id: 1, title: "Security config",             focus: "Create SecurityConfig.java with @EnableWebSecurity, JWT filter chain, CORS config, and endpoint authorization rules." },
      { id: 2, title: "JWT utility class",           focus: "Create JwtUtil.java with generateToken, validateToken, extractUsername, and extractExpiration methods." },
      { id: 3, title: "User details service",        focus: "Create CustomUserDetailsService.java implementing UserDetailsService. Load user by email from repository." },
      { id: 4, title: "JWT filter",                  focus: "Create JwtRequestFilter.java extending OncePerRequestFilter. Extract and validate JWT from Authorization header." },
      { id: 5, title: "Auth controller",             focus: "Create AuthController.java with /api/auth/login and /api/auth/register endpoints returning JWT responses." },
      { id: 6, title: "DTOs and models",             focus: "Create AuthRequest.java, AuthResponse.java DTOs and User.java entity with @Entity annotations." },
    ],
  },

  oauth2_fastapi: {
    label: "OAuth2 / JWT Auth (FastAPI / Python)",
    match: (q) => /(oauth|jwt|auth)/i.test(q) && /(python|fastapi|flask)/i.test(q),
    files: ["jwt_handler.py", "security.py", "models.py", "schemas.py", "dependencies.py", "routers/auth.py", "main.py"],
    steps: [
      { id: 1, title: "JWT utility",                 focus: "Create jwt_handler.py with create_access_token, decode_token, and create_refresh_token using python-jose." },
      { id: 2, title: "Password hashing",            focus: "Create security.py with hash_password and verify_password using passlib[bcrypt]." },
      { id: 3, title: "User schema + model",         focus: "Create models.py with User SQLAlchemy model and schemas.py with Pydantic UserCreate, UserLogin, Token schemas." },
      { id: 4, title: "Auth dependency",             focus: "Create dependencies.py with get_current_user FastAPI dependency that validates Bearer JWT tokens." },
      { id: 5, title: "Auth router",                 focus: "Create routers/auth.py with POST /auth/register and POST /auth/login endpoints using OAuth2PasswordRequestForm." },
      { id: 6, title: "Main app wiring",             focus: "Create or update main.py to include auth router, CORS middleware, and database init on startup." },
    ],
  },

  rest_api_node: {
    label: "REST API (Node.js / Express)",
    match: (q) => /(rest api|express|server|api)/i.test(q) && /(node|js|express)/i.test(q),
    files: ["config.js", "db.js", "model.js", "service.js", "routes.js", "app.js"],
    steps: [
      { id: 1, title: "Project config",             focus: "Create config.js with environment variables for PORT, DB_URL, JWT_SECRET with sensible defaults." },
      { id: 2, title: "Database connection",        focus: "Create db.js with database connection logic. Use environment-based config." },
      { id: 3, title: "Model layer",                focus: "Create the data model/schema for the main resource based on the user's request." },
      { id: 4, title: "Service layer",              focus: "Create service.js with all business logic: getAll, getById, create, update, delete." },
      { id: 5, title: "Routes and controllers",    focus: "Create routes.js with full CRUD routes connected to the service layer. Include input validation." },
      { id: 6, title: "Main app entry",            focus: "Create app.js with Express setup, middleware (cors, json, morgan), route mounting, and error handler." },
    ],
  },

  rest_api_spring: {
    label: "REST API (Spring Boot)",
    match: (q) => /(rest api|controller|crud|service)/i.test(q) && /(spring|java|boot)/i.test(q),
    files: ["Entity.java", "Repository.java", "RequestDTO.java", "ResponseDTO.java", "Service.java", "Controller.java", "GlobalExceptionHandler.java"],
    steps: [
      { id: 1, title: "Entity model",              focus: "Create the JPA @Entity class with all fields, @Id, @GeneratedValue, and validation annotations." },
      { id: 2, title: "Repository",                focus: "Create a JpaRepository interface with any custom query methods needed." },
      { id: 3, title: "DTOs",                      focus: "Create Request and Response DTO classes with validation annotations and MapStruct mappings if needed." },
      { id: 4, title: "Service layer",             focus: "Create @Service class with full CRUD business logic, exception handling, and DTO conversion." },
      { id: 5, title: "REST controller",           focus: "Create @RestController with full CRUD endpoints, proper HTTP status codes, and ResponseEntity returns." },
      { id: 6, title: "Exception handler",         focus: "Create @ControllerAdvice GlobalExceptionHandler for ResourceNotFoundException, ValidationException, etc." },
    ],
  },

  crud_python: {
    label: "CRUD App (Python / FastAPI)",
    match: (q) => /(crud|api|rest)/i.test(q) && /(python|fastapi)/i.test(q),
    files: ["database.py", "models.py", "schemas.py", "crud.py", "routers/items.py", "main.py"],
    steps: [
      { id: 1, title: "Database setup",            focus: "Create database.py with SQLAlchemy engine, SessionLocal, and Base setup." },
      { id: 2, title: "Models",                    focus: "Create models.py with all SQLAlchemy models and relationships." },
      { id: 3, title: "Schemas",                   focus: "Create schemas.py with Pydantic schemas for Create, Update, and Response." },
      { id: 4, title: "CRUD operations",           focus: "Create crud.py with get, get_multi, create, update, remove functions using SQLAlchemy session." },
      { id: 5, title: "API router",                focus: "Create routers/items.py with full CRUD endpoints using the crud module and Depends(get_db)." },
      { id: 6, title: "Main app",                  focus: "Create main.py with FastAPI app, router inclusion, CORS, and database table creation on startup." },
    ],
  },

  websocket_node: {
    label: "WebSocket Server (Node.js)",
    match: (q) => /(websocket|socket\.io|realtime|real-time|chat)/i.test(q),
    files: ["socket-server.js", "events.js", "room-manager.js", "app.js"],
    steps: [
      { id: 1, title: "Socket server setup",       focus: "Create socket-server.js with socket.io initialization, CORS config, and connection handler." },
      { id: 2, title: "Event handlers",            focus: "Create events.js with all socket event handlers: message, join-room, leave-room, disconnect." },
      { id: 3, title: "Room manager",              focus: "Create room-manager.js to track active rooms, members, and broadcast utilities." },
      { id: 4, title: "HTTP server + app",         focus: "Create app.js integrating Express HTTP server with socket.io. Add static file serving." },
    ],
  },

  docker_setup: {
    label: "Docker / Container Setup",
    match: (q) => /docker/i.test(q),
    files: ["Dockerfile", "docker-compose.yml", ".dockerignore", ".env.example"],
    steps: [
      { id: 1, title: "Dockerfile",                focus: "Create a production-optimized multi-stage Dockerfile for the detected language/framework." },
      { id: 2, title: "docker-compose.yml",        focus: "Create docker-compose.yml with app service, database service, volumes, and environment variables." },
      { id: 3, title: ".dockerignore",             focus: "Create .dockerignore to exclude node_modules, .git, .env, build artifacts." },
      { id: 4, title: "Env template",              focus: "Create .env.example with all required environment variables documented." },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// COMPLEXITY DETECTION
// ─────────────────────────────────────────────────────────────

// Returns true if the request needs multi-step planning
const isComplexTask = (input) => {
  const lower = input.toLowerCase();
  const signalCount = COMPLEX_SIGNALS.filter((s) => lower.includes(s)).length;
  return signalCount >= 2;
};

// Finds the best matching blueprint for the user's request
const findBlueprint = (input) => {
  for (const blueprint of Object.values(TASK_BLUEPRINTS)) {
    if (blueprint.match(input)) return blueprint;
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// GENERIC PLAN BUILDER
// When no blueprint matches, builds a generic step plan
// ─────────────────────────────────────────────────────────────
const buildGenericPlan = (input) => {
  const lower = input.toLowerCase();

  // Detect the main action verb
  const isCreate = /\b(create|build|implement|scaffold|make|generate|write)\b/.test(lower);
  const isFix = /\b(fix|debug|repair|solve|correct)\b/.test(lower);
  const isRefactor = /\b(refactor|improve|optimize|clean|restructure)\b/.test(lower);

  if (isFix) {
    return {
      label: "Complex Bug Fix",
      files: [], // determined dynamically
      steps: [
        { id: 1, title: "Read and analyze all affected files", focus: `Read every file mentioned or related to: "${input}". Map the error to its root cause.` },
        { id: 2, title: "Fix root cause",                     focus: `Fix the core issue identified. Do not patch symptoms — fix the root cause completely.` },
        { id: 3, title: "Fix downstream effects",             focus: `Check and fix any files that import or depend on the fixed file. Update all call sites.` },
        { id: 4, title: "Verify and run",                     focus: `Run the main entry point. If errors remain, analyze and fix them.` },
      ],
    };
  }

  if (isCreate) {
    return {
      label: "New Module / Feature",
      files: ["main.js", "utils.js"], // Placeholder, agent should adapt
      steps: [
        { id: 1, title: "Design and plan files",              focus: `List every file needed for: "${input}". Explain what each file does before writing any.` },
        { id: 2, title: "Create core logic",                  focus: `Create the main logic file(s). Include all business logic, no placeholders.` },
        { id: 3, title: "Create supporting files",            focus: `Create any models, utilities, configs, or helpers needed.` },
        { id: 4, title: "Create entry point / wiring",        focus: `Create or update the main entry file to wire everything together.` },
        { id: 5, title: "Verify completeness",                focus: `Review all created files. Check imports are correct, functions are complete, nothing is missing.` },
      ],
    };
  }

  if (isRefactor) {
    return {
      label: "Refactor / Improve",
      files: [],
      steps: [
        { id: 1, title: "Audit current code",                 focus: `Read all files involved in: "${input}". List all issues, code smells, and improvements needed.` },
        { id: 2, title: "Refactor core logic",                focus: `Apply improvements: extract functions, fix naming, add error handling, improve types.` },
        { id: 3, title: "Update dependents",                  focus: `Update any files that call into the refactored code to use new signatures.` },
      ],
    };
  }

  return null;
};

// ─────────────────────────────────────────────────────────────
// MAIN PLAN FUNCTION
// Returns a plan object or null if task is simple
// ─────────────────────────────────────────────────────────────
const planTask = (input) => {
  if (!isComplexTask(input)) return null;

  const blueprint = findBlueprint(input);
  if (blueprint) return blueprint;

  return buildGenericPlan(input);
};

// Formats a plan for display in the terminal
const displayPlan = (plan) => {
  console.log(`\n📋 TASK PLAN: ${plan.label}`);
  if (plan.files && plan.files.length) {
    console.log(`📁 Target Files: ${plan.files.join(", ")}`);
  }
  console.log("═".repeat(50));
  plan.steps.forEach((s) => {
    console.log(`  Step ${s.id}: ${s.title}`);
  });
  console.log("═".repeat(50));
};

module.exports = { planTask, displayPlan, isComplexTask, findBlueprint };
