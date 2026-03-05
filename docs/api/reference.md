# API Reference

This document provides detailed API documentation for the Local Agent system.

## Core Services

### LLM Service

#### Constructor
```javascript
const LLMService = require('./src/services/llm');
const llmService = new LLMService(config, logger);
```

#### Methods

##### `callLLM(prompt, systemPrompt, conversationHistory)`
Makes a request to the LLM with retry logic.

**Parameters:**
- `prompt` (string): The user prompt
- `systemPrompt` (string): The system prompt
- `conversationHistory` (Array, optional): Previous conversation turns

**Returns:**
- `Promise<{raw: string, ops: Array}>` - Parsed response or null on failure

**Example:**
```javascript
const response = await llmService.callLLM(
  "Create a hello world function",
  "You are a coding assistant",
  [{ role: "user", content: "Previous question" }]
);
```

### Tool Parser

#### Constructor
```javascript
const ToolParser = require('./src/parsers/tool-parser');
const parser = new ToolParser(logger);
```

#### Methods

##### `parseToolBlocks(response)`
Parses LLM response into structured operations.

**Parameters:**
- `response` (string): Raw LLM response

**Returns:**
- `Array<Object>` - Array of operations with format:
  ```javascript
  [
    { tool: "chat", message: "Hello" },
    { tool: "read_file", path: "file.js" },
    { tool: "write_file", path: "out.js", content: "code" }
  ]
  ```

##### `extractFilename(input)`
Extracts filename from natural language input.

**Parameters:**
- `input` (string): Natural language input

**Returns:**
- `string|null` - Extracted filename or null

**Example:**
```javascript
const filename = parser.extractFilename("create a file called hello.js");
// Returns: "hello.js"
```

### Configuration Service

#### Getting Configuration
```javascript
const { getConfig } = require('./config');
const config = getConfig();
```

#### Methods

##### `get(path)`
Gets configuration value using dot notation.

**Parameters:**
- `path` (string): Dot notation path (e.g., "llm.url")

**Returns:**
- `*` - Configuration value

**Example:**
```javascript
const url = config.get("llm.url");
const retries = config.get("llm.maxRetries");
```

##### `set(path, value)`
Sets configuration value.

**Parameters:**
- `path` (string): Dot notation path
- `value` (*): Value to set

##### `isDebug()`
Checks if debug mode is enabled.

**Returns:**
- `boolean` - Debug mode status

### Logger Service

#### Getting Logger
```javascript
const { getLogger } = require('./src/utils/logger');
const logger = getLogger(config);
```

#### Methods

##### Basic Logging
```javascript
logger.debug("Debug message", { context: "data" });
logger.info("Info message", { context: "data" });
logger.warn("Warning message", { context: "data" });
logger.error("Error message", { context: "data" });
```

##### Operation Tracking
```javascript
logger.operationStart("file_operation", { file: "test.js" });
logger.operationComplete("file_operation", { file: "test.js" });
logger.operationFail("file_operation", error, { file: "test.js" });
```

##### Success Logging
```javascript
logger.success("Operation completed", { result: "data" });
```

##### Child Loggers
```javascript
const childLogger = logger.child({ module: "parser" });
childLogger.info("Module specific message");
```

## File Operations

### File Tools (`tools/file.js`)

#### Functions

##### `readFile(filePath)`
Reads file content.

**Parameters:**
- `filePath` (string): Relative file path

**Returns:**
- `string` - File content or error message

##### `writeFile(filePath, content)`
Writes content to file.

**Parameters:**
- `filePath` (string): Relative file path
- `content` (string): File content

**Returns:**
- `string` - Success message or error message

##### `listFiles()`
Lists files in current directory.

**Returns:**
- `string` - File list or error message

## Memory System

### Memory Tools (`tools/memory.js`)

#### Key Functions

##### `autoRecordChange(file, before, after, description)`
Records a file change in memory.

**Parameters:**
- `file` (string): File path
- `before` (string): Previous content
- `after` (string): New content
- `description` (string): Change description

##### `getContextSuggestions(file)`
Gets relevant past fixes for a file.

**Parameters:**
- `file` (string): File path

**Returns:**
- `Array<Object>` - Relevant memory entries

##### `getStatistics()`
Gets memory system statistics.

**Returns:**
- `Object` - Statistics object

## Scanner System

### Scanner Tools (`tools/scanner.js`)

#### Key Functions

##### `scanProject(rootPath, quick)`
Scans project structure.

**Parameters:**
- `rootPath` (string): Project root path
- `quick` (boolean): Quick scan mode

**Returns:**
- `Object` - Project map with files and metadata

##### `quickRefresh()`
Performs quick refresh of changed files.

**Returns:**
- `Object` - Updated project map

## Configuration Options

### Environment Variables

Create a `.env` file in the project root:

```bash
# LLM Configuration
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=deepseek-coder:6.7b
MAX_RETRIES=3

# Logging
DEBUG=true
LOG_LEVEL=debug

# Environment
NODE_ENV=development
```

### Configuration Structure

```javascript
{
  llm: {
    url: "string",           // LLM API URL
    model: "string",         // Model name
    maxRetries: "number",    // Max retry attempts
    temperature: "number",   // LLM temperature
    maxTokens: "number"      // Max tokens per response
  },
  conversation: {
    maxHistory: "number"     // Max conversation turns
  },
  memory: {
    enabled: "boolean",      // Enable memory system
    maxEntries: "number",    // Max memory entries
    file: "string",          // Memory storage file
    indexFile: "string"      // Memory index file
  },
  logging: {
    level: "string",         // Log level (debug, info, warn, error)
    enableDebug: "boolean"   // Enable debug logging
  },
  project: {
    root: "string",          // Project root directory
    docsPath: "string",      // Agent docs path
    readmePath: "string"     // README path
  }
}
```

## Error Handling

### Error Types

- **ConfigurationError**: Invalid configuration
- **NetworkError**: LLM API connectivity issues
- **FileError**: File system operations
- **ParseError**: Response parsing failures

### Error Response Format

```javascript
{
  error: {
    message: "Error description",
    type: "ErrorType",
    context: { /* additional context */ },
    timestamp: "ISO string"
  }
}
```

## Usage Examples

### Basic Agent Setup
```javascript
const { getConfig } = require('./config');
const { getLogger } = require('./src/utils/logger');
const LLMService = require('./src/services/llm');
const ToolParser = require('./src/parsers/tool-parser');

// Initialize services
const config = getConfig();
const logger = getLogger(config);
const llmService = new LLMService(config, logger);
const parser = new ToolParser(logger);

// Use services
const response = await llmService.callLLM(prompt, systemPrompt);
const operations = parser.parseToolBlocks(response.raw);
```

### Custom Configuration
```javascript
const { Config } = require('./config');

const customConfig = new Config();
customConfig.set('llm.model', 'custom-model');
customConfig.set('logging.level', 'debug');

const logger = getLogger(customConfig.config);
```

### Memory Integration
```javascript
const memory = require('./tools/memory');

// Record a change
memory.autoRecordChange(
  'app.js',
  'old code',
  'new code',
  'Fixed bug in initialization'
);

// Get context for a file
const suggestions = memory.getContextSuggestions('app.js');
```

This API reference provides comprehensive documentation for integrating with and extending the Local Agent system.
