# 📚 Documentation Guide

**Organized by who should read it**

---

## 📁 Updated Folder Structure

```
docs/
├── for-me/           ← Read these (for you, the developer)
├── for-agent/        ← Agent reads these (you don't need to)
├── api/              ← API documentation (NEW)
├── architecture/     ← Architecture documentation (NEW)
├── README.md         ← This file (start here)
├── AGENT_DOCS_LOADING.md ← How agent loads docs
├── IMPLEMENTATION_SUMMARY.md ← Technical implementation details
├── MEMORY_USAGE.md   ← Persistent memory functionality
├── PROJECT_OVERVIEW.md ← Project summary (moved from root)
├── PROJECT_STATUS.md ← Current development status
├── QUICK_START_MEMORY.md ← Memory system quick start
└── START_HERE.md     ← Alternative starting point

src/
├── services/         ← Core business logic (NEW)
├── parsers/          ← Response parsing utilities (NEW)
├── utils/            ← Shared utilities (NEW)
└── agent.js          ← Main application entry (REFACTORED)

config/               ← Configuration management (NEW)
├── index.js          ← Main configuration loader
└── environments/     ← Environment-specific configs

testing/
└── (all test files)  ← For running tests
```

---

## 👉 Start Here

1. **`PROJECT_OVERVIEW.md`** (now in `docs/`) - Quick project summary
2. **`docs/for-me/USER_GUIDE.md`** - How to use the agent
3. **`docs/for-me/TROUBLESHOOTING.md`** - When something breaks

---

## 📂 For You (Developer)

**Location:** `docs/for-me/`

| File | When to Read |
|------|-------------|
| `USER_GUIDE.md` | ⭐ **First read** - Usage, commands, examples |
| `TROUBLESHOOTING.md` | When you have problems |
| `TESTING.md` | How to run tests |
| `ARCHITECTURE.md` | Want to understand system design |
| `MEMORY_SYSTEM.md` | Want to understand memory internals |
| `SCANNER_SYSTEM.md` | Want to understand scanner internals |
| `API_REFERENCE.md` | Need function reference |

---

## 🤖 For Agent (AI)

**Location:** `docs/for-agent/`

| File | Purpose |
|------|---------|
| `AGENT_GUIDE.md` | ✅ Agent reads this automatically on startup |

**You don't need to read these** - the agent uses them automatically.

**How it works:** See `docs/AGENT_DOCS_LOADING.md`

---

## 🧪 Testing

**Location:** `testing/`

| File | Purpose |
|------|---------|
| `test_all.js` | Run all tests (88 tests) |
| `test_scanner.js` | Scanner-only tests |
| `README.md` | Test documentation |

**Run tests:**
```bash
node testing/test_all.js
```

---

## 🎯 Quick Reference

| I want to... | Read this |
|--------------|-----------|
| Understand the project | `docs/PROJECT_OVERVIEW.md` |
| Learn how to use it | `docs/for-me/USER_GUIDE.md` |
| Fix a problem | `docs/for-me/TROUBLESHOOTING.md` |
| Run tests | `testing/README.md` |
| Understand internals | `docs/for-me/ARCHITECTURE.md` |
| See all functions | `docs/for-me/API_REFERENCE.md` |
| See how agent loads docs | `docs/AGENT_DOCS_LOADING.md` |
| Understand new modular structure | `docs/architecture/` (NEW) |
| See API documentation | `docs/api/` (NEW) |

---

## ✅ Minimum Reading

To **just use** the system:
1. `docs/PROJECT_OVERVIEW.md`
2. `docs/for-me/USER_GUIDE.md`

That's it!

---

## 🆕 What's New in This Restructure

- **Modular Architecture**: Code split into `src/services/`, `src/parsers/`, `src/utils/`
- **Configuration Management**: Centralized config in `config/` with environment support
- **Structured Logging**: Better logging with levels and context
- **Organized Documentation**: All docs moved to `docs/` with better categorization
- **Improved Error Handling**: Consistent error patterns across modules

---

**TL;DR:**
- **You read:** `docs/for-me/*`
- **Agent reads:** `docs/for-agent/AGENT_GUIDE.md` (automatically)
- **Tests:** `testing/*`
