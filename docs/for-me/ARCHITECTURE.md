# 🏗️ Architecture

**System Design & Data Flow** - How everything fits together.

---

## 📊 High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     YOU (Developer)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENT (agent.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Conversation │  │    Memory    │  │   Scanner    │      │
│  │   History    │  │   Context    │  │   Context    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│    Ollama    │   │  File System │   │  LLM Model   │
│   (Local)    │   │   (Project)  │   │  (Response)  │
└──────────────┘   └──────────────┘   └──────────────┘
```

---

## 🔄 Core Data Flow

### 1. Startup Flow

```
1. agent.js starts
        │
        ▼
2. Load README.md (custom instructions)
        │
        ▼
3. Initialize Project Context
   ┌─────────────────────────┐
   │ scanner.loadProjectMap()│
   └─────────────────────────┘
        │
        ├─► Load project_map.json (cached)
        │   └─► If not exists: Full scan
        │
        └─► Build file map
            ├─ Files list
            ├─ Imports map
            ├─ Languages map
            └─ Structures map
        │
        ▼
4. Agent ready for input
```

### 2. User Request Flow

```
User: "fix the bug in calculator.js"
        │
        ▼
1. Remember user input (conversation history)
        │
        ▼
2. Build enhanced system prompt
   ├─ Base system prompt
   ├─ Memory context (if working on file)
   └─ Project context (if working on file)
        │
        ▼
3. Call LLM (Ollama)
        │
        ▼
4. Parse LLM response
   ├─ TOOL: read_file
   ├─ TOOL: write_file
   └─ TOOL: chat
        │
        ▼
5. Execute operations
   ├─ Read file → Inject content → Ask LLM to act
   └─ Write file → Record in memory → Done
        │
        ▼
6. Remember assistant response
        │
        ▼
7. Check if follow-up needed
   ├─ Yes → Continue loop
   └─ No → Wait for next user input
```

### 3. Memory Recording Flow

```
After writing a file:
        │
        ▼
1. Compare old vs new content
        │
        ▼
2. Detect changed functions
   ├─ Parse function declarations
   ├─ Parse arrow functions
   └─ Parse class declarations
        │
        ▼
3. Create memory entry
   ├─ ID (UUID)
   ├─ Timestamp
   ├─ File path
   ├─ Function name
   ├─ Change type
   ├─ Description
   ├─ Diff (before/after)
   └─ Tags (auto-generated)
        │
        ▼
4. Save to persistent_memory.jsonl
        │
        ▼
5. Update indices
   ├─ byFile
   ├─ byFunction
   ├─ byTag
   └─ byHash
```

### 4. Project Scanning Flow

```
Full Scan:
        │
        ▼
1. Walk directory tree
   └─ Skip: node_modules, .git, dist
        │
        ▼
2. For each file:
   ├─ Check extension (.js, .ts, .py...)
   ├─ Read content
   ├─ Generate hash (MD5)
   ├─ Extract imports
   ├─ Extract structures
   └─ Track language
        │
        ▼
3. Save caches
   ├─ project_map.json (structure)
   └─ file_hashes.json (change detection)
        │
        ▼
4. Return project map

Quick Refresh:
        │
        ▼
1. Load old hashes
        │
        ▼
2. Scan files
   ├─ Hash matches → Skip (use cached data)
   └─ Hash differs → Re-scan fully
        │
        ▼
3. Merge with unchanged cached data
        │
        ▼
