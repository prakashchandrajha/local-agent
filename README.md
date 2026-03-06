# 🚀 Supercharged Local Coding Agent

A **fully local, offline coding agent** with persistent memory, multi-language knowledge, and an automatic run-and-fix loop.

---

## What's New (v2.0)

| Feature | v1 | v2 (Supercharged) |
|---|---|---|
| Languages | JS only | JS, TS, Python, Java, Spring Boot, Go, Rust, C++, PHP, Bash |
| Memory | Session only | **Persistent** across sessions (`.agent-memory/`) |
| Run + Fix | Manual | **Automatic** — runs files, catches errors, fixes and re-runs |
| Knowledge | None | **Language profiles** injected into every prompt |
| Project scan | None | **Auto project map** built on startup |
| Error learning | None | **Pattern tracking** — gets smarter over time |
| Multi-file | Limited | **Full multi-file coordination** |

---

## Architecture

```
agent.js                   ← Main loop + agentic orchestration
├── tools/
│   └── file.js            ← readFile, writeFile, listFiles, runFile, getDiffSummary
├── knowledge/
│   └── lang-profiles.js   ← Expert knowledge for 10+ languages
└── memory/
    └── index.js           ← Persistent fix history, error patterns, project map
```

### `.agent-memory/` (auto-created)
```
.agent-memory/
├── fixes.json         ← Every successful fix stored here
├── patterns.json      ← Recurring error types tracked per language
├── project-map.json   ← File tree scan (refreshes every 5 min)
└── session.json       ← Reserved for future session state
```

---

## Setup

```bash
npm install
node agent.js
```

Set a different model:
```bash
AGENT_MODEL=llama3:8b node agent.js
```

Debug raw LLM output:
```bash
AGENT_DEBUG=1 node agent.js
```

---

## Commands

| Input | What happens |
|---|---|
| `exit` | Saves memory and quits |
| `history` | Shows this session's conversation |
| `clear` | Resets session memory + active file |
| `memory` | Shows persistent fix count and top error patterns |
| `scan` | Re-scans project structure |

---

## What It Can Do

### Fix errors in any language
```
You: fix calculator.py
```
Agent reads the file → detects language → injects Python expert context + past fixes → writes corrected code.

### Run files and auto-fix failures
```
You: run server.js
```
Agent runs the file → captures output/errors → offers to auto-fix → fixes and re-runs.

### Create new files
```
You: create a Spring Boot REST controller for /api/users
```
Agent knows Spring Boot conventions (beans, @RestController, ResponseEntity, etc.) and generates production-ready code.

### Multi-file coordination
```
You: fix the import error across utils.py and main.py
```
Agent reads both → identifies cross-file dependency issue → writes both fixed files.

### Review without changing
```
You: review auth.go
```
Agent reads → gives detailed analysis without writing → waits for your go-ahead.

### Improve existing code
```
You: improve the error handling in api.js
```
Agent reads → applies language-specific best practices → writes improved version → records fix in memory.

---

## Language Knowledge

Every LLM call is enriched with expert context for the detected language:

- **Common error patterns** (e.g. NullPointerException, borrow checker, async/await pitfalls)
- **Fix strategies** specific to that language and framework
- **Style conventions** (PEP8 for Python, SOLID for Java, etc.)
- **Past fixes from memory** relevant to the current language and error type

### Supported languages
`JavaScript` · `TypeScript` · `Python` · `Java` · `Spring Boot` · `FastAPI` · `Go` · `Rust` · `C++` · `PHP` · `Bash`

---

## Customizing Instructions

Edit `README.md` in your project root. It's loaded fresh every time the agent starts — no restart needed.

**Example additions:**
```markdown
## Project Context
- This is a Spring Boot REST API for a fintech app
- Database: PostgreSQL via JPA/Hibernate
- Auth: JWT tokens in Authorization headers
- All controllers return ResponseEntity<ApiResponse<T>>

## Style
- All services must implement an interface
- Use Lombok @Builder and @Data annotations
- Log all exceptions with logger.error()
```

---

## How Memory Works

The agent saves every fix it applies:

```json
{
  "file": "UserService.java",
  "lang": "java",
  "errorType": "fix",
  "description": "fix NullPointerException in findById when user not found",
  "timestamp": "2025-03-06T10:22:00.000Z"
}
```

When you ask it to fix a Java file later, it recalls similar past fixes and uses them as additional context — getting smarter with every session.

---

## Agent Tool Reference

The LLM can emit these tools:

| Tool | Purpose |
|---|---|
| `chat` | Respond to user with explanation or questions |
| `list_files` | Show project structure |
| `read_file` | Read a specific file |
| `write_file` | Create or overwrite a file |
| `run_file` | Execute a file and capture output |
| `fix_error` | Analyze an error and fix the file |
| `recall_fixes` | Query past fix memory |
