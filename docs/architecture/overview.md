# Architecture Overview

This document describes the modular architecture of the Local Agent system.

## System Architecture

The Local Agent follows a modular, service-oriented architecture with clear separation of concerns.

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Agent                           │
│                      (src/agent.js)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Config    │ │    Logger   │ │ Tool Parser │
│   Service   │ │   Service   │ │   Service   │
└─────────────┘ └─────────────┘ └─────────────┘
         │            │            │
         └────────────┼────────────┘
                      │
         ┌────────────▼────────────┐
         │      LLM Service        │
│    (src/services/llm.js)   │
         └─────────────────────────┘
                      │
         ┌────────────▼────────────┐
         │    External Services    │
         │  ┌─────────────────┐    │
         │  │   Ollama API    │    │
         │  └─────────────────┘    │
         │  ┌─────────────────┐    │
         │  │  File System    │    │
         │  └─────────────────┘    │
         └─────────────────────────┘
```

## Core Components

### 1. Main Agent (`src/agent.js`)
The main application entry point that orchestrates all other components.

**Responsibilities:**
- User interaction and conversation management
- Coordinating between services
- Managing conversation history
- Handling the main application loop

### 2. Configuration Service (`config/index.js`)
Centralized configuration management with environment support.

**Features:**
- Environment-based configuration (development, production, test)
- `.env` file support
- Configuration validation
- Runtime configuration updates

**Configuration Structure:**
```javascript
{
  llm: {
    url: "http://localhost:11434/api/generate",
    model: "deepseek-coder:6.7b",
    maxRetries: 3,
    temperature: 0.1,
    maxTokens: 4000
  },
  conversation: {
    maxHistory: 20
  },
  memory: {
    enabled: true,
    maxEntries: 1000,
    file: "persistent_memory.jsonl",
    indexFile: "memory_index.json"
  },
  logging: {
    level: "info",
    enableDebug: false
  }
}
```

### 3. Logger Service (`src/utils/logger.js`)
Structured logging with multiple levels and context.

**Features:**
- Log levels: debug, info, warn, error
- Structured logging with context
- Child loggers with bound context
- Operation tracking (start, complete, fail)

**Usage:**
```javascript
const logger = getLogger(config);
logger.info("Application started", { version: "1.0.0" });
logger.operationStart("file_read", { file: "example.js" });
```

### 4. LLM Service (`src/services/llm.js`)
Handles communication with the Ollama API.

**Responsibilities:**
- HTTP requests to LLM API
- Retry logic with exponential backoff
- Prompt building and formatting
- Error handling and logging

**Key Methods:**
- `callLLM(prompt, systemPrompt)` - Main LLM interaction
- `_buildFullPrompt()` - Constructs complete prompts
- `_formatHistory()` - Formats conversation history

### 5. Tool Parser (`src/parsers/tool-parser.js`)
Parses LLM responses into structured operations.

**Supported Tools:**
- `chat` - Text responses to user
- `list_files` - Directory listing
- `read_file` - File content reading
- `write_file` - File creation/updating

**Features:**
- Duplicate operation prevention
- File existence validation
- Code fence cleaning
- Fallback raw code parsing

## Data Flow

1. **User Input** → Main Agent
2. **Prompt Building** → LLM Service
3. **LLM Request** → Ollama API
4. **Response Parsing** → Tool Parser
5. **Operation Execution** → File System/Memory
6. **Result Formatting** → User Output

## Error Handling Strategy

### Layered Error Handling
- **Service Layer**: Specific error handling with context
- **Main Agent**: Fallback handling and user communication
- **Logger**: Structured error logging with context

### Error Categories
- **Configuration Errors**: Missing or invalid config
- **Network Errors**: LLM API connectivity issues
- **File System Errors**: Permission or I/O problems
- **Parsing Errors**: Invalid LLM response format

## Memory Integration

The memory system integrates with the main agent through:
- **Context Building**: Relevant past fixes retrieval
- **Change Recording**: Automatic recording of file modifications
- **Tag-based Organization**: Categorization by file type and operation

## Testing Strategy

### Unit Tests
- Individual service testing
- Mock external dependencies
- Configuration validation testing

### Integration Tests
- End-to-end workflow testing
- LLM service integration
- File system operations

### Test Organization
```
testing/
├── test_all.js          # Full test suite
├── test_scanner.js      # Scanner-specific tests
└── README.md           # Test documentation
```

## Extensibility

### Adding New Tools
1. Add tool parsing logic to `ToolParser`
2. Add operation handling in main agent
3. Update documentation

### Adding New Services
1. Create service class in `src/services/`
2. Initialize in main agent
3. Add configuration options
4. Update architecture documentation

### Configuration Extensions
1. Add new config sections to `config/index.js`
2. Add validation rules
3. Update environment configs

## Performance Considerations

### Memory Management
- Conversation history trimming
- Memory entry limits
- Efficient indexing strategies

### Network Optimization
- Request retry logic
- Connection pooling considerations
- Timeout handling

### File System Optimization
- Efficient file scanning
- Caching strategies
- Batch operations where possible

## Security Considerations

### Input Validation
- File path sanitization
- Command injection prevention
- Content validation

### Configuration Security
- Sensitive data handling
- Environment variable usage
- Access control considerations

This modular architecture provides a solid foundation for maintenance, testing, and future enhancements while maintaining clear separation of concerns and consistent error handling throughout the system.
