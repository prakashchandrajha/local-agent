# 🧪 Testing Guide

**How to run and understand tests** for the agent system.

---

## 🚀 Quick Start

### Run All Tests

```bash
node tests/test_all.js
```

**Expected output:**
```
═════════════════════════════════════════
📚 PART 1: PERSISTENT FIX MEMORY
═════════════════════════════════════════
✅ PASS: Should create entry with ID
...

╔═════════════════════════════════════════╗
║  🎉 ALL TESTS PASSED! SYSTEM READY!  ║
╚═════════════════════════════════════════╝
```

---

## 📁 Test Files

| File | Purpose | Tests |
|------|---------|-------|
| `tests/test_all.js` | Complete test suite | 88 tests |
| `test_scanner.js` | Legacy scanner tests (root) | 37 tests |

---

## 🧩 Test Coverage

### Part 1: Persistent Memory (45 tests)

| Category | Tests |
|----------|-------|
| Add fix entry | 9 |
| Find relevant fixes | 3 |
| Find by tags | 2 |
| Get entry by ID | 3 |
| Update entry | 3 |
| Search by code | 2 |
| Get statistics | 4 |
| Auto-record change | 3 |
| Get context suggestions | 4 |
| Export memory | 5 |
| Import memory | 4 |
| Integration | 3 |

### Part 2: Project Scanner (40 tests)

| Category | Tests |
|----------|-------|
| Full project scan | 5 |
| Cache file verification | 6 |
| Load from cache | 2 |
| Import detection | 4 |
| Get dependents | 3 |
| Import tree | 3 |
| Structure extraction | 4 |
| Context injection | 3 |
| Quick refresh | 2 |
| File hashing | 5 |
| Targeted scan | 3 |
| Get file structures | 3 |
| Integration | 2 |

### Part 3: Integration (3 tests)

| Test | Purpose |
|------|---------|
| Memory context for scanned files | Both systems work together |
| Auto-record after simulated fix | End-to-end workflow |
| Full workflow simulation | Complete usage pattern |

---

## 📊 Understanding Test Output

### Success Output

```
✅ PASS: Should create entry with ID
ℹ️  INFO: Created entry ID: 2bf87ad6-4114-4f3a-be78-0c95ebac9640
```

**Meaning:** Test passed, optional info shown

---

### Failure Output

```
❌ FAIL: Should get structures for memory.js
```

**Meaning:** Test failed - investigate cause

---

### Summary Output

```
┌─────────────────────────────────────────┐
│  COMPONENT BREAKDOWN                    │
├─────────────────────────────────────────┤
│  Persistent Memory: 45/45 (100.0%)      │
│  Project Scanner: 40/40 (100.0%)        │
├─────────────────────────────────────────┤
│  TOTAL: 85/85 (100.0%)                  │
└─────────────────────────────────────────┘
```

**Meaning:** All tests passed in all categories

---

## 🔧 Running Specific Tests

### Edit Test File

Open `tests/test_all.js` and comment out sections:

```javascript
// Skip Part 1
// log.section("📚 PART 1: PERSISTENT FIX MEMORY");
// ... (comment out Part 1 tests)

// Run only Part 2
log.section("🗺️ PART 2: PROJECT CONTEXT SCANNER");
// ... Part 2 tests
```

---

## 🐛 Debugging Failed Tests

### Step 1: Read Error Message

```
❌ FAIL: Should get structures for memory.js
Cannot read properties of null (reading 'functions')
```

**Meaning:** `getFileStructures()` returned null

---

### Step 2: Check Test Code

```javascript
const structures = scanner.getFileStructures("tools/memory.js", map);
assert(structures.functions.length > 0, "...");
```

**Issue:** Map doesn't have structures for memory.js

---

### Step 3: Force Full Scan

```bash
node -e "
const scanner = require('./tools/scanner');
scanner.scanProject(scanner.PROJECT_ROOT, false);
"
```

---

### Step 4: Re-run Tests

```bash
node tests/test_all.js
```

---

## 🔄 Test Data Management

### Clean Test Data

```bash
# Remove generated files
rm persistent_memory.jsonl
rm project_map.json
rm file_hashes.json
rm memory_index.json

# Re-run tests (fresh start)
node tests/test_all.js
```

---

### Backup Before Testing

```bash
# Backup current data
cp persistent_memory.jsonl persistent_memory.jsonl.bak
cp project_map.json project_map.json.bak

# Run tests
node tests/test_all.js

# Restore if needed
mv persistent_memory.jsonl.bak persistent_memory.jsonl
mv project_map.json.bak project_map.json
```

---

## 📈 Test Performance

### Expected Durations

| Test Phase | Time |
|------------|------|
| Part 1: Memory | ~100ms |
| Part 2: Scanner | ~50ms |
| Part 3: Integration | ~50ms |
| **Total** | **~200ms** |

### Slow Test Indicators

If tests take >1 second:
- Check disk I/O
- Close other applications
- Consider SSD upgrade

