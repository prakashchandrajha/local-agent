# 🤖 Agent Documentation Loading

**How the agent reads and uses documentation files**

---

## ✅ What's Configured

The agent now **automatically loads** these files on startup:

### 1. README.md (Root Level)
- **Purpose:** Custom instructions for your specific setup
- **Loaded:** Always (if exists)
- **Used in:** System prompt

### 2. docs/for-agent/AGENT_GUIDE.md
- **Purpose:** Agent capabilities, tools, and workflows
- **Loaded:** Always (if exists)
- **Used in:** System prompt (enhanced with capabilities)

---

## 📁 File Locations

```
agent.js
  │
  ├─→ README.md                          ← Custom instructions
  │
  └─→ docs/for-agent/AGENT_GUIDE.md     ← Agent capabilities
```

---

## 🔧 How It Works

### Code in agent.js:

```javascript
// 1. Load README.md
const readmeContent = loadReadme();

// 2. Load AGENT_GUIDE.md
const agentDocsContent = loadAgentDocs();

// 3. Build system prompt with both
const SYSTEM_PROMPT = buildSystemPrompt(readmeContent, agentDocsContent);
```

### System Prompt Structure:

```
┌─────────────────────────────────────────┐
│  BASE INSTRUCTIONS                      │
│  (Tool format, critical rules)          │
├─────────────────────────────────────────┤
│  README.md (if exists)                  │
│  (Your custom instructions)             │
├─────────────────────────────────────────┤
│  AGENT_GUIDE.md (if exists)             │
│  (Capabilities, tools, workflows)       │
└─────────────────────────────────────────┘
```

---

## 📝 What Each File Teaches

### README.md
- Your project-specific instructions
- Custom workflows
- Project conventions

### AGENT_GUIDE.md
- Available tools (read_file, write_file, etc.)
- Response format
- Critical rules
- Memory system usage
- Project context usage
- Workflow patterns

---

## 🧪 Verify It's Working

```bash
node agent.js
```

**Expected output:**
```
📖 Loaded instructions from README.md
📚 Loaded agent documentation from docs/for-agent/AGENT_GUIDE.md
🤖 Agent ready!
```

---

## ➕ Add More Documentation

Want the agent to read more files? Add to `agent.js`:

```javascript
// Example: Load additional capability docs
const loadExtraDocs = () => {
  const path = "docs/for-agent/ADVANCED_CAPABILITIES.md";
  try {
    if (fs.existsSync(path)) {
      return fs.readFileSync(path, "utf8");
    }
  } catch (_) {}
  return null;
};

// Then in run():
const extraDocs = loadExtraDocs();
const SYSTEM_PROMPT = buildSystemPrompt(readmeContent, agentDocsContent, extraDocs);
```

---

## 🎯 Best Practices

### For Agent Docs (`docs/for-agent/`)

**Do:**
- ✅ Clear, structured instructions
- ✅ Tool usage examples
- ✅ Workflow patterns
- ✅ Error handling guidance

**Don't:**
- ❌ Vague instructions
- ❌ Contradictory rules
- ❌ Too much text (keep it focused)

---

## 📊 Current Loading Status

| File | Location | Loaded? | Purpose |
|------|----------|---------|---------|
| README.md | Root | ✅ Yes | Custom instructions |
| AGENT_GUIDE.md | docs/for-agent/ | ✅ Yes | Agent capabilities |
| (other files) | docs/for-me/ | ❌ No | For you only |

---

## 🔍 Troubleshooting

### Agent not loading docs?

**Check:**
```bash
# File exists
ls -la docs/for-agent/AGENT_GUIDE.md

# File readable
cat docs/for-agent/AGENT_GUIDE.md
```

### Want to see what agent reads?

**Enable debug:**
```javascript
// agent.js
const DEBUG = true;  // Shows loaded content
```

---

## ✅ Summary

**Agent reads:**
- `README.md` ← Your instructions
- `docs/for-agent/AGENT_GUIDE.md` ← Capabilities & tools

**You read:**
- Everything in `docs/for-me/`

**Agent doesn't read:**
- `docs/for-me/*` (those are for you)
- `testing/*` (test files)

---

**The agent is now fully configured!** 🎉
