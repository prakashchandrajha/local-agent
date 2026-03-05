# 🗺️ Scanner System

**Project Context Scanner** - Deep dive into project mapping.

---

## 📖 Overview

The Scanner System creates and maintains a complete map of your project:
- **File inventory** - All code files
- **Import tracking** - Dependencies between files
- **Structure extraction** - Functions, classes, exports
- **Change detection** - What's modified recently
- **Language mapping** - Files by type

---

## 🗂️ Storage Structure

### File: `project_map.json`

**Format:** JSON object

```json
{
  "files": [
    "agent.js",
    "calculator.js",
    "tools/file.js",
    "tools/memory.js",
    "tools/scanner.js"
  ],
  "recentlyModified": [
    "agent.js",
    "tools/scanner.js"
  ],
  "imports": {
    "agent.js": [
      "tools/file.js",
      "tools/memory.js",
      "tools/scanner.js"
    ],
    "tools/memory.js": [
      "tools/file.js"
    ]
  },
  "languages": {
    "js": [
      "agent.js",
      "calculator.js",
      "tools/file.js",
      "tools/memory.js",
      "tools/scanner.js"
    ]
  },
  "structures": {
    "agent.js": {
      "functions": [
        "run",
        "buildSystemPrompt",
        "callLLM"
      ],
      "classes": [],
      "exports": []
    }
  },
  "lastScan": "2026-03-05T13:30:00.000Z",
  "scanDuration": 8
}
```

### File: `file_hashes.json`

**Format:** JSON object

```json
{
  "agent.js": "abc123def456...",
  "calculator.js": "789ghi012jkl...",
  "tools/file.js": "mno345pqr678...",
  "tools/memory.js": "stu901vwx234...",
  "tools/scanner.js": "yz567abc890def..."
}
```

**Purpose:** Change detection for quick refresh

---

## 🔧 Core Operations

### 1. Full Project Scan

```javascript
const map = scanner.scanProject();
```

**What happens:**
1. Walk entire directory tree
2. Skip ignored dirs (node_modules, .git)
3. For each file:
   - Check extension
   - Read content
   - Generate hash
   - Extract imports
   - Extract structures
   - Track language
4. Save caches
5. Return complete map

**Time:** ~10ms for 8 files

---

### 2. Load from Cache

```javascript
const map = scanner.loadProjectMap();
// Uses cached project_map.json
// Auto-scans if cache doesn't exist
```

**Time:** <1ms (just JSON parse)

---

### 3. Quick Refresh

```javascript
const map = scanner.quickRefresh();
```

**What happens:**
1. Load old hashes
2. Scan files
3. For each file:
   - Hash matches → Skip (use cached data)
   - Hash differs → Full re-scan
4. Merge unchanged cached data
5. Return updated map

**Time:** ~2ms (4x faster than full scan)

---

### 4. Targeted File Scan

```javascript
const result = scanner.scanFiles([
  "agent.js",
  "tools/memory.js"
]);
```

**What happens:**
1. Scan only specified files
2. Extract imports and structures
3. Return partial map

**Use case:** After editing specific files

---

## 📊 Map Structure

### Files Array

```json
"files": [
  "agent.js",
  "calculator.js",
  "tools/file.js"
]
```

**Purpose:** Complete file inventory

---

### Recently Modified

```json
"recentlyModified": [
  "agent.js",
  "tools/scanner.js"
]
```

**Criteria:** Modified in last 24 hours

**Purpose:** Quick access to active files

---

### Imports Map

```json
"imports": {
  "agent.js": [
    "tools/file.js",
    "tools/memory.js",
    "tools/scanner.js"
  ]
}
```

**Detected patterns:**
- ES6: `import x from 'path'`
- CommonJS: `require('path')`
- Dynamic: `import('path')`

**Purpose:** Dependency tracking

---

### Languages Map

```json
"languages": {
  "js": ["agent.js", "calculator.js"],
  "ts": ["utils.ts"],
  "py": ["script.py"]
}
```