---

## ✅ Test Checklist

Before considering tests passing:

- [ ] All 85+ tests pass
- [ ] No errors in output
- [ ] 100% pass rate shown
- [ ] Final success message displayed
- [ ] Exit code is 0

---

## 🧪 Writing New Tests

### Test Template

```javascript
log.subsection("X.X: Test Name");

try {
  // Arrange
  const testData = setupData();
  
  // Act
  const result = functionUnderTest(testData);
  
  // Assert
  assert(result, "Should do something", "category");
  assert(result.value === expected, "Should have correct value", "category");
  
  // Optional info
  log.info(`Additional info: ${result}`);
  
} catch (err) {
  log.fail(`Test failed: ${err.message}`);
  testResults.category.failed++;
}
```

---

### Assertion Helper

```javascript
const assert = (condition, message, category = "general") => {
  if (condition) {
    log.pass(message);
    testsPassed++;
    testResults[category].passed++;
  } else {
    log.fail(message);
    testsFailed++;
    testResults[category].failed++;
  }
  testResults[category].tests.push({ name: message, passed: condition });
};
```

---

## 🎯 Test Categories

### Category: "memory"

Tests for `tools/memory.js`:
- CRUD operations
- Search and retrieval
- Export/import
- Statistics
- Auto-recording

---

### Category: "scanner"

Tests for `tools/scanner.js`:
- Scanning operations
- Cache management
- Dependency analysis
- Structure extraction
- Context injection

---

## 🔍 Test Examples

### Example 1: Test Memory Add

```javascript
log.subsection("1.1: Add Fix Entry");

try {
  const testEntry = memory.addFix(
    "test_file.js",
    "testFunction",
    "Fixed null pointer",
    "function testFunction() { return undefined; }",
    "function testFunction() { return 'fixed'; }",
    "bug_fix",
    ["test", "bugfix"]
  );
  
  assert(testEntry.id, "Should create entry with ID", "memory");
  assert(testEntry.file === "test_file.js", "Should store correct file", "memory");
  assert(testEntry.tags.includes("test"), "Should include 'test' tag", "memory");
  
  log.info(`Created entry ID: ${testEntry.id}`);
} catch (err) {
  log.fail(`Add fix failed: ${err.message}`);
  testResults.memory.failed++;
}
```

---

### Example 2: Test Scanner

```javascript
log.subsection("2.1: Full Project Scan");

try {
  const map = scanner.scanProject();
  
  assert(map.files.length > 0, "Should scan and find files", "scanner");
  assert(map.files.includes("agent.js"), "Should include agent.js", "scanner");
  assert(map.languages.js, "Should detect JavaScript", "scanner");
  
  log.info(`Found ${map.files.length} files`);
} catch (err) {
  log.fail(`Full scan failed: ${err.message}`);
  testResults.scanner.failed++;
}
```

---

## 🚨 Common Test Failures

### Failure: "Should have cached hashes"

**Cause:** Hash cache file doesn't exist

**Fix:**
```bash
node -e "require('./tools/scanner').scanProject()"
```

---

### Failure: "Should detect imports"

**Cause:** No imports in test files

**Fix:** Check test file has valid imports

---

### Failure: "Should get structures"

**Cause:** Structures not extracted

**Fix:** Force full scan (not quick refresh)

---

## 📊 Test Statistics

After running, you'll see detailed breakdown:

```
DETAILED RESULTS:

✅ Memory #1: Should create entry with ID
✅ Memory #2: Should store correct file path
...
✅ Scanner #1: Should scan and find files
✅ Scanner #2: Files should be array
...
```

**Use this to:**
- Identify which tests failed
- Understand what each test checks
- Debug specific issues

---

## 🎓 Best Practices

### Do ✅
- Run tests after every code change
- Keep test data clean
- Read failure messages carefully
- Check test coverage regularly

### Don't ❌
- Don't ignore failing tests
- Don't delete test files
- Don't skip test runs
- Don't modify test helpers

---

## 🔮 Future Test Enhancements

### Planned
- [ ] Performance benchmarks
- [ ] Memory leak detection
- [ ] Integration with CI/CD
- [ ] Code coverage reports

### Ideas
- [ ] Visual test dashboard
- [ ] Test data generators
- [ ] Snapshot testing
- [ ] Fuzz testing

---

## 🆘 Getting Help

### Problem: Tests fail randomly

**Check:**
- File system state
- Concurrent processes
- Disk space

---

### Problem: Tests too slow

**Check:**
- Number of files in project
- Disk I/O speed
- Background processes

---

### Problem: Can't debug test

**Try:**
1. Add `console.log()` statements
2. Run single test in isolation
3. Check test data state
4. Review error stack trace

---

## 📚 Related Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - System design
- [`API_REFERENCE.md`](./API_REFERENCE.md) - Function reference
- [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) - Common issues

---

**Tests are your safety net - run them often!** 🛡️
