# 🐛 Troubleshooting

**Common issues and solutions** for the agent system.

---

## 🔍 Quick Diagnostics

### Run This First

```bash
# Check system status
node -e "
console.log('Memory entries:', require('./tools/memory').getStats().totalEntries);
console.log('Project files:', require('./tools/scanner').loadProjectMap().files.length);
"
```

**Expected output:**
```
Memory entries: 45
Project files: 8
```

---

## 🤖 Agent Issues

### Problem: Agent won't start

**Symptoms:**
```
Error: Cannot find module 'axios'
```

**Solution:**
```bash
npm install
```

---

### Problem: Ollama connection failed

**Symptoms:**
```
❌ Ollama error: connect ECONNREFUSED 127.0.0.1:11434
```

**Solution:**
```bash
# Check if Ollama is running
ollama list

# If not running, start it
ollama serve

# Pull required model
ollama pull deepseek-coder:6.7b
```

---

### Problem: Model not found

**Symptoms:**
```
Error: model 'deepseek-coder:6.7b' not found
```

**Solution:**
```bash
ollama pull deepseek-coder:6.7b
```

---

### Problem: Agent crashes on startup

**Symptoms:**
```
❌ Fatal error: Cannot read property 'files' of undefined
```

**Solution:**
```bash
# Delete corrupted cache
rm project_map.json file_hashes.json

# Restart agent
node agent.js
```

---

### Problem: readline-sync error

**Symptoms:**
```
stty: when specifying an output style, modes may not be set
❌ Fatal error: The current environment doesn't support interactive reading from TTY.
```

**Cause:** Running in non-interactive environment (CI, pipe, etc.)

**Solution:** Run in interactive terminal:
```bash
node agent.js
```

---

## 🧠 Memory Issues

### Problem: Memory not saving

**Symptoms:**
- `persistent_memory.jsonl` not created
- `memory` command shows 0 entries

**Solution:**
```bash
# Check file permissions
ls -la persistent_memory.jsonl

# Fix permissions if needed
chmod 644 persistent_memory.jsonl

# Test memory write
node -e "
const memory = require('./tools/memory');
const entry = memory.addFix('test.js', 'func', 'test', 'old', 'new', 'bug_fix', ['test']);
console.log('Saved:', entry.id);
"
```

---

### Problem: Memory file too large

**Symptoms:**
- `persistent_memory.jsonl` > 10MB
- Slow lookups

**Solution:**
```javascript
// Reduce max entries in tools/memory.js
const MAX_ENTRIES = 500;  // Was 1000
```

**Or export and clean:**
```bash
# Export important entries
node -e "require('./tools/memory').exportMemory('backup.json')"

# Clear memory
rm persistent_memory.jsonl memory_index.json

# Re-import if needed
node -e "require('./tools/memory').importMemory('backup.json', false)"
```

---

### Problem: Can't find past fixes

**Symptoms:**
- Agent doesn't suggest relevant fixes
- `getContextSuggestions()` returns empty

**Solution:**
```bash
# Check if memory has entries
node -e "console.log(require('./tools/memory').getStats())"

# Search manually
node -e "
const fixes = require('./tools/memory').findRelevantFixes({ file: 'your-file' });
console.log('Found:', fixes.length);
"
```

---

### Problem: Memory index corrupted

**Symptoms:**
```
Error: Cannot read property 'byFile' of undefined
```

**Solution:**
```bash
# Delete index (auto-rebuilds on next use)
rm memory_index.json

# Restart agent
node agent.js
```

---

## 🗺️ Scanner Issues

### Problem: Scanner very slow

**Symptoms:**
- Scan takes >1 second
- Agent startup slow

**Solution:**
```bash
# Check file count
find . -name "*.js" | wc -l

# If >100 files, consider:
# 1. Moving large dirs to excluded paths
# 2. Splitting project

# Edit tools/scanner.js
const SKIP_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "large-folder"  // Add problematic folders
];
```

---

### Problem: Imports not detected

**Symptoms:**
- `imports` map is empty
- Agent doesn't know dependencies

**Solution:**
```bash
# Force full scan
node -e "require('./tools/scanner').scanProject()"

# Check file has valid imports
# Valid:
import x from './file';
const y = require('./file');

# Invalid (won't track):
import z from 'npm-package';  // External package
```

---

### Problem: Structures missing

**Symptoms:**
- `structures` map is empty
- Functions not listed in context

**Cause:** Quick refresh skipped unchanged files

**Solution:**
```bash
# Force full scan (not quick refresh)
node -e "require('./tools/scanner').scanProject(scanner.PROJECT_ROOT, false)"
```

---

### Problem: Cache files corrupted

**Symptoms:**
```
SyntaxError: Unexpected token in JSON
```

**Solution:**
```bash
# Delete all cache files
rm project_map.json file_hashes.json memory_index.json

# Regenerate
node -e "require('./tools/scanner').scanProject()"
node -e "require('./tools/memory').getStats()"  # Rebuilds index
```

