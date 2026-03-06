"use strict";

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// KNOWLEDGE ATOM STORE + TF-IDF SEARCH
// "Vectorless" semantic memory — stores discrete coding facts
// and retrieves them using keyword scoring (TF-IDF inspired).
// No external dependencies, no vector DB, works fully offline.
// ─────────────────────────────────────────────────────────────

const MEMORY_DIR = path.join(process.cwd(), ".agent-memory");
const ATOMS_FILE = path.join(MEMORY_DIR, "atoms.json");
const GRAPH_FILE = path.join(MEMORY_DIR, "graph.json");

// ─────────────────────────────────────────────────────────────
// KNOWLEDGE ATOMS
// Each atom = one discrete, reusable coding fact
// Format: { id, lang, tags[], fact, source, useCount, createdAt }
// ─────────────────────────────────────────────────────────────

// Pre-seeded atoms — agent knows these from birth
const SEED_ATOMS = [
  // JavaScript
  { lang: "js", tags: ["async", "error", "promise"], fact: "Always wrap await calls in try/catch. Unhandled promise rejections crash Node.js." },
  { lang: "js", tags: ["null", "undefined", "optional"], fact: "Use optional chaining (?.) and nullish coalescing (??) to safely access nested properties." },
  { lang: "js", tags: ["module", "import", "require"], fact: "In Node.js ESM, use import/export. In CommonJS, use require/module.exports. Never mix them in the same file." },
  { lang: "js", tags: ["cors", "express", "header"], fact: "CORS errors: add cors() middleware BEFORE route definitions. Set origin, methods, credentials explicitly." },
  { lang: "js", tags: ["jwt", "auth", "token"], fact: "JWT secrets must be long random strings (32+ chars). Always verify token on every protected route. Store in httpOnly cookies, not localStorage." },
  { lang: "js", tags: ["env", "config", "dotenv"], fact: "Load .env with require('dotenv').config() as the very FIRST line in entry point. Never commit .env to git." },
  { lang: "js", tags: ["bcrypt", "password", "hash"], fact: "bcrypt.hash() is async. Always await it. Use saltRounds = 12 minimum for production passwords." },

  // TypeScript
  { lang: "ts", tags: ["type", "any", "generic"], fact: "Avoid 'any'. Use 'unknown' for truly unknown types — it forces type checking before use." },
  { lang: "ts", tags: ["interface", "type", "object"], fact: "Use interfaces for object shapes (mergeable), type aliases for unions/intersections/primitives." },
  { lang: "ts", tags: ["async", "return", "promise"], fact: "Async functions always return Promise<T>. Annotate return type as Promise<void>, Promise<string>, etc." },

  // Python
  { lang: "py", tags: ["async", "asyncio", "event loop"], fact: "Use asyncio.run(main()) as entry point. Never call loop.run_until_complete() in newer Python (3.10+)." },
  { lang: "py", tags: ["import", "module", "package"], fact: "Relative imports (from .module import X) only work inside packages. Add __init__.py to make a directory a package." },
  { lang: "py", tags: ["pydantic", "validation", "fastapi"], fact: "Pydantic v2 uses model_validate() not parse_obj(). Field validators use @field_validator decorator." },
  { lang: "py", tags: ["sqlalchemy", "session", "database"], fact: "Always close SQLAlchemy sessions. Use context managers (with Session() as session:) or try/finally." },
  { lang: "py", tags: ["fastapi", "dependency", "injection"], fact: "FastAPI dependencies with yield are generators. Put cleanup code after yield. Use Depends() in route params." },
  { lang: "py", tags: ["jwt", "auth", "bearer"], fact: "python-jose: use jwt.encode() with algorithm='HS256'. Decode with jwt.decode() passing the secret and algorithms list." },

  // Java
  { lang: "java", tags: ["null", "npe", "optional"], fact: "Use Optional<T> for nullable return values. Never return null from public methods. Use Objects.requireNonNull() for validation." },
  { lang: "java", tags: ["spring", "bean", "autowired"], fact: "Prefer constructor injection over @Autowired field injection. It makes dependencies explicit and testable." },
  { lang: "java", tags: ["jpa", "lazy", "transaction"], fact: "LazyInitializationException: add @Transactional to service methods or use JOIN FETCH in JPQL queries." },
  { lang: "java", tags: ["exception", "handler", "rest"], fact: "@ControllerAdvice + @ExceptionHandler creates global exception handlers. Return ResponseEntity with proper HTTP status." },
  { lang: "java", tags: ["lombok", "boilerplate"], fact: "Use @Data, @Builder, @AllArgsConstructor, @NoArgsConstructor from Lombok to eliminate boilerplate. Add Lombok dependency to pom.xml." },

  // Spring Boot
  { lang: "springboot", tags: ["security", "jwt", "filter"], fact: "JWT filter must extend OncePerRequestFilter. Add it to SecurityFilterChain BEFORE UsernamePasswordAuthenticationFilter." },
  { lang: "springboot", tags: ["cors", "config", "web"], fact: "Configure CORS in SecurityConfig.java using .cors(cors -> cors.configurationSource(...)). Don't use @CrossOrigin for global config." },
  { lang: "springboot", tags: ["circular", "dependency", "bean"], fact: "Circular dependency: use @Lazy on one of the injections, or refactor to introduce a third intermediary bean." },
  { lang: "springboot", tags: ["properties", "config", "yaml"], fact: "Use @ConfigurationProperties(prefix='app') with a @Configuration class for grouped settings. Type-safe and IDE-friendly." },
  { lang: "springboot", tags: ["validation", "request", "body"], fact: "Use @Valid on @RequestBody params. Add validation annotations (@NotNull, @Size, @Email) to DTO fields. Handle MethodArgumentNotValidException." },

  // Go
  { lang: "go", tags: ["error", "wrap", "handling"], fact: "Wrap errors with fmt.Errorf('context: %w', err). Check with errors.Is() and errors.As() for type-safe error inspection." },
  { lang: "go", tags: ["goroutine", "leak", "context"], fact: "Always pass context.Context to goroutines. Use context.WithCancel() to signal shutdown. Goroutines without exit conditions leak." },
  { lang: "go", tags: ["interface", "nil", "pointer"], fact: "A nil pointer satisfying an interface is NOT nil as an interface. Always return explicit nil for interface return types." },

  // Rust
  { lang: "rust", tags: ["borrow", "ownership", "clone"], fact: "Borrow checker errors: use clone() if you need multiple owners, or restructure to pass references (&T) instead of values." },
  { lang: "rust", tags: ["result", "option", "unwrap"], fact: "Never use .unwrap() in production code. Use ?, match, if let, or .unwrap_or_else() for safe error handling." },

  // Docker
  { lang: "docker", tags: ["layer", "cache", "build"], fact: "Copy package.json and install dependencies BEFORE copying source code. This caches the node_modules layer and speeds up rebuilds." },
  { lang: "docker", tags: ["env", "secret", "build-arg"], fact: "Never put secrets in Dockerfile or build args — they appear in image history. Use runtime env vars or Docker secrets." },

  // General
  { lang: "general", tags: ["sql", "injection", "security"], fact: "NEVER concatenate user input into SQL queries. Always use parameterized queries / prepared statements." },
  { lang: "general", tags: ["env", "secret", "gitignore"], fact: ".env files must be in .gitignore. Rotate any secrets that were ever committed to git history." },
  { lang: "general", tags: ["test", "validation", "run"], fact: "After every code generation: check that all imports resolve, all functions are called with correct argument counts, and no logic is left as pseudocode." },
];

