"use strict";

// ─────────────────────────────────────────────────────────────
// LANGUAGE PROFILES — Knowledge wrapper for multi-language support
// Each profile gives the LLM expert-level context on the language
// ─────────────────────────────────────────────────────────────

const LANG_PROFILES = {
  js: {
    name: "JavaScript (Node.js)",
    extensions: [".js", ".mjs", ".cjs"],
    runtime: "node",
    runCmd: (f) => `node ${f}`,
    commonErrors: [
      "TypeError: Cannot read properties of undefined",
      "ReferenceError: X is not defined",
      "SyntaxError: Unexpected token",
      "UnhandledPromiseRejection",
      "ENOENT: no such file",
      "Cannot find module",
      "Maximum call stack exceeded",
    ],
    fixHints: `
- Always check for null/undefined before accessing properties. Use optional chaining (?.) and nullish coalescing (??)
- Async errors: wrap await calls in try/catch; never let promises go unhandled
- Module errors: verify require/import paths; check package.json dependencies
- Use const by default; only let when reassignment is needed; never var
- For callback-based APIs, promisify using util.promisify or manual Promise wrapping
- Stack overflow: look for infinite recursion or missing base case
`,
    style: `Use "use strict"; at top. Arrow functions. async/await. const/let. JSDoc comments.`,
  },

  ts: {
    name: "TypeScript",
    extensions: [".ts", ".tsx"],
    runtime: "ts-node or tsc",
    runCmd: (f) => `npx ts-node ${f}`,
    commonErrors: [
      "Type 'X' is not assignable to type 'Y'",
      "Property 'X' does not exist on type 'Y'",
      "Object is possibly 'undefined'",
      "Cannot find module or type declarations",
      "Argument of type 'X' is not assignable",
    ],
    fixHints: `
- Type mismatches: add explicit type annotations or use type guards (typeof, instanceof)
- Missing types: install @types/package-name or declare module with 'declare module'
- Strict null: use non-null assertion (!) only when certain, prefer optional chaining
- Generic errors: constrain generics with extends; use conditional types for flexibility
- tsconfig issues: check strict, esModuleInterop, moduleResolution settings
`,
    style: `Explicit types everywhere. Interfaces over type aliases for objects. Enums for constants.`,
  },

  py: {
    name: "Python",
    extensions: [".py"],
    runtime: "python3",
    runCmd: (f) => `python3 ${f}`,
    commonErrors: [
      "IndentationError",
      "NameError: name 'X' is not defined",
      "TypeError: unsupported operand type",
      "AttributeError: 'X' object has no attribute 'Y'",
      "ImportError / ModuleNotFoundError",
      "KeyError / IndexError",
      "RecursionError: maximum recursion depth exceeded",
    ],
    fixHints: `
- Indentation: use 4 spaces (never tabs). PEP8 standard.
- Type errors: Python is duck-typed; check actual types with type() or isinstance()
- Import errors: verify pip install, check __init__.py in packages, use relative imports in packages
- Attribute errors: inspect the object with dir() or print type; check None returns
- Key/index errors: use .get(key, default) for dicts; check len() before indexing
- Async: use asyncio.run() as entry point; await only inside async def
- Use f-strings for formatting; avoid % and .format() in new code
`,
    style: `PEP8. Type hints. Docstrings. Context managers (with). List comprehensions where readable.`,
  },

  java: {
    name: "Java",
    extensions: [".java"],
    runtime: "JVM (Java 11+)",
    runCmd: (f) => `javac ${f} && java ${f.replace(".java", "")}`,
    commonErrors: [
      "NullPointerException",
      "ClassCastException",
      "ArrayIndexOutOfBoundsException",
      "StackOverflowError",
      "ClassNotFoundException",
      "IllegalArgumentException",
      "ConcurrentModificationException",
    ],
    fixHints: `
- NPE: always check for null before dereferencing; use Optional<T> for nullable returns
- Casting: check instanceof before casting; use generics to avoid raw types
- Array bounds: validate index < array.length; use ArrayList for dynamic sizing
- Concurrency: use synchronized, ReentrantLock, or java.util.concurrent collections
- ClassNotFoundException: verify classpath and JAR dependencies
- Collections: never modify a collection while iterating; use Iterator.remove() or stream filters
- Use try-with-resources for Closeable/AutoCloseable objects
`,
    style: `Camel case. Access modifiers on all members. Javadoc. Builder pattern for complex objects. SOLID principles.`,
  },

  springboot: {
    name: "Spring Boot (Java)",
    extensions: [".java"],
    runtime: "Spring Boot (Maven/Gradle)",
    runCmd: (_) => `mvn spring-boot:run`,
    commonErrors: [
      "NoSuchBeanDefinitionException",
      "BeanCreationException",
      "DataIntegrityViolationException",
      "HttpMessageNotReadableException",
      "MethodArgumentNotValidException",
      "LazyInitializationException",
      "CircularDependencyException",
    ],
    fixHints: `
- Bean not found: check @Component/@Service/@Repository annotation; verify component scan covers the package
- Circular dependency: use @Lazy injection or refactor to break cycle
- JPA LazyInit: use @Transactional on service methods or fetch eagerly with JOIN FETCH
- Validation errors: use @Valid on controller params + @NotNull/@Size on DTO fields
- DataIntegrity: check DB constraints match entity annotations; use @Column(nullable=false) consistently
- HTTP errors: verify @RequestBody/@ResponseBody; check Content-Type headers; use ResponseEntity<> for fine control
- Properties: use @Value("\${property}") with fallback; prefer @ConfigurationProperties for grouped config
`,
    style: `@Service/@Repository/@Controller layers. DTOs separate from entities. @RestController. ResponseEntity returns.`,
  },

  py_fastapi: {
    name: "Python FastAPI",
    extensions: [".py"],
    runtime: "uvicorn",
    runCmd: (_) => `uvicorn main:app --reload`,
    commonErrors: [
      "422 Unprocessable Entity",
      "pydantic ValidationError",
      "ImportError: cannot import name",
      "RuntimeError: no running event loop",
      "CORS error",
      "Dependency injection failure",
    ],
    fixHints: `
- 422 errors: check Pydantic model field types; ensure request body matches schema
- Async: all route handlers should be async def; use await for DB/IO operations
- Dependencies: use Depends() correctly; check circular dependencies
- CORS: add CORSMiddleware with correct origins
- SQLAlchemy async: use AsyncSession, not Session; use await for all DB calls
`,
    style: `Pydantic models for all I/O. Type hints everywhere. Async/await. APIRouter for grouping.`,
  },

  go: {
    name: "Go (Golang)",
    extensions: [".go"],
    runtime: "go run / go build",
    runCmd: (f) => `go run ${f}`,
    commonErrors: [
      "undefined: X",
      "cannot use X as type Y",
      "nil pointer dereference",
      "goroutine leak",
      "deadlock detected",
      "index out of range",
    ],
    fixHints: `
- Nil pointer: always check error returns; initialize structs before use
- Goroutine leaks: ensure goroutines have exit conditions; use context for cancellation
- Deadlocks: check mutex locking order; avoid holding locks across channel sends
- Type errors: Go is strict; use explicit conversions (int64(x))
- Unused imports/variables: Go treats these as compile errors; remove or use _
- Error handling: always check if err != nil; wrap errors with fmt.Errorf("...: %w", err)
`,
    style: `Short variable names. Error returns (not panic). Interfaces for abstraction. Goroutines + channels for concurrency.`,
  },

  rust: {
    name: "Rust",
    extensions: [".rs"],
    runtime: "cargo",
    runCmd: (_) => `cargo run`,
    commonErrors: [
      "borrow checker error",
      "cannot move out of borrowed content",
      "lifetime mismatch",
      "trait not implemented for type",
      "pattern match non-exhaustive",
    ],
    fixHints: `
- Borrow errors: use clone() if ownership is complex; prefer references (&) over moves
- Lifetimes: start with explicit lifetimes; use 'static sparingly
- Traits: implement Display, Debug, Clone as needed; use derive macros
- Option/Result: use ? operator for propagation; match/if let for handling
- Mut errors: ensure variables are declared mut; understand interior mutability (RefCell, Mutex)
`,
    style: `Use Result/Option. Derive Debug/Clone. impl blocks for methods. mod for modules.`,
  },

  cpp: {
    name: "C++",
    extensions: [".cpp", ".cc", ".cxx", ".h", ".hpp"],
    runtime: "g++ / clang++",
    runCmd: (f) => `g++ -std=c++17 -o out ${f} && ./out`,
    commonErrors: [
      "segmentation fault",
      "undefined reference to",
      "multiple definition of",
      "use after free / double free",
      "template instantiation error",
    ],
    fixHints: `
- Segfaults: check pointer validity before dereferencing; prefer smart pointers (unique_ptr, shared_ptr)
- Undefined reference: check linker flags; ensure all .cpp files are compiled; check function definitions
- Use after free: switch to RAII with smart pointers; avoid raw new/delete
- Memory leaks: use valgrind or AddressSanitizer (-fsanitize=address)
- Templates: put template definitions in header files (not .cpp)
`,
    style: `RAII. Smart pointers. const correctness. STL containers. Modern C++17/20 features.`,
  },

  php: {
    name: "PHP",
    extensions: [".php"],
    runtime: "php / Apache / nginx",
    runCmd: (f) => `php ${f}`,
    commonErrors: [
      "Undefined variable",
      "Call to undefined function",
      "Fatal error: Class not found",
      "Warning: Array to string conversion",
      "PDOException",
    ],
    fixHints: `
- Undefined var: use isset() before accessing; initialize variables
- Class not found: check use statements; verify autoloader (composer dump-autoload)
- SQL errors: use prepared statements with PDO; never concatenate user input
- Type juggling: use strict comparison (===) to avoid type coercion bugs
- Sessions: call session_start() before any output
`,
    style: `PSR-12 coding standard. Composer for dependencies. PDO for DB. Type declarations in PHP 8+.`,
  },

  bash: {
    name: "Bash / Shell",
    extensions: [".sh", ".bash"],
    runtime: "bash",
    runCmd: (f) => `bash ${f}`,
    commonErrors: [
      "command not found",
      "permission denied",
      "unbound variable",
      "syntax error near unexpected token",
      "broken pipe",
    ],
    fixHints: `
- Always add 'set -euo pipefail' at top for safety
- Quote all variables: "$variable" not $variable
- Check exit codes: use || and && for conditional execution
- Unbound variable: use \${var:-default} for safe access
- Permissions: chmod +x script.sh; check directory access
`,
    style: `set -euo pipefail. Quoted vars. Functions for reuse. Meaningful exit codes.`,
  },
};