---

### Problem: Wrong files tracked

**Symptoms:**
- Deleted files still in map
- New files not showing

**Solution:**
```bash
# Full rescan
node -e "require('./tools/scanner').loadProjectMap(true)"
```

---

## 🔗 Integration Issues

### Problem: Agent doesn't use memory

**Symptoms:**
- No "RELEVANT PAST FIXES" shown
- Memory context always empty

**Solution:**
```javascript
// Check agent.js has USE_MEMORY enabled
const USE_MEMORY = true;  // Should be true

// Check memory has entries for current file
node -e "
const fixes = require('./tools/memory').getContextSuggestions('agent.js');
console.log('Suggestions:', fixes.length);
"
```

---

### Problem: Agent doesn't use scanner

**Symptoms:**
- No project context injected
- "Active file" section missing

**Solution:**
```bash
# Check project map exists
ls -la project_map.json

# Check agent loads scanner
node -e "
const scanner = require('./tools/scanner');
const map = scanner.loadProjectMap();
console.log('Files loaded:', map.files.length);
"
```

---

### Problem: Context injection fails

**Symptoms:**
```
TypeError: Cannot read properties of null
```

**Solution:**
```bash
# Rebuild project map
node -e "require('./tools/scanner').scanProject()"

# Test context injection
node -e "
const scanner = require('./tools/scanner');
const map = scanner.loadProjectMap();
const context = scanner.buildContextInjection('agent.js', map);
console.log(context);
"
```

---

## 🧪 Test Issues

### Problem: Tests failing

**Symptoms:**
```
❌ FAIL: Should get structures for memory.js
```

**Solution:**
```bash
# Clean test data
rm persistent_memory.jsonl project_map.json file_hashes.json

# Re-run tests
node tests/test_all.js
```

---

### Problem: Tests slow

**Symptoms:**
- Tests take >1 second
- Timeout errors

**Solution:**
```bash
# Check project size
find . -name "*.js" | wc -l

# If >50 files, consider reducing test scope
# Or exclude large directories
```

---

### Problem: Test data persists

**Symptoms:**
- Tests affect each other
- Inconsistent results

**Solution:**
```bash
# Clean before each test run
rm persistent_memory.jsonl project_map.json file_hashes.json memory_index.json

# Or use fresh test data
node tests/test_all.js
```

---

## 📦 Installation Issues

### Problem: Dependencies missing

**Symptoms:**
```
Error: Cannot find module 'readline-sync'
```

**Solution:**
```bash
npm install
```

---

### Problem: Node version incompatible

**Symptoms:**
```
Error: Unsupported Node.js version
```

**Solution:**
```bash
# Check version
node --version

# Should be >= 14
# Recommended: 18+ or 20+
```

---

## 🔐 Permission Issues

### Problem: Can't write files

**Symptoms:**
```
ERROR: Cannot write file.
EACCES: permission denied
```

**Solution:**
```bash
# Check ownership
ls -la

# Fix if needed
chown -R $USER:$USER .
chmod -R u+w .
```

---

### Problem: Can't read files

**Symptoms:**
```
ERROR: Cannot read file.
```

**Solution:**
```bash
# Check file exists
ls -la filename.js

# Check permissions
chmod 644 filename.js
```

---

## 🚨 Emergency Recovery

### Nuclear Option (Reset Everything)

```bash
# Backup important data
cp README.md README.md.bak

# Delete all generated files
rm -f persistent_memory.jsonl
rm -f project_map.json
rm -f file_hashes.json
rm -f memory_index.json

# Reinstall dependencies
rm -rf node_modules
npm install

# Regenerate caches
node -e "require('./tools/scanner').scanProject()"

# Run tests
node tests/test_all.js

# Start fresh
node agent.js
```

---

## 📊 Diagnostic Commands

### Check System Health

```bash
# Memory status
node -e "console.log(require('./tools/memory').getStats())"

# Scanner status
node -e "console.log(require('./tools/scanner').loadProjectMap())"

# File structure
find . -maxdepth 2 -name "*.js" | head -20

# Cache files
ls -lh *.json *.jsonl 2>/dev/null
```

---

### Debug Mode

```javascript
// Enable in agent.js
const DEBUG = true;

// Shows raw LLM responses
// Helps diagnose parsing issues
```

---

## 📚 Additional Resources

- [`USER_GUIDE.md`](./USER_GUIDE.md) - Usage guide
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - System design
- [`API_REFERENCE.md`](./API_REFERENCE.md) - Function reference
- [`TESTING.md`](./TESTING.md) - Test guide

---

## 🆘 Still Having Issues?

1. **Check logs** - Look for error messages
2. **Run tests** - `node tests/test_all.js`
3. **Clean caches** - Delete `.json` and `.jsonl` files
4. **Restart fresh** - `node agent.js`
5. **Check Ollama** - `ollama list`

---

**Most issues are fixed by cleaning caches and restarting!** 🔄
