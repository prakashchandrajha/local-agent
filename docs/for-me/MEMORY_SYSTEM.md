# 🧠 Memory System

**Persistent Fix Memory** - Deep dive into how memory works.

---

## 📖 Overview

The Memory System permanently stores all code changes made by the agent, enabling:
- **Learning from past fixes**
- **Context-aware suggestions**
- **Pattern recognition**
- **Knowledge accumulation**

---

## 🗂️ Storage Structure

### File: `persistent_memory.jsonl`

**Format:** JSON Lines (one JSON object per line)

```json
{"id":"uuid-1","timestamp":"2026-03-05T13:00:00.000Z","file":"calculator.js","function":"add","change_type":"bug_fix","description":"Added null check","diff":{"before":"...","after":"..."},"tags":["js","bug_fix"],"hash":"abc123"}
{"id":"uuid-2","timestamp":"2026-03-05T14:00:00.000Z","file":"utils.js","function":"validate","change_type":"feature","description":"Added validation","diff":{"before":"...","after":"..."},"tags":["js","feature"],"hash":"def456"}
```

**Why JSONL?**
- ✅ Append-only (fast writes)
- ✅ Line-by-line reading
- ✅ Easy to parse
- ✅ Git-diff friendly

### File: `memory_index.json`

**Format:** JSON object with indices

```json
{
  "byFile": {
    "calculator.js": ["hash-1", "hash-2"],
    "utils.js": ["hash-3"]
  },
  "byFunction": {
    "add": ["hash-1"],
    "validate": ["hash-3"]
  },
  "byTag": {
    "js": ["hash-1", "hash-3"],
    "bug_fix": ["hash-1"]
  },
  "byHash": {
    "hash-1": {"file": "calculator.js", "function": "add", "timestamp": "..."}
  }
}
```

**Purpose:** Fast lookups without scanning entire memory

---

## 🔧 Core Operations

### 1. Add Fix

```javascript
memory.addFix(
  file,           // "calculator.js"
  func,           // "add"
  description,    // "Added null check"
  codeBefore,     // "function add(a, b) { return a + b; }"
  codeAfter,      // "function add(a, b) { if (!a) throw Error(); return a + b; }"
  changeType,     // "bug_fix" | "feature" | "improvement" | "refactor"
  tags            // ["js", "validation"]
);
```

**What happens:**
1. Create entry with UUID
2. Generate diff
3. Calculate hash
4. Append to JSONL file
5. Update all indices
6. Enforce max entries limit

---

### 2. Find Relevant Fixes

```javascript
memory.findRelevantFixes({
  file: "calculator",      // Partial match
  function: "add",         // Partial match
  tags: ["bug_fix"],       // Must match all
  changeType: "bug_fix",   // Exact match
  limit: 10                // Max results
});
```

**What happens:**
1. Query indices (fast)
2. Intersect results
3. Load full entries
4. Sort by recency
5. Apply limit

---

### 3. Auto-Record Change

```javascript
memory.autoRecordChange(
  file,           // "calculator.js"
  oldContent,     // Full file content before
  newContent,     // Full file content after
  description     // Optional description
);
```

**What happens:**
1. Check if content actually changed
2. Detect changed functions (regex)
3. Auto-generate tags from file extension
4. Call `addFix()` with detected info

**Function Detection:**
```javascript
// Matches:
function name() {}
const name = () => {}
const name = async () => {}
class Name {}
```

---

### 4. Get Context Suggestions

```javascript
memory.getContextSuggestions(
  file,           // "calculator.js"
  functionName    // Optional: "add"
);
```

**Returns:**
```javascript
[
  {
    file: "calculator.js",
    function: "add",
    description: "Added null check",
    tags: ["js", "bug_fix"],
    diff: { before: "...", after: "..." }
  }
]
```

**Used by:** Agent when working on a file

---

## 📊 Entry Structure

### Complete Entry Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-05T13:30:00.000Z",
  "file": "tools/calculator.js",
  "function": "add",
  "change_type": "bug_fix",
  "description": "Added null and type checking for parameters",
  "diff": {
    "before": "function add(a, b) {\n  return a + b;\n}",
    "after": "function add(a, b) {\n  if (typeof a !== 'number') throw new Error('a must be number');\n  if (typeof b !== 'number') throw new Error('b must be number');\n  return a + b;\n}"
  },
  "tags": ["js", "bug_fix", "validation", "critical"],
  "hash": "d41d8cd98f00b204e9800998ecf8427e"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `timestamp` | ISO Date | When fix was made |
| `file` | String | Relative file path |
| `function` | String | Function name |
| `change_type` | Enum | Type of change |
| `description` | String | Human-readable summary |
| `diff` | Object | Before/after code |
| `tags` | Array | Categorization tags |
| `hash` | MD5 | Entry fingerprint |

---

## 🔍 Search & Retrieval

### By File

```javascript
memory.findRelevantFixes({ file: "calculator" });
// Matches: calculator.js, tools/calculator.js, test-calculator.js
```

### By Function

```javascript
memory.findRelevantFixes({ function: "add" });
// Matches: add, addition, addToCart, etc.
```

### By Tags

```javascript
memory.findRelevantFixes({ tags: ["bug_fix", "validation"] });
// Must match ALL tags
```

### By Change Type

```javascript
memory.findRelevantFixes({ changeType: "bug_fix" });
// Exact match only
```

### By Code Content

```javascript
memory.searchByCode(
  "return a + b",    // Code snippet
  "after",           // Search in: "before" | "after" | "both"
  10                 // Max results
);
```

---

## 🛠️ Advanced Operations

### Update Entry

```javascript
memory.updateEntry(entryId, {
  description: "Updated description",
  tags: ["new", "tags"]
});
```

