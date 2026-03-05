# Quick Start: Persistent Memory

## 🚀 Test the Memory Module (2 minutes)

### 1. Run a Quick Test

```bash
node -e "
const memory = require('./tools/memory');

// Add a fix
memory.addFix(
  'src/math.js',
  'add',
  'Fixed addition bug',
  'return a - b;',
  'return a + b;',
  'bug_fix',
  ['math', 'critical']
);

// Find it
const results = memory.findRelevantFixes({ file: 'math.js' });
console.log('Found:', results.length, 'fixes');
console.log('Description:', results[0].description);

// Get stats
const stats = memory.getStats();
console.log('Total entries:', stats.totalEntries);
"
```

### 2. Start the Agent

```bash
node agent.js
```

### 3. Try These Commands

```
# View memory statistics
memory

# Create a file
create a file called test.js with a simple function

# Fix the file (it will record the change)
fix test.js to handle edge cases

# Check memory again
memory

# Exit
exit
```

### 4. Check the Storage Files

```bash
# View all recorded fixes (JSONL format)
cat persistent_memory.jsonl

# View the index (fast lookups)
cat memory_index.json
```

---

## 📊 Example Workflow

### Scenario: Fixing Multiple Bugs

1. **First Fix**
   ```
   You: create a file called calculator.js
   Agent: [creates file with basic functions]
   
   You: fix the divide function to handle division by zero
   Agent: [reads file, adds null check, writes updated version]
   💾 Memory saved: calculator.js:divide (bug_fix)
   ```

2. **Second Fix (Memory Activates)**
   ```
   You: fix the multiply function in calculator.js
   📚 RELEVANT PAST FIXES:
   [1] divide in calculator.js:
       Added null check for edge case
       Tags: bug_fix, js
   
   Agent: [sees past fix pattern, applies similar null check]
   💾 Memory saved: calculator.js:multiply (bug_fix)
   ```

3. **View Statistics**
   ```
   You: memory
   
   📊 Persistent Memory Statistics:
   ────────────────────────────────────────
   Total entries: 2
   Unique files: 1
   Unique functions: 2
   By type: {"bug_fix":2}
   Top tags: js, bug_fix
   ────────────────────────────────────────
   ```

---

## 🔧 Advanced Usage

### Manual Memory Operations

```javascript
const memory = require('./tools/memory');

// Search by code pattern
const results = memory.searchByCode('if (!value)', 'both', 5);

// Get specific entry
const entry = memory.getEntryById('uuid-here');

// Update tags
memory.updateEntry('uuid-here', { 
  tags: ['bug_fix', 'critical', 'null-check'] 
});

// Export for backup
memory.exportMemory('./backup.json');

// Import from backup
memory.importMemory('./backup.json', true);
```

### Disable Memory Temporarily

Edit `agent.js`:
```javascript
const USE_MEMORY = false;  // Disable memory recording
```

---

## 📁 File Structure

```
local-agent/
├── tools/
│   └── memory.js          # Core memory module
├── persistent_memory.jsonl # All fix entries
├── memory_index.json       # Fast lookup indices
├── MEMORY_USAGE.md         # Full documentation
└── QUICK_START_MEMORY.md   # This file
```

---

## 💡 Pro Tips

1. **Review memory regularly**: Use `memory` command to see patterns
2. **Tag consistently**: Add meaningful tags when describing fixes
3. **Export before cleanup**: Backup memory before deleting entries
4. **Use context**: Agent automatically shows relevant fixes when working on files
5. **Keep it lean**: Memory auto-deletes oldest entries when limit reached (default: 1000)

---

## ❓ Troubleshooting

**Q: Memory file not created?**
- A: Ensure you have write permissions in the project directory

**Q: Slow lookups?**
- A: Delete `memory_index.json` - it will regenerate automatically

**Q: Too many entries?**
- A: Reduce `MAX_ENTRIES` in `tools/memory.js` or use `deleteEntry()`

**Q: Can I edit entries manually?**
- A: Yes, but use `updateEntry()` to keep indices in sync

---

## 🎯 What's Next?

The memory module is **foundational** for:
- ✅ Learning from past fixes
- ✅ Pattern recognition across files
- ⏭️ Project context awareness (Step 2)
- ⏭️ Knowledge wrapper (Step 3)
- ⏭️ Speculative execution (Step 6)

Each fix makes your agent smarter! 🧠