**Supported extensions:**
- `.js`, `.ts`, `.jsx`, `.tsx`
- `.py`
- `.php`
- `.rb`
- `.go`
- `.rs`
- `.java`

---

### Structures Map

```json
"structures": {
  "agent.js": {
    "functions": [
      "run",
      "buildSystemPrompt",
      "callLLM"
    ],
    "classes": [],
    "exports": []
  }
}
```

**Detected patterns:**
- `function name() {}`
- `const name = () => {}`
- `class Name {}`
- `export { ... }`

**Purpose:** Quick function lookup

---

## 🔍 Dependency Analysis

### Get Dependents

```javascript
const dependents = scanner.getDependents("tools/file.js");
// Returns: ["agent.js"]
```

**Purpose:** Find files that import this file

**Use case:** Before refactoring, check what will break

---

### Get Import Tree

```javascript
const tree = scanner.getImportTree("agent.js");
// Returns: [
//   "tools/file.js",
//   "tools/memory.js",
//   "tools/scanner.js"
// ]
```

**Purpose:** Get all transitive dependencies

**Use case:** Understand full dependency chain

---

### Get File Structures

```javascript
const structures = scanner.getFileStructures("agent.js");
// Returns: {
//   functions: ["run", "buildSystemPrompt", ...],
//   classes: [],
//   exports: []
// }
```

**Purpose:** Quick function/class lookup

---

## 🎯 Context Injection

### Build Context for LLM

```javascript
const context = scanner.buildContextInjection("agent.js");
```

**Returns:**
```
📁 Active file: agent.js
   Functions: run, buildSystemPrompt, callLLM...
   Imports (3): tools/file.js, tools/memory.js, tools/scanner.js
   Dependents (0):
```

**Purpose:** Inject into LLM prompt for awareness

**Used by:** Agent when working on a file

---

## ⚙️ Configuration

### Supported Extensions

```javascript
// tools/scanner.js
const SUPPORTED_EXTENSIONS = [
  ".js", ".ts", ".jsx", ".tsx",
  ".py", ".php", ".rb", ".go", ".rs", ".java"
];
```

### Skip Directories

```javascript
const SKIP_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".qwen",
  "logs"
];
```

### Recent Threshold

```javascript
const RECENT_THRESHOLD = 24 * 60 * 60 * 1000;  // 24 hours
```

---

## 🔐 Change Detection

### Hash Generation

```javascript
const hash = scanner.generateFileHash(content);
// Returns: MD5 hash (32 characters)
```

**Purpose:** Detect file changes

---

### Change Detection

```javascript
const changes = scanner.detectChanges(oldHashes, newHashes);
// Returns: {
//   changed: ["agent.js"],
//   added: ["new-file.js"],
//   removed: ["deleted-file.js"]
// }
```

**Purpose:** Track what changed between scans

---

## 🚀 Performance

### Operation Speeds

| Operation | Time | Files |
|-----------|------|-------|
| Full scan | ~10ms | 8 |
| Quick refresh | ~2ms | 8 |
| Load cache | <1ms | Any |
| Get dependents | <1ms | Any |
| Get import tree | <1ms | Any |
| Context injection | <1ms | Any |

### Scaling

| Files | Full Scan | Quick Refresh |
|-------|-----------|---------------|
| 10 | ~15ms | ~3ms |
| 50 | ~50ms | ~5ms |
| 100 | ~100ms | ~10ms |
| 500 | ~500ms | ~25ms |

---

## 💡 Usage Patterns

### Pattern 1: Startup Initialization

```javascript
// On agent startup
const projectMap = scanner.loadProjectMap();
console.log(`Loaded ${projectMap.files.length} files`);
```

### Pattern 2: Manual Refresh

```javascript
// After external file changes
const map = scanner.scanProject();
console.log(`Scanned ${map.files.length} files in ${map.scanDuration}ms`);
```

### Pattern 3: Quick Update

```javascript
// Fast refresh (unchanged files skipped)
const map = scanner.quickRefresh();
console.log(`Quick refresh: ${map.scanDuration}ms`);
```

