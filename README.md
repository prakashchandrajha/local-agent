# 🚀 Supercharged Local Coding Agent — v3

> **Elite local coding agent.** Plan → Code → Review → Run → Fix → Learn.  
> Fully offline. No API keys. Gets smarter every session.

---

## What's New in v3

| System | v2 | v3 |
|---|---|---|
| Complex tasks | Single LLM call | **Task Planner** — step-by-step execution |
| Knowledge | Language profiles | **Knowledge Atoms** — TF-IDF semantic search |
| Code quality | Write directly | **Self-Review** — validates before writing |
| Web search | ❌ | **Web Search Fallback** — SO + DDG when stuck |
| Web learning | ❌ | **Crystallization** — web fixes → permanent atoms |
| File awareness | Basic | **Dependency Graph** — tracks import relationships |
| Reasoning | ❌ | **Trace Log** — full audit of every decision |
| Fix search | String match | **Scored keyword search** over fix history |

---

## Install & Run

```bash
npm install
node agent.js

# With debug output
AGENT_DEBUG=1 node agent.js

# Skip self-review (faster, less reliable)
AGENT_REVIEW=0 node agent.js

# Use a different model
AGENT_MODEL=codellama:13b node agent.js
```

---

## File Structure

```
agent.js                      ← Main loop + orchestration
│
├── core/
│   ├── planner.js            ← Task decomposer — blueprints for OAuth2, REST APIs, etc.
│   └── reviewer.js           ← Self-review pass + reasoning trace logger
│
├── tools/
│   └── file.js               ← readFile, writeFile, runFile, getDiffSummary
│
├── knowledge/
│   ├── lang-profiles.js      ← Expert profiles for 10+ languages
│   └── templates/            ← Module scaffolding recipes (add your own!)
│
├── memory/
│   ├── index.js              ← Fix history, error patterns, project map
│   └── knowledge-store.js    ← Atom store + TF-IDF search + dependency graph
│
└── browser/
    └── search.js             ← Web search (SO + DDG) + solution crystallization
```

### Persistent Storage (`.agent-memory/`)

```
.agent-memory/
├── fixes.json          ← Every successful fix recorded here
├── atoms.json          ← Knowledge facts (seeded + web-learned)
├── patterns.json       ← Error frequency by language
├── project-map.json    ← File tree + recent files
├── graph.json          ← Import/dependency relationships
└── reasoning.log       ← Full audit trail of agent decisions
```

---

## Shell Commands

| Command | What it does |
|---|---|
| `exit` | Save memory and quit |
| `history` | Show this session's conversation |
| `clear` | Reset session context |
| `memory` | Show fix count, atom count, top error patterns |
| `atoms` | List last 20 knowledge atoms |
| `trace` | Show last 15 reasoning trace entries |
| `scan` | Re-scan and rebuild project map |

---

## How Complex Tasks Work (OAuth2 Example)

```
You: create oauth2 implementation for express
```

1. **Planner detects** this matches "OAuth2 / JWT Auth (Node.js)" blueprint
2. **Displays 6-step plan** and asks for confirmation
3. **Executes each step** as a focused LLM call:
   - Step 1: `jwt.js` — token sign/verify/refresh
   - Step 2: `user-model.js` — schema with password hash
   - Step 3: `auth-service.js` — register/login/refresh business logic
   - Step 4: `auth-middleware.js` — Bearer token validator
   - Step 5: `auth-routes.js` — POST /auth/register, /login, /refresh
   - Step 6: `app.js` — wires everything together
4. **Each file gets self-reviewed** before writing
5. **Knowledge atoms are injected** into each step (JWT secrets, bcrypt rounds, etc.)

---

## How Web Search + Learning Works

```
You: run server.js
```
1. Agent runs the file → captures error output
2. Tries to fix locally (up to 3 attempts) using knowledge atoms + past fixes
3. **If still broken:** searches Stack Overflow + DuckDuckGo for the exact error
4. Injects web results as context and generates a fix
5. **If fix works:** crystallizes the solution as a new knowledge atom
6. Next time this error appears — agent knows the answer locally

---

## Self-Review Pass

Before any file is written to disk, a review prompt is sent to the LLM checking:

- All imports/requires resolve correctly
- No placeholder or stub code
- All async functions have error handling
- Language-specific rules (semicolons, types, annotations)
- No truncation or missing logic

If issues are found, they're auto-fixed in the review pass itself.

---

## Knowledge Atom System

Atoms are discrete coding facts stored in `.agent-memory/atoms.json`:

```json
{
  "lang": "springboot",
  "tags": ["security", "jwt", "filter"],
  "fact": "JWT filter must extend OncePerRequestFilter. Add it BEFORE UsernamePasswordAuthenticationFilter.",
  "source": "built-in",
  "useCount": 7
}
```

The agent ships with **35+ seed atoms** covering common mistakes in JS, TS, Python, Java, Spring Boot, Go, Rust, Docker.

When you search for atoms via `atoms` command, you see which ones are used most. You can also manually add atoms by editing `.agent-memory/atoms.json`.

---

## Adding Custom Knowledge

### Add project context to README.md

```markdown
## Project Context
- Spring Boot 3.2 REST API
- PostgreSQL via JPA/Hibernate  
- Auth: JWT Bearer tokens
- All controllers return ResponseEntity<ApiResponse<T>>
- Use Lombok @Data and @Builder everywhere
```

### Add custom knowledge atoms

Edit `.agent-memory/atoms.json`:

```json
{
  "lang": "springboot",
  "tags": ["pattern", "response"],
  "fact": "All endpoints in this project return ResponseEntity<ApiResponse<T>> where ApiResponse has status, message, data fields.",
  "source": "project-custom"
}
```

### Add language templates

Create files in `knowledge/templates/` — they'll be auto-loaded for matching task types.

---

## Recommended Models (Ollama)

| Model | Size | Best for |
|---|---|---|
| `deepseek-coder:6.7b` | 4GB | Good balance, default |
| `deepseek-coder:33b` | 18GB | Best code quality |
| `codellama:13b` | 7GB | Strong multi-language |
| `qwen2.5-coder:14b` | 8GB | Excellent instruction following |
| `llama3.1:8b` | 4.5GB | Good reasoning + code |

Switch model: `AGENT_MODEL=qwen2.5-coder:14b node agent.js`