### Delete Entry

```javascript
memory.deleteEntry(entryId);
// Returns: true/false
```

### Get Entry by ID

```javascript
const entry = memory.getEntryById(entryId);
```

### Export Memory

```javascript
memory.exportMemory("backup.json");
// Exports all entries to portable JSON
```

### Import Memory

```javascript
memory.importMemory("backup.json", true);
// true = merge with existing
// false = replace all
```

---

## 📈 Memory Statistics

```javascript
const stats = memory.getStats();
```

**Returns:**
```javascript
{
  totalEntries: 45,
  uniqueFiles: 12,
  uniqueFunctions: 28,
  byType: {
    "bug_fix": 30,
    "feature": 10,
    "improvement": 5
  },
  topTags: [
    { tag: "js", count: 40 },
    { tag: "bug_fix", count: 30 },
    { tag: "validation", count: 15 }
  ]
}
```

---

## ⚙️ Configuration

### Max Entries

```javascript
// tools/memory.js
const MAX_ENTRIES = 1000;  // Prevents unbounded growth
```

**Behavior:** When limit reached, oldest entries are removed

### File Locations

```javascript
const MEMORY_FILE = "persistent_memory.jsonl";
const INDEX_FILE = "memory_index.json";
```

---

## 🔐 Data Integrity

### Hashing

Each entry is hashed for:
- Quick lookup
- Deduplication
- Integrity verification

```javascript
const hash = crypto
  .createHash("md5")
  .update(`${file}:${function}:${timestamp}`)
  .digest("hex");
```

### Index Updates

All indices are updated atomically:
1. Remove old index entries (if updating)
2. Write new entry to JSONL
3. Add new index entries

### Error Handling

```javascript
try {
  memory.addFix(...);
} catch (err) {
  // Entry not saved, no corruption
  console.error("Memory save failed:", err);
}
```

---

## 🚀 Performance

### Operation Speeds

| Operation | Time | Notes |
|-----------|------|-------|
| `addFix()` | ~5ms | Includes disk write |
| `findRelevantFixes()` | <1ms | Indexed lookup |
| `getContextSuggestions()` | <1ms | Indexed + sorted |
| `searchByCode()` | ~10ms | Linear scan |
| `getStats()` | ~2ms | Aggregation |

### Scaling

| Entries | Add | Find | Search |
|---------|-----|------|--------|
| 100 | 5ms | <1ms | 5ms |
| 1000 | 5ms | <1ms | 50ms |
| 10000 | 5ms | 1ms | 500ms |

---

## 💡 Usage Patterns

### Pattern 1: Manual Recording

```javascript
// After making a change manually
memory.addFix(
  "calculator.js",
  "divide",
  "Added division by zero check",
  oldCode,
  newCode,
  "bug_fix",
  ["js", "validation"]
);
```

### Pattern 2: Automatic Recording

```javascript
// Let agent record automatically
// (Happens after every agent write)
memory.autoRecordChange(
  "calculator.js",
  oldContent,
  newContent,
  "User-requested improvement"
);
```

### Pattern 3: Context-Aware Editing

```javascript
// Before editing a file
const suggestions = memory.getContextSuggestions("calculator.js");

if (suggestions.length > 0) {
  console.log("Past fixes in this file:");
  suggestions.forEach(s => {
    console.log(`- ${s.function}: ${s.description}`);
  });
}
```

### Pattern 4: Learning from History

```javascript
// Find all bug fixes in validation
const fixes = memory.findRelevantFixes({
  tags: ["bug_fix", "validation"],
  limit: 5
});

fixes.forEach(fix => {
  console.log(`${fix.file}:${fix.function}`);
  console.log(`  ${fix.description}`);
  console.log(`  Before: ${fix.diff.before}`);
  console.log(`  After: ${fix.diff.after}`);
});
```

---

## 🧪 Testing

### Test Memory Operations

```bash
node tests/test_all.js
```

**Tests cover:**
- ✅ Add fix entry
- ✅ Find by file/function/tags
- ✅ Get entry by ID
- ✅ Update entry
- ✅ Delete entry
- ✅ Search by code
- ✅ Get statistics
- ✅ Auto-record change
- ✅ Context suggestions
- ✅ Export/Import

---

## 🐛 Troubleshooting

### Problem: Memory not saving

**Check:**
```bash
# File permissions
ls -la persistent_memory.jsonl

# Should be writable
chmod 644 persistent_memory.jsonl
```

### Problem: Memory growing too large

**Solution:**
```javascript
// Reduce max entries
// tools/memory.js
const MAX_ENTRIES = 500;  // Was 1000
```

### Problem: Slow lookups

**Solution:**
```bash
# Rebuild index
rm memory_index.json
# Restart agent - index rebuilds automatically
```

### Problem: Corrupted memory

**Recovery:**
```javascript
// Export what you can
memory.exportMemory("backup.json");

// Clear and start fresh
fs.unlinkSync("persistent_memory.jsonl");
fs.unlinkSync("memory_index.json");

// Import good entries
memory.importMemory("backup.json", false);
```

---

## 📝 Best Practices

### Do ✅
- Record every fix
- Use descriptive tags
- Export before major changes
- Check context before editing

### Don't ❌
- Don't delete JSONL file manually
- Don't edit index file directly
- Don't store sensitive data
- Don't ignore max entries limit

---

## 🔮 Future Enhancements

### Planned
- [ ] Semantic search (code similarity)
- [ ] Automatic tagging
- [ ] Memory compression
- [ ] Selective forgetting

### Ideas
- [ ] Team memory sharing
- [ ] Cloud sync
- [ ] Memory analytics dashboard
- [ ] Suggestion ranking

---

**The memory system is the brain of your agent - it learns from every fix!** 🧠