// ─────────────────────────────────────────────────────────────
// ATOM STORAGE
// ─────────────────────────────────────────────────────────────

const loadAtoms = () => {
  try {
    const raw = fs.readFileSync(ATOMS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
};

const saveAtoms = (atoms) => {
  try {
    fs.writeFileSync(ATOMS_FILE, JSON.stringify(atoms, null, 2));
  } catch (_) {}
};

// Initializes atom store with seed data if empty
const initAtoms = () => {
  const existing = loadAtoms();
  if (existing.length > 0) return;
  const seeded = SEED_ATOMS.map((a, i) => ({
    ...a,
    id: `seed-${i}`,
    source: "built-in",
    useCount: 0,
    createdAt: new Date().toISOString(),
  }));
  saveAtoms(seeded);
};

// Adds a new atom (from web search fix, user feedback, etc.)
const addAtom = ({ lang, tags, fact, source = "agent-learned" }) => {
  const atoms = loadAtoms();
  // Deduplicate by fact similarity (exact substring match)
  const isDuplicate = atoms.some(
    (a) => a.fact.toLowerCase().includes(fact.slice(0, 40).toLowerCase())
  );
  if (isDuplicate) return;

  atoms.push({
    id: `atom-${Date.now()}`,
    lang,
    tags: Array.isArray(tags) ? tags : [tags],
    fact,
    source,
    useCount: 0,
    createdAt: new Date().toISOString(),
  });
  saveAtoms(atoms);
};

// ─────────────────────────────────────────────────────────────
// TF-IDF INSPIRED KEYWORD SCORING
// Scores each atom against the query using:
//   - Tag overlap
//   - Language match (boosted)
//   - Keyword frequency in fact text
// ─────────────────────────────────────────────────────────────

// Tokenizes a string into lowercase keywords
const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

// Scores a single atom against query tokens and language
const scoreAtom = (atom, queryTokens, lang = "") => {
  let score = 0;

  // Language match bonus
  if (atom.lang === lang) score += 10;
  if (atom.lang === "general") score += 2;

  // Tag overlap
  const atomTags = (atom.tags || []).join(" ");
  const tagTokens = tokenize(atomTags);
  for (const qt of queryTokens) {
    if (tagTokens.includes(qt)) score += 5;
  }

  // Keyword frequency in fact text
  const factTokens = tokenize(atom.fact);
  for (const qt of queryTokens) {
    const count = factTokens.filter((f) => f === qt).length;
    score += count * 2;
  }

  return score;
};

// ─────────────────────────────────────────────────────────────
// SEARCH ATOMS
// Returns top N most relevant atoms for a query
// ─────────────────────────────────────────────────────────────
const searchAtoms = (query, lang = "", topN = 6) => {
  const atoms = loadAtoms();
  const queryTokens = tokenize(query + " " + lang);

  const scored = atoms
    .map((atom) => ({ atom, score: scoreAtom(atom, queryTokens, lang) }))
    .filter(({ score }) => score > 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  // Track usage
  const usedIds = new Set(scored.map(({ atom }) => atom.id));
  const updated = atoms.map((a) =>
    usedIds.has(a.id) ? { ...a, useCount: (a.useCount || 0) + 1 } : a
  );
  saveAtoms(updated);

  return scored.map(({ atom }) => atom);
};

// Builds a knowledge injection block from search results
const buildAtomBlock = (query, lang = "") => {
  const atoms = searchAtoms(query, lang);
  if (atoms.length === 0) return "";

  const lines = atoms.map((a) => `  • [${a.lang}/${a.tags.join(",")}] ${a.fact}`).join("\n");
  return `
KNOWLEDGE BASE (relevant facts for this task):
${lines}
`.trim();
};

// ─────────────────────────────────────────────────────────────
// DEPENDENCY GRAPH
// Parses imports/requires to map file relationships
// ─────────────────────────────────────────────────────────────

const loadGraph = () => {
  try {
    return JSON.parse(fs.readFileSync(GRAPH_FILE, "utf8"));
  } catch (_) {
    return {};
  }
};

const saveGraph = (graph) => {
  try {
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));
  } catch (_) {}
};

// Extracts import/require paths from file content
const extractImports = (content, filePath) => {
  const imports = new Set();
  const ext = path.extname(filePath);

  // JS/TS require
  const requireMatches = content.matchAll(/require\(['"]([^'"]+)['"]\)/g);
  for (const m of requireMatches) {
    if (m[1].startsWith(".")) imports.add(m[1]);
  }

  // ES6 import
  const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
  for (const m of importMatches) {
    if (m[1].startsWith(".")) imports.add(m[1]);
  }

  // Python import
  const pyMatches = content.matchAll(/from\s+(\.[\w.]+)\s+import/g);
  for (const m of pyMatches) {
    imports.add(m[1]);
  }

  // Java import
  const javaMatches = content.matchAll(/import\s+([\w.]+);/g);
  for (const m of javaMatches) {
    imports.add(m[1]);
  }

  return Array.from(imports);
};

// Updates the dependency graph for a file
const updateGraph = (filePath, content) => {
  const graph = loadGraph();
  const imports = extractImports(content, filePath);
  graph[filePath] = {
    imports,
    updatedAt: new Date().toISOString(),
  };
  saveGraph(graph);
};

// Finds files that depend on a given file (reverse lookup)
const getDependents = (filePath) => {
  const graph = loadGraph();
  const baseName = path.basename(filePath, path.extname(filePath));
  return Object.entries(graph)
    .filter(([, data]) =>
      data.imports?.some((imp) => imp.includes(baseName) || imp.includes(filePath))
    )
    .map(([file]) => file);
};

// Returns all files that a given file imports
const getDependencies = (filePath) => {
  const graph = loadGraph();
  return graph[filePath]?.imports || [];
};

module.exports = {
  initAtoms,
  addAtom,
  searchAtoms,
  buildAtomBlock,
  updateGraph,
  getDependents,
  getDependencies,
  loadAtoms,
};
