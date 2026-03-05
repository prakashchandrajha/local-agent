# 🎯 Project Overview

**Local LLM Agent with Persistent Memory & Project Context**

---

## 🚀 What This Is

A **smart coding assistant** powered by local LLM (Ollama) that:
- ✅ **Remembers** all your past code fixes forever
- ✅ **Knows** your entire project structure
- ✅ **Understands** file dependencies
- ✅ **Learns** from your coding patterns

---

## 📁 Project Structure

```
local-agent/
├── agent.js                    # Main agent loop
├── tools/
│   ├── file.js                # File operations (read/write/list)
│   ├── memory.js              # Persistent fix memory
│   └── scanner.js             # Project context scanner
├── tests/
│   ├── test_all.js            # Complete test suite (88 tests)
│   └── README.md              # Test documentation
├── docs/                      # Documentation folder
│   ├── README.md              # Doc index
│   ├── AGENT_GUIDE.md         # For the AI agent
│   ├── USER_GUIDE.md          # For you (developer)
│   ├── ARCHITECTURE.md        # System design
│   ├── MEMORY_SYSTEM.md       # Memory deep dive
│   ├── SCANNER_SYSTEM.md      # Scanner deep dive
│   ├── API_REFERENCE.md       # Function reference
│   ├── TESTING.md             # Testing guide
│   └── TROUBLESHOOTING.md     # Common issues
├── package.json               # Dependencies
├── README.md                  # Project readme
└── PROJECT_OVERVIEW.md        # This file
```

### Data Files (Auto-Generated)

```
├── persistent_memory.jsonl    # All code fixes (permanent)
├── project_map.json           # Project structure (cached)
├── file_hashes.json           # Change detection (cached)
└── memory_index.json          # Fast memory lookups (cached)
```

---

## 🎯 Key Features

### 1. Persistent Memory 🧠

**What it does:**
- Stores every code fix you make
- Auto-retrieves relevant fixes when editing
- Learns from your patterns

**Example:**
```
You fix a null pointer in calculator.js

→ Memory stores the fix
→ Next time you edit calculator.js
→ Agent suggests: "Last time you added null checks here"
```

---

### 2. Project Scanner 🗺️

**What it does:**
- Maps all files in your project
- Tracks imports/dependencies
- Extracts functions and classes
- Detects changes quickly

**Example:**
```
Agent knows:
- agent.js imports tools/file.js, tools/memory.js
- tools/memory.js has 21 functions
- 3 files depend on tools/file.js
```

---

### 3. Context Injection 💉

**What it does:**
- Injects relevant info into LLM prompts
- Keeps prompts small and focused
- Provides file awareness

**Example:**
```
📁 Active file: agent.js
   Functions: run, buildSystemPrompt, callLLM...
   Imports (3): tools/file.js, tools/memory.js, tools/scanner.js
```

---

## 🏃 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Ollama

```bash
ollama serve
ollama pull deepseek-coder:6.7b
```

### 3. Run Agent

```bash
node agent.js
```

### 4. Give Commands

```
You: create a calculator with add and subtract

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
| `memory` | View memory statistics |
| `scan` | Refresh project context |

---

## 🧪 Testing

### Run All Tests

```bash
node tests/test_all.js
```

**Expected:**
```
🎉 ALL TESTS PASSED! SYSTEM READY!
```

**Coverage:**
- ✅ 45 memory tests
- ✅ 40 scanner tests
- ✅ 3 integration tests

---

## 📖 Documentation

### For Quick Reference
- [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) - How to use
- [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) - Fix problems

### For Deep Understanding
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - System design
- [`docs/MEMORY_SYSTEM.md`](./docs/MEMORY_SYSTEM.md) - Memory internals
- [`docs/SCANNER_SYSTEM.md`](./docs/SCANNER_SYSTEM.md) - Scanner internals

### For Reference
- [`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md) - All functions
- [`docs/TESTING.md`](./docs/TESTING.md) - Testing guide
- [`docs/AGENT_GUIDE.md`](./docs/AGENT_GUIDE.md) - Agent capabilities

---

## ⚙️ Configuration

### Agent (agent.js)

```javascript
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "deepseek-coder:6.7b";
const MAX_RETRIES = 3;
const MAX_HISTORY = 20;
const DEBUG = false;
const USE_MEMORY = true;
```

### Memory (tools/memory.js)

```javascript
const MAX_ENTRIES = 1000;  // Max stored fixes
```

### Scanner (tools/scanner.js)

```javascript
const SUPPORTED_EXTENSIONS = [".js", ".ts", ".py", ".php"];
const SKIP_DIRS = ["node_modules", ".git", "dist"];
```

---

## 📊 Performance

| Operation | Time |
|-----------|------|
| Full scan | ~10ms |
| Quick refresh | ~2ms |
| Memory lookup | <1ms |
| LLM call | ~2-5s |

---

## 🔧 Common Tasks

### Refresh Project Context

```
You: scan
```

### View Memory Stats

```
You: memory
```

### Backup Memory

```javascript
const memory = require('./tools/memory');
memory.exportMemory('backup.json');
```

### Clean Caches

```bash
rm project_map.json file_hashes.json memory_index.json
node -e "require('./tools/scanner').scanProject()"
```

---

## 🎓 Learning Path

**New to the system?** Read in this order:

1. **This file** (PROJECT_OVERVIEW.md) - You are here
2. [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) - Learn to use it
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - Understand design
4. [`docs/MEMORY_SYSTEM.md`](./docs/MEMORY_SYSTEM.md) - Memory details
5. [`docs/SCANNER_SYSTEM.md`](./docs/SCANNER_SYSTEM.md) - Scanner details

---

## 🆘 Need Help?

1. **Quick fix:** Clean caches and restart
   ```bash
   rm project_map.json file_hashes.json
   node agent.js
   ```

2. **Check docs:** [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md)

3. **Run tests:** `node tests/test_all.js`

4. **Check Ollama:** `ollama list`

---

## 🎯 What Makes This Special

### Traditional LLM Coding Assistants
- ❌ No memory of past fixes
- ❌ No project awareness
- ❌ Every session starts from zero
- ❌ Repeats same mistakes

### This System
- ✅ **Remembers everything** forever
- ✅ **Knows your project** structure
- ✅ **Learns from patterns**
- ✅ **Gets smarter** over time

---

## 📈 System Stats

Check your system:

```bash
node -e "
const memory = require('./tools/memory');
const scanner = require('./tools/scanner');

console.log('Memory entries:', memory.getStats().totalEntries);
console.log('Project files:', scanner.loadProjectMap().files.length);
"
```

---

## 🔮 Future Enhancements

### Planned
- [ ] TypeScript support
- [ ] Python file support
- [ ] Semantic code search
- [ ] Git integration
- [ ] Auto-documentation

### Ideas
- [ ] Web dashboard
- [ ] Team memory sharing
- [ ] Cloud backup
- [ ] VS Code extension

---

## 📝 Version Info

**Current Version:** 1.0.0
**Last Updated:** 2026-03-05
**Status:** Production Ready

---

## ✅ Success Indicators

You'll know it's working when:

- ✅ Agent remembers past fixes
- ✅ Agent knows your file structure
- ✅ Agent suggests relevant solutions
- ✅ All tests pass (88/88)
- ✅ Memory grows over time

---

## 🎉 You're Ready!

Start with:
```bash
node agent.js
```

Then try:
```
You: create a simple calculator module
```

---

**Happy coding with your AI assistant!** 🚀
