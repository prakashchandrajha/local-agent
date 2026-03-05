# 🧪 Test Suite

Comprehensive tests for **Persistent Fix Memory** and **Project Context Scanner**.

---

## 📋 Quick Start

```bash
# Run all tests (from project root)
node testing/test_all.js

# Run individual test files
node testing/test_scanner.js
```

---

## 📁 Test Files

| File | Description |
|------|-------------|
| `test_all.js` | **Complete test suite** - Memory + Scanner + Integration |
| `test_scanner.js` | Legacy scanner-only tests (root level) |

---

## 🧩 Test Coverage

### Part 1: Persistent Fix Memory (45 tests)

| Feature | Tests |
|---------|-------|
| Add fix entries | ✅ |
| Find by file/function | ✅ |
| Find by tags | ✅ |
| Get entry by ID | ✅ |
| Update entries | ✅ |
| Delete entries | ✅ |
| Search by code | ✅ |
| Statistics | ✅ |
| Auto-record changes | ✅ |
| Context suggestions | ✅ |
| Export/Import | ✅ |

### Part 2: Project Context Scanner (40 tests)

| Feature | Tests |
|---------|-------|
| Full project scan | ✅ |
| Cache file creation | ✅ |
| Load from cache | ✅ |
| Import detection | ✅ |
| Dependency analysis | ✅ |
| Structure extraction | ✅ |
| Context injection | ✅ |
| Quick refresh | ✅ |
| File hashing | ✅ |
| Change detection | ✅ |
| Targeted scanning | ✅ |

### Part 3: Integration Tests (3 tests)

| Workflow | Status |
|----------|--------|
| Memory context for scanned files | ✅ |
| Auto-record after simulated fix | ✅ |
| Full workflow simulation | ✅ |

---

## 🏃 Run Tests

### Full Test Suite
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

═════════════════════════════════════════
🗺️ PART 2: PROJECT CONTEXT SCANNER
═════════════════════════════════════════
✅ PASS: Should scan and find files
...

═════════════════════════════════════════
🔗 PART 3: INTEGRATION TESTS
═════════════════════════════════════════
✅ PASS: Full workflow simulation completed successfully

╔═════════════════════════════════════════╗
║  🎉 ALL TESTS PASSED! SYSTEM READY!  ║
╚═════════════════════════════════════════╝
```

---

## 📊 Test Statistics

After running, you'll see:

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

---

## 🔧 Debugging Failed Tests

If a test fails:

1. **Check the detailed output** - Each test shows what failed
2. **Review cache files** - Delete `project_map.json` and `file_hashes.json` to force fresh scan
3. **Check memory file** - `persistent_memory.jsonl` may have stale test data

### Reset Test Data
```bash
# Remove test artifacts
rm project_map.json file_hashes.json
rm persistent_memory.jsonl  # WARNING: Deletes all memory

# Re-run tests
node tests/test_all.js
```

---

## 📝 Adding New Tests

Follow the existing pattern:

```javascript
log.subsection("X.X: Test Name");

try {
  const result = someFunction();
  
  assert(result, "Should do something", "category");
  assert(result.value === expected, "Should have correct value", "category");
  
  log.info(`Additional info: ${result}`);
} catch (err) {
  log.fail(`Test failed: ${err.message}`);
  testResults.category.failed++;
}
```

**Categories:**
- `"memory"` - Persistent memory tests
- `"scanner"` - Project scanner tests

---

## ✅ Success Criteria

All tests must pass before:
- Deploying changes
- Merging new features
- After major refactoring

**Pass rate requirement:** 100%

---

## 🐛 Known Issues

None currently. All systems operational.

---

## 📚 Related Documentation

- [Memory System](../tools/memory.js) - Persistent fix storage
- [Scanner System](../tools/scanner.js) - Project context mapping
- [Agent Integration](../agent.js) - How both systems work together
