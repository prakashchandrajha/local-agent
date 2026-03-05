# 👤 User Guide

**For the Developer** - Setup, usage, and examples.

---

## 🚀 Quick Start

### 1. Start the Agent

```bash
node agent.js
```

You'll see:
```
🤖 Agent ready!
   Commands: 'exit' · 'history' · 'clear' · 'memory' · 'scan'

🔄 Loading project context...
   📁 8 files indexed
   🕐 8 recently modified
```

### 2. Give Commands

```
You: create a calculator with add and subtract functions

🤔 Thinking...

✅ Written: calculator.js
```

### 3. Follow Up

```
You: now add multiply and divide

🤔 Thinking...

✅ Written: calculator.js
```

---

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `exit` | Close the agent |
| `history` | View conversation history |
| `clear` | Clear conversation memory |
| `memory` | View persistent memory stats |
| `scan` | Refresh project context |

---

## 🎯 What This System Does

### Before (Without This System)
- LLM has no memory of past fixes
- LLM doesn't know your project structure
- Every session starts from zero
- Repeats same mistakes

### After (With This System)
- ✅ Remembers ALL past fixes forever
- ✅ Knows your entire project structure
- ✅ Understands file dependencies
- ✅ Learns from your coding patterns

---

## 🧠 Two Smart Systems

### 1. Persistent Memory

**What it does:**
- Records every code change
- Stores: file, function, before/after, tags
- Auto-retrieves relevant fixes when you work on a file

**Example:**
```
You fix a null pointer in calculator.js

→ Memory stores:
  - File: calculator.js
  - Function: add
  - Change: Added null check
  - Tags: js, bug_fix

Next time you edit calculator.js:
→ Agent suggests: "Last time you fixed null pointer here"
```

### 2. Project Scanner

**What it does:**
- Scans all files in your project
- Detects imports/requires
- Maps function and class names
- Tracks dependencies

**Example:**
```
Agent knows:
- agent.js imports tools/file.js, tools/memory.js
- tools/memory.js has 21 functions
- 3 files depend on tools/file.js

When you edit agent.js:
→ Agent knows exactly what you're working with
```

---

## 💡 Usage Examples

### Example 1: Bug Fix

```
You: fix the bug in demodemo.js addition function

🤔 Thinking...

[Agent reads demodemo.js]
[Agent checks memory for similar fixes]
[Agent sees project context]

✅ Written: demodemo.js
💾 Memory saved: demodemo.js:addition (bug_fix)
```

### Example 2: New Feature

```
You: add a power function to calculator.js

🤔 Thinking...

[Agent reads calculator.js]
[Agent sees existing functions]

✅ Written: calculator.js

// Now has: add, subtract, multiply, divide, power
```

### Example 3: Refactoring

```
You: refactor the file operations into separate functions

🤔 Thinking...

[Agent reads file.js]
[Agent plans multiple functions]

✅ Written: tools/file.js

// Now has: readFile, writeFile, listFiles, deleteFile
```

### Example 4: Code Review

```
You: check if agent.js has any issues

🤔 Thinking...

[Agent reads agent.js]
[Agent analyzes structure]

🤖 I found 3 potential improvements:
1. Error handling in callLLM could be better
2. MAX_RETRIES is hardcoded, could be config
3. No timeout on axios requests
```

---

## 🔄 Project Context Commands

### Manual Scan

When you make changes outside the agent:

```
You: scan

🔄 Refreshing project context...
Perform full rescan? (recommended after major changes) (Y/n)
```

**Options:**
- `Y` - Full rescan (10 seconds)
- `n` → Quick refresh (2 seconds)

### When to Scan

| Situation | Action |
|-----------|--------|
| Agent startup | Automatic |
| You edit files manually | Run `scan` |
| New files added | Run `scan` |
| Files deleted | Run `scan` |
| Just using agent | No action needed |

---

## 📊 Memory Management

### View Memory Stats

```
You: memory

📊 Persistent Memory Statistics:
─────────────────────────────────────────
Total entries: 15
Unique files: 5
Unique functions: 12
By type: {"bug_fix": 10, "feature": 5}
Top tags: js, bug_fix, improvement, feature
─────────────────────────────────────────
```