4. Return updated map
```

---

## 🗂️ Component Architecture

### Agent (agent.js)

```
┌─────────────────────────────────────────┐
│              AGENT LOOP                  │
├─────────────────────────────────────────┤
│  1. Load Readme                          │
│  2. Initialize Context                   │
│  3. User Input Loop                      │
│     ├─ Parse commands                    │
│     ├─ Build prompt                      │
│     ├─ Call LLM                          │
│     ├─ Parse response                    │
│     ├─ Execute tools                     │
│     └─ Record memory                     │
│  4. Follow-up handling                   │
└─────────────────────────────────────────┘
```

### Memory System (tools/memory.js)

```
┌─────────────────────────────────────────┐
│           MEMORY SYSTEM                  │
├─────────────────────────────────────────┤
│  Storage: persistent_memory.jsonl        │
│  Index:   memory_index.json              │
│                                          │
│  Core Operations:                        │
│  ├─ addFix()                             │
│  ├─ findRelevantFixes()                  │
│  ├─ getEntryById()                       │
│  ├─ updateEntry()                        │
│  ├─ deleteEntry()                        │
│  ├─ exportMemory()                       │
│  └─ importMemory()                       │
│                                          │
│  Agent Helpers:                          │
│  ├─ autoRecordChange()                   │
│  └─ getContextSuggestions()              │
└─────────────────────────────────────────┘
```

### Scanner System (tools/scanner.js)

```
┌─────────────────────────────────────────┐
│           SCANNER SYSTEM                 │
├─────────────────────────────────────────┤
│  Storage: project_map.json               │
│  Index:   file_hashes.json               │
│                                          │
│  Core Operations:                        │
│  ├─ scanProject()                        │
│  ├─ loadProjectMap()                     │
│  ├─ quickRefresh()                       │
│  ├─ scanFiles()                          │
│  ├─ getDependents()                      │
│  ├─ getImportTree()                      │
│  └─ getFileStructures()                  │
│                                          │
│  Context Helpers:                        │
│  └─ buildContextInjection()              │
└─────────────────────────────────────────┘
```

---

## 📦 Data Structures

### Memory Entry

```json
{
  "id": "uuid-string",
  "timestamp": "2026-03-05T13:30:00.000Z",
  "file": "calculator.js",
  "function": "add",
  "change_type": "bug_fix",
  "description": "Added null check for parameters",
  "diff": {
    "before": "function add(a, b) { return a + b; }",
    "after": "function add(a, b) { if (!a || !b) throw Error(); return a + b; }"
  },
  "tags": ["js", "bug_fix", "validation"],
  "hash": "md5-hash-of-entry"
}
```

### Project Map

```json
{
  "files": ["agent.js", "calculator.js", ...],
  "recentlyModified": ["agent.js", ...],
  "imports": {
    "agent.js": ["tools/file.js", "tools/memory.js"]
  },
  "languages": {
    "js": ["agent.js", "calculator.js", ...]
  },
  "structures": {
    "agent.js": {
      "functions": ["run", "buildSystemPrompt", ...],
      "classes": [],
      "exports": []
    }
  },
  "lastScan": "2026-03-05T13:30:00.000Z",
  "scanDuration": 8
}
```

### File Hashes

```json
{
  "agent.js": "abc123def456...",
  "calculator.js": "789ghi012jkl...",
  ...
}
```

---

## 🔗 Dependencies

### Internal Dependencies

```
agent.js
├── tools/file.js
├── tools/memory.js
└── tools/scanner.js

tools/memory.js
└── (no internal deps)

tools/scanner.js
└── (no internal deps)
```

### External Dependencies

```
package.json
├── axios (HTTP client)
├── readline-sync (Interactive input)
├── fs (Built-in)
├── path (Built-in)
└── crypto (Built-in)
```

---

## ⚡ Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Full scan | ~10ms | 8 files, 700 lines |
| Quick refresh | ~2ms | Unchanged files skipped |
| Memory lookup | <1ms | Indexed by file/function |
| Context injection | <1ms | Pre-computed structures |
| LLM call | ~2-5s | Depends on model size |

### Scaling

| Files | Full Scan | Quick Refresh |
|-------|-----------|---------------|
| 10 | ~15ms | ~3ms |
| 50 | ~50ms | ~5ms |
| 100 | ~100ms | ~10ms |
| 500 | ~500ms | ~25ms |

---

## 🛡️ Safety Mechanisms

### File Operations
- ✅ Warns before overwriting
- ✅ Validates file paths
- ✅ Checks file existence
- ✅ Handles errors gracefully

### Memory Operations
- ✅ Max entries limit (1000)
- ✅ Hash-based deduplication
- ✅ Transaction-like updates
- ✅ Backup/export support

### Scanner Operations
- ✅ Skips node_modules, .git
- ✅ Handles read errors
- ✅ Caches aggressively
- ✅ Incremental updates

---

## 🔄 State Management

### Volatile State (RAM)

```javascript
// agent.js
conversationHistory  // Last 20 turns
projectMap          // Cached project structure
activeFile          // Currently edited file
```

### Persistent State (Disk)

```javascript
// Files
persistent_memory.jsonl  // All fix history
project_map.json        // Project structure
file_hashes.json        // Change detection
memory_index.json       // Fast lookups
```

---

## 🎯 Design Principles

1. **Incremental Updates** - Never rescan unchanged files
2. **Lazy Loading** - Load data only when needed
3. **Aggressive Caching** - Cache everything possible
4. **Context-Aware** - Inject only relevant information
5. **Memory-Efficient** - Limit history, prune old data
6. **Error-Resilient** - Continue working even if components fail

---

## 📈 Future Extensions

### Planned Improvements

- [ ] Git integration (diff tracking)
- [ ] Multi-language support (Python, PHP)
- [ ] Semantic search (code similarity)
- [ ] Auto-documentation generation
- [ ] Test generation from memory
- [ ] Performance profiling

### Possible Integrations

- [ ] GitHub/GitLab sync
- [ ] VS Code extension
- [ ] Web dashboard
- [ ] Cloud backup
- [ ] Team memory sharing

---

## 🔍 Debugging Flow

```
Issue reported
        │
        ▼
1. Check DEBUG flag
   └─ Set DEBUG = true in agent.js
        │
        ▼
2. Run with verbose output
   └─ See raw LLM responses
        │
        ▼
3. Check memory state
   └─ node -e "require('./tools/memory').getStats()"
        │
        ▼
4. Check scanner state
   └─ node -e "require('./tools/scanner').loadProjectMap()"
        │
        ▼
5. Run tests
   └─ node tests/test_all.js
```

---

**This architecture is optimized for:**
- ✅ Fast local LLM inference
- ✅ Minimal prompt bloat
- ✅ Maximum context awareness
- ✅ Persistent learning
- ✅ Easy extensibility
