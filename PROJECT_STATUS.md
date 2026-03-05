# Local Coding Agent Development Plan

## 🎯 Goal
Build a **fully local, proactive coding agent** that:
- Adds new features
- Fixes bugs (simple and complex)
- Understands project context
- Learns from past fixes
- Supports skill-based workflows (adapted from Hugging Face Skills)
- Works entirely offline (no API keys required)

---

## ✅ Current State (Stage 2 Complete)

### What Works
- Tool routing: `read_file`, `write_file`, `list_files`
- Intention detection: fix/debug/repair triggers read first
- Two-call loop: read → analyze → write (automatic fix flow)
- Markdown code fence cleaning in responses

### Architecture (Stage 2)
```
User: "fix demo.js"
  ↓
Local LLM: TOOL: read_file + PATH: demo.js
  ↓
Agent reads file, sees console.dog error
  ↓
LLM (2nd call): Analyzes error, returns TOOL: write_file + corrected code
  ↓
Agent writes fix (console.dog → console.log)
  ↓
✅ File fixed!
```

### Files
- `agent.js` - Main agent with fix flow
- `demo.js` - Test file (successfully fixed)
- `tools/file.js` - File system tools

### Known Limitations
1. Only handles fix/debug/repair intents
2. No memory/learning between sessions
3. No parallel agent execution
4. Single LLM model (no multi-agent system)
5. No temporal memory or pattern matching

---

## ⚡ Next Steps (Optimized for Local LLM + Skills)

### Step 1: Project Initialization & Context Building
**Objective:** Make the agent aware of the project structure.

**Actions:**
1. Scan all directories and files in the project
2. Identify key file types (controllers, models, views, JS, etc.)
3. Map file relations (imports/includes)
4. Index functions, classes, routes
5. Track recently modified files
6. Store project map in **local memory/JSON**

**Deliverable Example:**
```json
{
  "controllers": ["UserController.php", "AdminController.php"],
  "models": ["UserModel.php", "ProductModel.php"],
  "routes": ["routes.php"],
  "recent_changes": ["UserController.php"]
}
```

✅ Agent can query files and understand project context.

---

### Step 2: Skill-Based Task Loader
**Objective:** Integrate Hugging Face Skills (or custom skills) for local use.

**Actions:**
1. Parse SKILL.md files locally
2. Convert instructions into **tool-executable steps**
3. Map tasks to local functions (`read_file`, `write_file`, `list_files`)
4. Maintain skill metadata for future reuse

**Deliverable:**
- Local skill interpreter that reads instructions and executes them offline

---

### Step 3: Simple Bug Fixing
- Read a file
- Identify syntax or simple logical errors
- Propose fix using local LLM + skills
- Apply approved fix
- Store fix in memory for future

---

### Step 4: Adding New Features
- Understand where to place new modules/functions
- Suggest imports, class names, hooks
- Generate boilerplate using skills
- Store feature metadata

---

### Step 5: Memory & Learning
- Store all approved fixes and new features
- Use memory to auto-suggest solutions for future tasks

---

### Step 6: Complex Bug Handling
- For unknown or multi-file errors:
  - Read file(s)
  - Propose multiple fixes
  - Let user approve correct fix
  - Store solution in memory

---

### Step 7: Optional Web Lookup (Future)
- If local knowledge insufficient:
  - Fetch potential solutions from ZeroClaw or internal search
  - Integrate results into memory

---

## 📌 Potential Improvements
- Multi-tier memory (Hot/Pattern/Vector)
- Parallel adaptive agents
- Smart consensus engine
- Speculative execution
- Self-tuning parameters
- Visual debugging dashboard