### Export Memory (Backup)

```javascript
// In Node.js
const memory = require('./tools/memory');
memory.exportMemory('backup.json');
```

### Import Memory (Restore)

```javascript
memory.importMemory('backup.json', true); // true = merge
```

---

## 🗂️ File Structure

```
project/
├── agent.js              # Main agent
├── tools/
│   ├── file.js          # File operations
│   ├── memory.js        # Persistent memory
│   └── scanner.js       # Project scanner
├── docs/                # Documentation
│   ├── README.md        # This index
│   ├── AGENT_GUIDE.md   # For the AI
│   ├── USER_GUIDE.md    # For you
│   └── ...
├── tests/               # Test suite
│   └── test_all.js
├── persistent_memory.jsonl  # Fix history
├── project_map.json     # Project structure
└── file_hashes.json     # Change detection
```

---

## ⚙️ Configuration

### Agent Config (agent.js)

```javascript
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";
const MAX_RETRIES = 3;          // Retry attempts
const MAX_HISTORY = 20;         // Conversation turns
const DEBUG = false;            // Show raw LLM responses
const USE_MEMORY = true;        // Enable memory
```

### Memory Config (tools/memory.js)

```javascript
const MAX_ENTRIES = 1000;  // Max memory entries
```

### Scanner Config (tools/scanner.js)

```javascript
const SUPPORTED_EXTENSIONS = [".js", ".ts", ".py", ".php"];
const SKIP_DIRS = ["node_modules", ".git", "dist"];
const RECENT_THRESHOLD = 24 * 60 * 60 * 1000;  // 24 hours
```

---

## 🧪 Testing

### Run All Tests

```bash
node tests/test_all.js
```

**Expected output:**
```
🎉 ALL TESTS PASSED! SYSTEM READY!
```

### Test Coverage

- ✅ 45 memory tests
- ✅ 40 scanner tests
- ✅ 3 integration tests
- **Total:** 88 tests

---

## 🐛 Troubleshooting

### Problem: Agent doesn't start

```bash
# Check Ollama is running
ollama list

# Check model exists
ollama pull deepseek-coder:6.7b
```

### Problem: Memory not saving

```bash
# Check file permissions
ls -la persistent_memory.jsonl

# Should be writable
chmod 644 persistent_memory.jsonl
```

### Problem: Scanner slow

```bash
# Delete cache and rescan
rm project_map.json file_hashes.json
node -e "require('./tools/scanner').scanProject()"
```

### Problem: Tests failing

```bash
# Clear test data
rm persistent_memory.jsonl project_map.json file_hashes.json

# Re-run tests
node tests/test_all.js
```

---

## 📈 Performance Tips

1. **Use quick refresh** - `quickRefresh()` is 4x faster
2. **Scan only when needed** - Auto-scan on startup is enough
3. **Limit memory** - `MAX_ENTRIES = 1000` prevents bloat
4. **Export regularly** - Backup memory before major changes

---

## 🎓 Learning More

| Want to learn... | Read... |
|------------------|---------|
| How agent works | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Memory internals | [`MEMORY_SYSTEM.md`](./MEMORY_SYSTEM.md) |
| Scanner details | [`SCANNER_SYSTEM.md`](./SCANNER_SYSTEM.md) |
| API reference | [`API_REFERENCE.md`](./API_REFERENCE.md) |

---

## 💬 Best Practices

### Do ✅
- Run `scan` after manual file changes
- Check `memory` stats occasionally
- Export memory before big refactors
- Use clear, specific commands

### Don't ❌
- Don't edit files while agent is working
- Don't delete `.jsonl` or `.json` cache files
- Don't use vague commands like "fix everything"
- Don't ignore scan prompts after external changes

---

## 🆘 Getting Help

1. Check [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
2. View memory stats: `memory` command
3. Check logs with `DEBUG = true`
4. Review test output for errors

---

## 🎉 Success Indicators

You'll know it's working when:

- ✅ Agent remembers past fixes
- ✅ Agent knows your file structure
- ✅ Agent suggests relevant solutions
- ✅ Tests all pass
- ✅ Memory grows over time

---

**Happy coding!** 🚀
