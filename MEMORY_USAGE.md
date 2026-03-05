# Persistent Memory Module - Usage Guide

## Overview

The **Persistent Memory** module provides vectorless, JSON-based storage for tracking code changes, bug fixes, and improvements across your project. It enables your agent to remember past fixes and retrieve relevant context when solving similar problems.

## Quick Start

```javascript
const memory = require('./tools/memory');
```

## Core Functions

### 1. Record a Fix

```javascript
const entry = memory.addFix(
  "src/utils/math.js",           // File path
  "calculateSum",                 // Function name
  "Fixed off-by-one error",       // Description
  "for (let i=0; i<=n; i++)",    // Code before
  "for (let i=0; i<n; i++)",     // Code after
  "bug_fix",                      // Type: bug_fix|improvement|refactor|feature
  ["loop", "math", "critical"]    // Tags (optional)
);
```

### 2. Find Relevant Fixes

```javascript
// Search by file
const fixes = memory.findRelevantFixes({ file: "math.js" });

// Search by function
const fixes = memory.findRelevantFixes({ function: "calculateSum" });

// Search by tags (must match all)
const fixes = memory.findRelevantFixes({ tags: ["bug_fix", "loop"] });

// Combined search with limit
const fixes = memory.findRelevantFixes({
  file: "utils",
  function: "sum",
  tags: ["bug_fix"],
  limit: 5
});
```

### 3. Get Context Suggestions

When working on a file, retrieve relevant past fixes:

```javascript
const suggestions = memory.getContextSuggestions(
  "src/utils/math.js",
  "calculateSum"  // optional
);

suggestions.forEach(s => {
  console.log(`${s.function}: ${s.description}`);
  console.log('Before:', s.diff.before);
  console.log('After:', s.diff.after);
});
```

### 4. Auto-Record Changes

Automatically detect and record changes after file writes:

```javascript
const oldContent = fs.readFileSync("file.js", "utf8");
// ... make changes ...
const newContent = "// updated code";

memory.autoRecordChange(
  "src/file.js",
  oldContent,
  newContent,
  "Fixed null pointer issue"  // optional description
);
```

### 5. Search by Code Content

Find fixes containing specific code patterns:

```javascript
// Search in code before fixes
const results = memory.searchByCode("for (let i=0;", "before", 10);

// Search in code after fixes
const results = memory.searchByCode("return null;", "after", 10);

// Search in both
const results = memory.searchByCode("if (!value)", "both", 10);
```

### 6. Manage Entries

```javascript
// Get by ID
const entry = memory.getEntryById("uuid-here");

// Update an entry
memory.updateEntry("uuid-here", {
  description: "Updated description",
  tags: ["new", "tags"]
});

// Delete an entry
memory.deleteEntry("uuid-here");
```

### 7. Statistics & Export

```javascript
// Get memory statistics
const stats = memory.getStats();
console.log(stats.totalEntries);
console.log(stats.byType);
console.log(stats.topTags);

// Export to JSON
memory.exportMemory("./backup.json");

// Import from JSON (merge or replace)
memory.importMemory("./backup.json", true);  // merge
memory.importMemory("./backup.json", false); // replace
```

## Integration with Agent

### Hook into File Writes

Modify your agent's file write operation:

```javascript
const { writeFile } = require('./tools/file');
const memory = require('./tools/memory');

// Before writing, store old content
const oldContent = fs.existsSync(fullPath) 
  ? fs.readFileSync(fullPath, 'utf8') 
  : '';

// Write the file
writeFile(op.path, op.content);

// Record the change
if (oldContent && oldContent !== op.content) {
  memory.autoRecordChange(
    op.path,
    oldContent,
    op.content,
    "Agent-applied fix"
  );
}
```

### Consult Memory Before Fixing

When encountering a bug, check past fixes:

```javascript
const suggestions = memory.getContextSuggestions(filePath, functionName);

if (suggestions.length > 0) {
  console.log("📚 Relevant past fixes:");
  suggestions.forEach(s => {
    console.log(`  - ${s.function}: ${s.description}`);
    console.log(`    Tags: ${s.tags.join(', ')}`);
  });
}
```

## Storage Format

Memory is stored in **JSONL** format (one JSON object per line) for efficient appending:

```jsonl
{"id":"uuid","timestamp":"2026-03-05T12:00:00.000Z","file":"src/math.js","function":"calculateSum","change_type":"bug_fix","description":"Fixed off-by-one","diff":{"before":"...","after":"..."},"tags":["loop","math"],"hash":"abc123"}
```

An index file (`memory_index.json`) provides fast lookups by file, function, and tags.

## Configuration

Edit these constants in `tools/memory.js`:

```javascript
const MEMORY_FILE = path.join(process.cwd(), "persistent_memory.jsonl");
const INDEX_FILE = path.join(process.cwd(), "memory_index.json");
const MAX_ENTRIES = 1000; // Auto-removes oldest when exceeded
```

## Best Practices

1. **Tag consistently** - Use tags like `bug_fix`, `improvement`, `refactor`, `null-check`, `off-by-one`
2. **Be specific** - Include clear descriptions of what was fixed
3. **Review periodically** - Use `getStats()` to understand patterns
4. **Export before cleanup** - Backup memory before major deletions
5. **Use auto-record** - Let the module detect changes automatically when possible

## Performance Notes

- **JSONL format**: Efficient for writes (append-only)
- **Index file**: O(1) lookups by file, function, or tag
- **Auto-compaction**: Removes oldest entries when limit reached
- **Memory usage**: Only loads entries when needed (not cached in memory)

## Troubleshooting

**Issue**: Memory file not created
- **Fix**: Ensure write permissions in project directory

**Issue**: Slow lookups
- **Fix**: Check index file exists; delete and regenerate if corrupted

**Issue**: Too many entries
- **Fix**: Reduce `MAX_ENTRIES` or manually delete old entries with `deleteEntry()`

## Example Workflow

```javascript
const memory = require('./tools/memory');

// 1. Before fixing, check past fixes
const context = memory.getContextSuggestions("src/auth.js", "validateToken");
if (context.length > 0) {
  console.log("Similar fixes found:", context.length);
}

// 2. Apply your fix manually or via agent
// ... fix applied ...

// 3. Record the fix automatically
const oldCode = fs.readFileSync("src/auth.js", "utf8");
// ... apply changes ...
const newCode = "// updated code";
fs.writeFileSync("src/auth.js", newCode);

memory.autoRecordChange(
  "src/auth.js",
  oldCode,
  newCode,
  "Fixed token validation edge case"
);

// 4. Verify it was saved
const stats = memory.getStats();
console.log("Total fixes recorded:", stats.totalEntries);
```

---

**Next Steps**: Integrate this module into `agent.js` to enable memory-driven problem solving.