### Pattern 4: Dependency Check

```javascript
// Before refactoring a file
const dependents = scanner.getDependents("utils.js");
if (dependents.length > 0) {
  console.log("Warning: These files depend on utils.js:");
  console.log(dependents.join(", "));
}
```

### Pattern 5: Context Injection

```javascript
// Before LLM works on a file
const context = scanner.buildContextInjection(file, projectMap);
prompt += context;
```

---

## 🧪 Import Detection

### Supported Import Styles

**ES6 Imports:**
```javascript
import foo from 'foo';
import { bar } from 'bar';
import * as baz from 'baz';
```

**CommonJS Requires:**
```javascript
const foo = require('foo');
const { bar } = require('bar');
```

**Dynamic Imports:**
```javascript
const module = await import('module');
```

**Relative Paths Only:**
```javascript
import x from './local-file';  // ✅ Tracked
import y from 'npm-package';   // ❌ Skipped (node_modules)
```

---

## 🔬 Structure Extraction

### Function Detection

```javascript
// Regular functions
function myFunction() {}
async function asyncFunction() {}

// Arrow functions
const arrow = () => {};
const asyncArrow = async () => {};

// Exported functions
export function exported() {}
export const exportedArrow = () => {};
```

### Class Detection

```javascript
// Regular classes
class MyClass {}

// Exported classes
export class ExportedClass {}
```

### Export Detection

```javascript
// Named exports
export { foo, bar };

// Default exports
export default something;

// Inline exports
export const x = 1;
```

---

## 🐛 Troubleshooting

### Problem: Scanner slow

**Solution:**
```bash
# Delete cache and rescan
rm project_map.json file_hashes.json
node -e "require('./tools/scanner').scanProject()"
```

### Problem: Imports not detected

**Check:**
- Import uses relative path (`./file`)
- File extension is `.js` or `.ts`
- Import syntax is valid

### Problem: Structures missing

**Solution:**
```javascript
// Force full scan (not quick refresh)
const map = scanner.scanProject(scanner.PROJECT_ROOT, false);
```

### Problem: Cache stale

**Solution:**
```javascript
// Full rescan
const map = scanner.loadProjectMap(true);  // true = force refresh
```

---

## 📝 Best Practices

### Do ✅
- Run `scan` after external file changes
- Use quick refresh for speed
- Check dependents before refactoring
- Let agent auto-inject context

### Don't ❌
- Don't manually edit cache files
- Don't skip scanning new files
- Don't ignore import warnings
- Don't delete hash cache

---

## 🔮 Future Enhancements

### Planned
- [ ] TypeScript support (full parsing)
- [ ] Python import tracking
- [ ] Circular dependency detection
- [ ] Import graph visualization

### Ideas
- [ ] Semantic code search
- [ ] Automatic documentation
- [ ] Dead code detection
- [ ] Performance profiling

---

## 🧪 Testing

### Test Scanner Operations

```bash
node tests/test_all.js
```

**Tests cover:**
- ✅ Full project scan
- ✅ Cache file creation
- ✅ Load from cache
- ✅ Import detection
- ✅ Dependency analysis
- ✅ Structure extraction
- ✅ Context injection
- ✅ Quick refresh
- ✅ File hashing
- ✅ Change detection
- ✅ Targeted scanning

---

## 📊 Example Output

### Full Scan Output

```
🔍 Scanning project...
✅ Project scan complete
   Files: 8
   Recently modified: 8
   Languages: js
   Duration: 8ms
   Map saved to: project_map.json
```

### Quick Refresh Output

```
⚡ Quick refresh (changed files only)...
📦 Loaded cached project map
🔍 Scanning project...
✅ Project scan complete (Δ: 0 changed, 0 added, 0 removed)
   Files: 8
   Recently modified: 8
   Languages: js
   Duration: 2ms
   Map saved to: project_map.json
```

---

**The scanner is your project's eyes - it sees everything!** 👁️
