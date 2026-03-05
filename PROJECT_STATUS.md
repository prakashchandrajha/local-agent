# Supercharged Local Coding Agent — Project Plan

## 🎯 Main Goal
Build a **fully local, proactive coding agent** that:

- Fixes **simple and very complex bugs**, including multi-file and multi-layer issues
- Adds **new modules, features, and endpoints** intelligently
- Understands **project context, file dependencies, and coding patterns**
- Learns from past fixes to improve over time
- Works **entirely offline**, no API keys or cloud services
- Predicts potential issues before they occur
- Can leverage **knowledge from reference materials and coding guides**

> Essentially: a senior developer sitting beside you — **smart, proactive, and fully project-aware**.

---

## ✅ Current State (Stage 4 Complete - Persistent Memory Implemented)

### What Works
- Tool routing: `read_file`, `write_file`, `list_files`, `chat`
- Active file fix loop: reads → injects content → writes
- Memory of last 20 turns for iterative fixes
- Retry logic for LLM errors
- Multi-file TOOL block handling
- README.md instructions injected at startup
- Overwrite protection for safety
- **Persistent Memory**: automatically records all fixes with before/after diffs
- **Smart Retrieval**: finds relevant past fixes by file, function, and tags
- **Memory Context**: injects relevant past fixes into LLM prompts
- **Statistics Command**: `memory` command shows fix history and patterns

### Known Limitations
- No **project context awareness** (file dependencies, imports)
- Parser is **fragile** → dependent on exact TOOL formatting
- Cannot **coordinate multi-file fixes** yet
- Memory search is **keyword-based** (no semantic/vector search yet)

---

## 🎉 Recently Completed

### ✅ Step 1: Persistent Fix Memory (COMPLETE)

**Files Created:**
- `tools/memory.js` - Core memory module with CRUD operations
- `MEMORY_USAGE.md` - Comprehensive usage documentation

**Features Implemented:**
- JSONL-based storage for efficient append-only writes
- Indexed lookups by file, function, and tags (O(1) performance)
- Auto-diffing: captures before/after code for every change
- Auto-tagging: tags by file extension and change type
- Context retrieval: shows relevant past fixes when working on files
- Export/Import: backup and restore memory
- Statistics: track fix patterns and common issues

**Agent Integration:**
- Automatically records every file change made by the agent
- Injects relevant past fixes into system prompts
- New `memory` command to view statistics
- Configurable via `USE_MEMORY` flag

**Storage Files:**
- `persistent_memory.jsonl` - All fix entries (one JSON per line)
- `memory_index.json` - Fast lookup indices

---

## 💡 Next Steps / Roadmap

### **Step 2: Project Context Scanner**
- Scan directories, imports, dependencies
- Build **project map JSON**: open files, file relationships, recent changes
- Inject context into LLM prompts
- Deliverable: `tools/scanner.js`

### **Step 3: Knowledge Wrapper**
- Maintain a **knowledge store**:
  - Architecture guides, design patterns, reference books/docs
  - Preloaded solutions and templates for common bugs
- Search and inject relevant knowledge for LLM suggestions
- Deliverable: `tools/knowledge.js`  

### **Step 4: Smarter Parser**
- Move from regex → structured JSON outputs from LLM
- Reduces retries and makes parsing robust
- Handles multi-tool blocks and multi-file operations  

### **Step 5: Multi-File Coordination**
- Use project map to detect related files
- Apply fixes across dependencies intelligently  

### **Step 6: Speculative Execution / Predictive Fixes**
- Analyze potential impact of changes before writing
- Predict downstream bugs or conflicts
- Propose preventive fixes automatically  

### **Step 7: Recursive Problem Decomposition**
- Break complex bugs into subproblems
- Solve iteratively, merge fixes
- Ensures high success rate for very complex issues  

### **Step 8: Auto-Documentation & Reasoning Trace**
- Every fix / feature suggestion generates:
  - Reasoning behind the suggestion
  - Files affected
  - Dependencies considered
- Helps audit decisions and improves learning over time  

### **Step 9: Optional: External Knowledge Integration**
- Local dumps of open-source examples, StackOverflow solutions
- Used only if local memory & knowledge store do not have a solution
- Maintains fully offline capability  

---

## ⚡ How It Works (Supercharged Flow)

1. **User Command** → “Fix file.js” / “Add module”  
2. **Intent Detection** → Agent classifies as bug fix or new feature  
3. **Memory Lookup** → Vectorless search of past fixes  
4. **Knowledge Wrapper** → Relevant excerpts from knowledge store injected  
5. **Project Context** → Inject open files, imports, dependencies, language info  
6. **LLM Suggestion** → Generates fix / feature code  
7. **Speculative Execution** → Predicts side-effects across files  
8. **Recursive Problem Decomposition** → Breaks complex issues into smaller problems  
9. **User Approval Loop** → Fix applied only after approval; retries if needed  
10. **Memory Update** → Approved fixes stored for next time  
11. **Auto Documentation** → Generates reasoning trace  

> Optional: If local memory + knowledge fails, agent searches local web store or dumps  

---

## ✅ Benefits of This Approach
- **Fully offline & local**  
- Learns from your project and coding style **without vectors**  
- Handles **complex multi-file bugs** reliably  
- Provides **project-aware suggestions for new features**  
- Uses **knowledge wrapper** to answer architecture & design questions  
- Predicts **future bugs** before they happen  
- Generates **audit-friendly reasoning** for all fixes  

---

## 📌 Notes / Tips
- Start with **Step 1: Persistent Memory** → foundational for learning  
- Keep **project context scanner** updated for multi-file fixes  
- Build knowledge store progressively from **books, docs, patterns**  
- Iteratively integrate **recursive solving + speculative execution** for very complex issues  
- This roadmap is modular → each step adds incremental intelligence  

---

> When fully implemented, this agent will be **smarter, more precise, and more autonomous than any existing local or cloud-based coding agent**, capable of building, debugging, and designing software **even in complex environments**.