// ─────────────────────────────────────────────────────────────
// FRAMEWORK DETECTION
// ─────────────────────────────────────────────────────────────

// Detects language from file extension
const detectLangFromFile = (filePath) => {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  for (const [key, profile] of Object.entries(LANG_PROFILES)) {
    if (profile.extensions.includes(ext)) return key;
  }
  return null;
};

// Detects framework from file content hints
const detectFrameworkFromContent = (content, langKey) => {
  if (!content) return langKey;
  if (content.includes("@SpringBootApplication") || content.includes("@RestController")) return "springboot";
  if (content.includes("from fastapi") || content.includes("FastAPI()")) return "py_fastapi";
  return langKey;
};

// Returns the full profile for a given file
const getProfile = (filePath, content = "") => {
  const langKey = detectLangFromFile(filePath);
  if (!langKey) return null;
  const frameworkKey = detectFrameworkFromContent(content, langKey);
  return LANG_PROFILES[frameworkKey] || LANG_PROFILES[langKey] || null;
};

// Builds a knowledge injection block for the LLM prompt
const buildKnowledgeBlock = (profile) => {
  if (!profile) return "";
  return `
═══════════════════════════════════════════════
LANGUAGE EXPERT CONTEXT: ${profile.name}
═══════════════════════════════════════════════
COMMON ERRORS TO LOOK FOR:
${profile.commonErrors.map((e) => `  • ${e}`).join("\n")}

FIX STRATEGIES:
${profile.fixHints.trim()}

CODING STYLE:
${profile.style}
═══════════════════════════════════════════════
`.trim();
};

module.exports = { LANG_PROFILES, getProfile, buildKnowledgeBlock, detectLangFromFile };
