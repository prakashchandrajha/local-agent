# 📖 API Reference

**Complete function and method reference** for all systems.

---

## 🗂️ Table of Contents

- [Agent (agent.js)](#agent-agentjs)
- [Memory System (tools/memory.js)](#memory-system-toolsmemoryjs)
- [Scanner System (tools/scanner.js)](#scanner-system-toolsscannerjs)
- [File Operations (tools/file.js)](#file-operations-toolsfilejs)

---

## 🤖 Agent (agent.js)

### Configuration Constants

```javascript
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";
const MAX_RETRIES = 3;
const MAX_HISTORY = 20;
const DEBUG = false;
const USE_MEMORY = true;
const MAX_AGENT_TURNS = 4;
```

---

### `run()`

Start the main agent loop.

**Returns:** `Promise<void>`

**Example:**
```javascript
run().catch((err) => {
  console.error("Fatal error:", err.message);
});
```

---

### `buildSystemPrompt(readmeContent)`

Build the system prompt for LLM.

**Parameters:**
- `readmeContent` (string|null) - README.md content

**Returns:** `string` - Complete system prompt

---

### `buildMemoryContext(file)`

Get memory context for a file.

**Parameters:**
- `file` (string) - File path

**Returns:** `string` - Context string or empty

---

### `injectProjectContext(file)`

Get project context for a file.

**Parameters:**
- `file` (string) - File path

**Returns:** `string` - Context string or empty

---

### `runAgentLoop(userInput, systemPrompt, contextFile)`

Run the agent loop for a single user request.

**Parameters:**
- `userInput` (string) - User's request
- `systemPrompt` (string) - System prompt
- `contextFile` (string|null) - Active file context

**Returns:** `Promise<{summaries: Array, activeFile: string|null}>`

---

### `callLLM(prompt, systemPrompt)`

Call the LLM with retry logic.

**Parameters:**
- `prompt` (string) - User prompt
- `systemPrompt` (string) - System prompt

**Returns:** `Promise<{raw: string, ops: Array}|null>`

---

### `parseToolBlocks(response)`

Parse tool operations from LLM response.

**Parameters:**
- `response` (string) - LLM response

**Returns:** `Array` - List of operations

---

### `initializeProjectContext()`

Initialize project context on startup.

**Returns:** `void`

---

## 🧠 Memory System (tools/memory.js)

### Core CRUD Operations

---

#### `loadMemory()`

Load all memory entries from JSONL file.

**Returns:** `Array<Object>` - All entries

**Example:**
```javascript
const entries = memory.loadMemory();
```

---

#### `addFix(file, func, description, codeBefore, codeAfter, changeType, tags)`

Add a new fix to memory.

**Parameters:**
- `file` (string) - File path
- `func` (string) - Function name
- `description` (string) - Change description
- `codeBefore` (string) - Code before change
- `codeAfter` (string) - Code after change
- `changeType` (string) - Type: 'bug_fix', 'feature', 'improvement', 'refactor'
- `tags` (Array<string>) - Optional tags

**Returns:** `Object` - Created entry

**Example:**
```javascript
const entry = memory.addFix(
  "calculator.js",
  "add",
  "Added null check",
  "function add(a, b) { return a + b; }",
  "function add(a, b) { if (!a) throw Error(); return a + b; }",
  "bug_fix",
  ["js", "validation"]
);
```

---

#### `findRelevantFixes(filters)`

Find relevant fixes by various criteria.

**Parameters:**
- `filters` (Object) - Filter criteria
  - `file` (string) - Filter by file (partial match)
  - `function` (string) - Filter by function (partial match)
  - `tags` (Array<string>) - Filter by tags (must match all)
  - `changeType` (string) - Filter by change type
  - `limit` (number) - Max results

**Returns:** `Array<Object>` - Matching entries

**Example:**
```javascript
const fixes = memory.findRelevantFixes({
  file: "calculator",
  tags: ["bug_fix"],
  limit: 10
});
```

---

#### `getEntryById(id)`

Get a specific entry by ID.

**Parameters:**
- `id` (string) - Entry ID

**Returns:** `Object|null` - The entry or null

---

#### `updateEntry(id, updates)`

Update an existing entry.

**Parameters:**
- `id` (string) - Entry ID
- `updates` (Object) - Fields to update

**Returns:** `Object|null` - Updated entry or null

**Example:**
```javascript
memory.updateEntry(entryId, {
  description: "Updated description",
  tags: ["new", "tags"]
});
```

---

#### `deleteEntry(id)`

Delete an entry by ID.

**Parameters:**
- `id` (string) - Entry ID

**Returns:** `boolean` - Success status

---

### Search Operations

---

#### `searchByCode(codeSnippet, mode, limit)`

Search memory by code content.

**Parameters:**
- `codeSnippet` (string) - Code to search for
- `mode` (string) - 'before', 'after', or 'both'
- `limit` (number) - Max results

**Returns:** `Array<Object>` - Matching entries

---

### Import/Export

---

#### `exportMemory(exportPath)`

Export memory to a portable JSON file.

**Parameters:**
- `exportPath` (string) - Path to export to

**Returns:** `boolean` - Success status

---

#### `importMemory(importPath, merge)`

Import memory from a JSON file.

**Parameters:**
- `importPath` (string) - Path to import from
- `merge` (boolean) - Merge with existing (true) or replace (false)

**Returns:** `boolean` - Success status

---

### Statistics

---

#### `getStats()`

Get memory statistics.

**Returns:** `Object` - Stats object

**Example:**
```javascript
const stats = memory.getStats();
// {
//   totalEntries: 45,
//   uniqueFiles: 12,
//   uniqueFunctions: 28,
//   byType: { bug_fix: 30, feature: 10 },
//   topTags: [{ tag: "js", count: 40 }]
// }
```

---

### Agent Integration

---

#### `autoRecordChange(file, oldContent, newContent, description)`

Automatically detect and record a code change.

**Parameters:**
- `file` (string) - File path
- `oldContent` (string) - Content before change
- `newContent` (string) - Content after change
- `description` (string) - Optional description

**Returns:** `Object|null` - Created entry or null

---

#### `getContextSuggestions(file, functionName)`

Get context-aware suggestions for a file.

**Parameters:**
- `file` (string) - File path
- `functionName` (string|null) - Optional specific function

**Returns:** `Array<Object>` - Relevant past fixes

---

### Configuration

```javascript
const MEMORY_FILE = "persistent_memory.jsonl";
const INDEX_FILE = "memory_index.json";
const MAX_ENTRIES = 1000;
```

---

## 🗺️ Scanner System (tools/scanner.js)

### Core Scanning

---

#### `scanProject(dir, quick)`

Full project scan.

**Parameters:**
- `dir` (string) - Directory to scan (default: project root)
- `quick` (boolean) - Quick scan mode (skip unchanged files)

**Returns:** `Object` - Project map

**Example:**
```javascript
const map = scanner.scanProject();
```

---

#### `loadProjectMap(forceRefresh)`

Load project map from cache.

**Parameters:**
- `forceRefresh` (boolean) - Force full rescan

**Returns:** `Object` - Project map

---

#### `quickRefresh()`

Quick refresh: only update changed files.

**Returns:** `Object` - Updated project map

---

#### `scanFiles(filePaths)`

Scan specific files only.

**Parameters:**
- `filePaths` (Array<string>) - Relative file paths

**Returns:** `Object` - Scan results

---

### Dependency Analysis

---

#### `getDependents(filePath, projectMap)`

Get all files that depend on a file.

**Parameters:**
- `filePath` (string) - File to find dependents for
- `projectMap` (Object|null) - Optional pre-loaded map

**Returns:** `Array<string>` - Dependent files

**Example:**
```javascript
const dependents = scanner.getDependents("tools/file.js");
// ["agent.js"]
```

---

#### `getImportTree(filePath, projectMap, visited)`

Get all transitive imports for a file.

**Parameters:**
- `filePath` (string) - File to get imports for
- `projectMap` (Object|null) - Optional pre-loaded map
- `visited` (Set) - Track visited files (internal)

**Returns:** `Array<string>` - All dependencies

---

#### `getFileStructures(filePath, projectMap)`

Get cached structures for a file.

**Parameters:**
- `filePath` (string) - File path
- `projectMap` (Object|null) - Optional pre-loaded map

**Returns:** `Object|null` - Structures or null

---

### Context Injection

---

#### `buildContextInjection(targetFile, projectMap)`

Build context injection for LLM prompt.

**Parameters:**
- `targetFile` (string) - File being worked on
- `projectMap` (Object|null) - Optional pre-loaded map

**Returns:** `string` - Context string

**Example:**
```javascript
const context = scanner.buildContextInjection("agent.js");
/*
📁 Active file: agent.js
   Functions: run, buildSystemPrompt...
   Imports (3): tools/file.js, tools/memory.js, tools/scanner.js
*/
```

---

### Utilities

---

#### `extractImports(content, filePath, ext)`

Extract imports from file content.

**Parameters:**
- `content` (string) - File content
- `filePath` (string) - Relative file path
- `ext` (string) - File extension

**Returns:** `Array<string>` - Import paths

---

#### `extractStructures(content, ext)`

Extract function and class names from file content.

**Parameters:**
- `content` (string) - File content
- `ext` (string) - File extension

**Returns:** `Object` - { functions, classes, exports }

---

#### `detectChanges(oldHashes, newHashes)`

Detect which files have changed.

**Parameters:**
- `oldHashes` (Object) - Previous file hashes
- `newHashes` (Object) - Current file hashes

**Returns:** `Object` - { changed, added, removed }

---

#### `generateFileHash(content)`

Generate MD5 hash of file content.

**Parameters:**
- `content` (string) - File content

**Returns:** `string` - 32-character hash

---

#### `loadFileHashes()`

Load cached file hashes.

**Returns:** `Object` - File hashes

---

### Configuration

```javascript
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CACHE_FILE = "project_map.json";
const HASH_CACHE_FILE = "file_hashes.json";
const SUPPORTED_EXTENSIONS = [".js", ".ts", ".py", ".php"];
const SKIP_DIRS = ["node_modules", ".git", "dist", "build"];
```

---

## 📁 File Operations (tools/file.js)

---

#### `readFile(filePath)`

Read a file from the project root.

**Parameters:**
- `filePath` (string) - Relative file path

**Returns:** `string` - File content or error message

---

#### `writeFile(filePath, content)`

Write content to a file.

**Parameters:**
- `filePath` (string) - Relative file path
- `content` (string) - File content

**Returns:** `string` - Success or error message

---

#### `listFiles()`

List all files in the project root.

**Returns:** `string` - Newline-separated file list

---

## 📊 Data Structures

### Memory Entry

```typescript
interface MemoryEntry {
  id: string;              // UUID
  timestamp: string;       // ISO date
  file: string;            // Relative path
  function: string;        // Function name
  change_type: string;     // bug_fix | feature | improvement | refactor
  description: string;     // Human-readable
  diff: {
    before: string;        // Code before
    after: string;         // Code after
  };
  tags: string[];          // Categorization
  hash: string;            // MD5 hash
}
```

---

### Project Map

```typescript
interface ProjectMap {
  files: string[];                    // All files
  recentlyModified: string[];         // Modified in 24h
  imports: {                          // Import map
    [file: string]: string[];
  };
  languages: {                        // Files by language
    [lang: string]: string[];
  };
  structures: {                       // Code structures
    [file: string]: {
      functions: string[];
      classes: string[];
      exports: string[];
    };
  };
  lastScan: string;                   // ISO date
  scanDuration: number;               // Milliseconds
}
```

---

### Filter Options

```typescript
interface FindFilters {
  file?: string;           // Partial match
  function?: string;       // Partial match
  tags?: string[];         // Must match all
  changeType?: string;     // Exact match
  limit?: number;          // Max results
}
```

---

## 🔐 Error Handling

All functions handle errors gracefully:

- **File operations** return error messages
- **Memory operations** return null/empty on failure
- **Scanner operations** continue with partial data

**Example:**
```javascript
const content = readFile("nonexistent.js");
// Returns: "ERROR: Cannot read file."

const entry = memory.getEntryById("invalid-id");
// Returns: null
```

---

## 🧪 Testing

Run all tests:
```bash
node tests/test_all.js
```

Test coverage:
- ✅ 45 memory tests
- ✅ 40 scanner tests
- ✅ 3 integration tests

---

**This reference covers all public APIs. For internal functions, see source code.**
