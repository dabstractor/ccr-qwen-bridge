name: "Tool Calling Translation Fix - Complete Implementation PRP"
description: |
  Fix tool calling translation issues in ccr-qwen-bridge to enable proper OpenAI tool calling compatibility with Qwen API

---

## Goal

**Feature Goal**: Fix the broken tool calling translation in ccr-qwen-bridge proxy server to enable claude-code-router to successfully use tools through the Qwen API proxy

**Deliverable**: Fully functional tool calling proxy that correctly translates OpenAI tool calling format to Qwen-compatible format while preserving all tool call semantics and state

**Success Definition**: claude-code-router can successfully execute `ccr code` and complete the task "Update the default port in this project to something random" through the proxy without tool calling failures

## User Persona

**Target User**: Developers using claude-code-router (ccr) who want to access Qwen's free daily API quota for tool calling operations

**Use Case**: Running AI coding assistants through a proxy to utilize Qwen API instead of paying for OpenAI API while maintaining full tool calling functionality  

**User Journey**: 
1. User runs `ccr code` which connects to ccr-qwen-bridge proxy
2. User asks AI assistant to perform file operations like "update the default port"
3. AI assistant makes tool calls to read/write files through the proxy
4. Proxy correctly translates tool calls between OpenAI and Qwen formats
5. Tool operations complete successfully and user sees expected results

**Pain Points Addressed**: 
- Current proxy strips tool definitions from requests
- Tool messages incorrectly converted to user messages
- Qwen API validation errors due to malformed tool call sequences  
- Complete tool calling failure preventing any file operations

## Why

- **Business Value**: Enables free access to Qwen's daily API quota for coding operations, reducing OpenAI API costs
- **Integration Benefit**: Maintains full compatibility with existing OpenAI-format tool calling clients like claude-code-router
- **Technical Necessity**: Current implementation is fundamentally broken and prevents basic tool calling functionality
- **User Impact**: Unblocks developers from using cost-effective Qwen API for AI coding assistance

## What

The implementation must fix the core tool calling translation issues:

1. **Request Translation**: Properly forward tool definitions and tool_choice parameters from OpenAI format to Qwen API
2. **Message Transformation**: Correctly handle tool messages and maintain tool_call_id relationships  
3. **Response Translation**: Preserve tool_calls in assistant responses and convert back to OpenAI format
4. **State Management**: Track tool call execution state and validate tool call sequences
5. **Error Handling**: Provide proper error recovery for tool calling failures

### Success Criteria

- [ ] Tool definitions properly forwarded in OpenAI-compatible format to Qwen API
- [ ] Tool messages preserve role="tool" and tool_call_id mapping  
- [ ] Assistant messages with tool_calls correctly converted and preserved
- [ ] Tool call sequences pass Qwen API validation requirements
- [ ] claude-code-router can successfully read/write files through proxy
- [ ] Integration test passes: `ccr code` completes port update task successfully
- [ ] All existing non-tool functionality continues to work unchanged

## All Needed Context

### Context Completeness Check

This PRP provides complete context from research of the qwen-code project's sophisticated tool calling implementation, OpenAI 2024 API specifications, Qwen API compatibility requirements, and current codebase analysis.

### Documentation & References

```yaml
# CRITICAL READING - Tool Calling Implementation Patterns  
- docfile: PRPs/ai_docs/tool_calling_patterns.md
  why: Contains proven patterns from qwen-code project for robust tool calling translation
  section: Conversion patterns, state management, error handling best practices
  critical: Shows exactly how to preserve tool call structure and avoid message conversion anti-patterns

# CRITICAL READING - API Compatibility Requirements
- docfile: PRPs/ai_docs/api_compatibility_requirements.md  
  why: Comprehensive OpenAI 2024 and Qwen API tool calling specifications
  section: Message formats, validation requirements, error patterns
  critical: Qwen API requires strict tool_call_id validation and specific message sequences

# OpenAI Function Calling Official Documentation
- url: https://platform.openai.com/docs/guides/function-calling
  why: Current 2024 OpenAI tool calling specification with tools/tool_choice parameters
  critical: tools parameter replaces deprecated functions, structured outputs with strict mode
  
- url: https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools  
  why: Exact API parameter specifications for tool definitions and tool_choice options
  critical: Tool choice values, parameter validation requirements

# Qwen Function Calling Documentation
- url: https://qwen.readthedocs.io/en/latest/framework/function_call.html
  why: Qwen-specific tool calling capabilities and optimization recommendations
  critical: Hermes-style tool calling templates, parallel function call support

- url: https://www.alibabacloud.com/help/en/model-studio/developer-reference/compatibility-of-openai-with-dashscope
  why: Official Qwen OpenAI compatibility documentation
  critical: Compatible endpoint URLs, supported OpenAI features, format requirements

# Current Implementation Files for Pattern Reference
- file: /home/dustin/src/qwen-code/packages/core/src/core/openaiContentGenerator.ts
  why: Proven implementation of OpenAI ↔ Gemini tool calling translation
  pattern: convertGeminiToolsToOpenAI, convertToOpenAIFormat, convertToGeminiFormat methods
  gotcha: Sophisticated state management and JSON parsing with error handling required

- file: /home/dustin/projects/ccr-qwen-bridge/src/request-translator.js  
  why: Current broken implementation that needs fixing
  pattern: Shows what NOT to do - tool message conversion, aggressive filtering
  gotcha: Current approach fundamentally breaks tool calling semantics
```

### Current Codebase Tree

```bash
ccr-qwen-bridge/
├── package.json              # Node.js ESM project, Express.js, test runner config
├── src/
│   ├── server.js             # Main Express server entry point
│   ├── config-manager.js     # Configuration management with env vars
│   ├── logger.js             # Structured JSON logging  
│   ├── oauth-token-manager.js # OAuth 2.0 token management for Qwen API
│   ├── request-translator.js # BROKEN - Main file needing fixes
│   └── error-handler.js      # HTTP error handling middleware
├── test/
│   ├── basic.test.js         # Basic functionality tests
│   ├── config.test.js        # Configuration tests  
│   └── error-handler.test.js # Error handling tests
└── PRPs/
    └── ai_docs/              # Implementation guidance documentation
        ├── tool_calling_patterns.md
        └── api_compatibility_requirements.md
```

### Desired Codebase Tree (Files to Add/Modify)

```bash
ccr-qwen-bridge/
├── src/
│   ├── request-translator.js # MODIFY - Fix tool calling translation logic
│   └── tool-call-validator.js # ADD - New validation logic for tool sequences  
├── test/
│   ├── tool-calling.test.js  # ADD - Comprehensive tool calling tests
│   └── integration.test.js   # ADD - End-to-end integration tests
└── validation/
    └── ccr-integration-test.js # ADD - ccr tool calling validation script
```

### Known Gotchas & Library Quirks

```javascript
// CRITICAL: Qwen API requires exact tool_call_id matching
// Messages with role="assistant" + tool_calls MUST be followed by role="tool" responses
// Each tool_call.id must have corresponding tool message with matching tool_call_id

// CRITICAL: Never convert tool messages to user messages - breaks tool calling
// Current broken pattern in request-translator.js lines 215-222:
if (message.role === 'tool') {
  return {
    role: 'user',  // ❌ WRONG - destroys tool call semantics  
    content: `Tool result from ${message.tool_call_id}:\n${message.content}`
  };
}

// CRITICAL: Qwen API validation error pattern to handle:
// "An assistant message with \"tool_calls\" must be followed by tool messages responding to each \"tool_call_id\""

// CRITICAL: Node.js ESM import syntax required (type: "module" in package.json)
import { RequestTranslator } from './request-translator.js';  // Note .js extension required

// CRITICAL: Express.js middleware pattern for request/response handling
app.use('/v1/chat/completions', async (req, res, next) => {
  // Request validation and translation logic here
});

// CRITICAL: Qwen OAuth token must be refreshed before expiration  
// Token manager handles this automatically if properly integrated
```

## Implementation Blueprint

### Data Models and Structure

Create robust data models for tool calling state management and validation.

```javascript
// Tool calling state management types
const ToolCallState = {
  PENDING: 'pending',
  EXECUTING: 'executing', 
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Tool call validation result structure  
const ValidationResult = {
  valid: Boolean,
  errors: Array,
  warnings: Array,
  toolCallCount: Number,
  respondedToolCallCount: Number
};

// OpenAI tool call message format preservation
const OpenAIToolCallMessage = {
  role: 'assistant',
  content: String,
  tool_calls: [{
    id: String,
    type: 'function',
    function: {
      name: String,
      arguments: String  // JSON stringified
    }
  }]
};

// Tool response message format  
const ToolResponseMessage = {
  role: 'tool',
  tool_call_id: String,
  content: String
};
```

### Implementation Tasks (Ordered by Dependencies)

```yaml
Task 1: CREATE src/tool-call-validator.js
  - IMPLEMENT: Tool call sequence validation logic with state tracking
  - FOLLOW pattern: Validate tool_call_id consistency, detect orphaned calls/responses
  - NAMING: validateToolCallSequence, trackToolCallState, cleanupOrphanedCalls
  - DEPENDENCIES: None - foundational validation logic
  - PLACEMENT: Separate module for testability and reusability

Task 2: MODIFY src/request-translator.js - Fix translateOpenAIToQwen method  
  - IMPLEMENT: Proper tool definition forwarding without stripping
  - FOLLOW pattern: /home/dustin/src/qwen-code/packages/core/src/core/openaiContentGenerator.ts lines 251-255
  - FIXING: Current lines 29-33 correctly preserve tools but transformMessagesForQwen breaks it
  - DEPENDENCIES: Task 1 validator for sequence validation
  - PLACEMENT: Update existing method, maintain API compatibility

Task 3: MODIFY src/request-translator.js - Fix transformMessagesForQwen method
  - IMPLEMENT: Preserve tool message structure instead of converting to user messages  
  - FOLLOW pattern: qwen-code project convertToOpenAIFormat lines 589-599 for proper tool message handling
  - FIXING: Remove broken conversion logic from lines 214-247 that destroys tool semantics
  - DEPENDENCIES: Task 1 for validation, Task 2 for tool definition handling
  - PLACEMENT: Complete rewrite of message transformation logic

Task 4: MODIFY src/request-translator.js - Enhance translateQwenToOpenAI method
  - IMPLEMENT: Robust tool call preservation and error handling in response translation
  - FOLLOW pattern: qwen-code openaiContentGenerator.ts convertToGeminiFormat lines 621-670  
  - FIXING: Current minimal implementation needs comprehensive tool call structure preservation
  - DEPENDENCIES: Tasks 1-3 for consistent tool call handling patterns
  - PLACEMENT: Update existing method with proper tool call structure handling

Task 5: CREATE test/tool-calling.test.js
  - IMPLEMENT: Comprehensive unit tests for tool calling translation scenarios
  - FOLLOW pattern: test/basic.test.js structure with Node.js test runner, proper assertions
  - COVERAGE: Tool definition forwarding, message transformation, response translation, validation
  - DEPENDENCIES: Tasks 1-4 implementation complete for testing
  - PLACEMENT: Test suite alongside existing test files

Task 6: CREATE test/integration.test.js  
  - IMPLEMENT: End-to-end integration tests with mock HTTP requests/responses
  - FOLLOW pattern: Express.js integration testing with supertest-style requests
  - COVERAGE: Complete tool calling workflow, error scenarios, edge cases
  - DEPENDENCIES: Tasks 1-5 for full implementation testing
  - PLACEMENT: Integration test suite for full workflow validation

Task 7: CREATE validation/ccr-integration-test.js
  - IMPLEMENT: Real-world validation script that tests with claude-code-router integration
  - FOLLOW pattern: Desktop Commander process execution for running `ccr code` commands
  - VALIDATION: Automated test of "update default port" task completion through proxy
  - DEPENDENCIES: All previous tasks complete, working proxy implementation
  - PLACEMENT: Validation directory for end-to-end acceptance testing
```

### Implementation Patterns & Key Details

```javascript
// CRITICAL PATTERN: Tool Definition Preservation (Task 2)
// Current WORKING code in request-translator.js lines 29-33:
const qwenRequest = {
  model: openAIRequest.model || 'qwen-coder-plus',
  messages: this.transformMessagesForQwen(openAIRequest.messages || []), // ❌ THIS BREAKS IT
  // ... other params ...
  // ✅ THESE LINES ARE CORRECT - keep them:
  tools: openAIRequest.tools,
  tool_choice: openAIRequest.tool_choice,
  function_call: openAIRequest.function_call,
  functions: openAIRequest.functions
};

// CRITICAL PATTERN: Message Transformation Fix (Task 3)
// REPLACE broken transformMessagesForQwen with this approach:
transformMessagesForQwen(messages) {
  // ✅ CORRECT: Preserve tool messages as-is
  return messages.map(message => {
    if (message.role === 'tool') {
      // Keep tool messages unchanged - Qwen API supports them directly
      return {
        role: 'tool',
        tool_call_id: message.tool_call_id,
        content: message.content
      };
    }
    // Handle other message types normally
    return message;
  });
}

// CRITICAL PATTERN: Tool Call Sequence Validation (Task 1)  
function validateToolCallSequence(messages) {
  const toolCallTracker = new Map();
  const errors = [];
  
  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls) {
      // Track pending tool calls
      for (const toolCall of message.tool_calls) {
        toolCallTracker.set(toolCall.id, { status: 'pending', call: toolCall });
      }
    }
    
    if (message.role === 'tool') {
      // Validate tool response has matching call
      if (!toolCallTracker.has(message.tool_call_id)) {
        errors.push(`Orphaned tool response: ${message.tool_call_id}`);
      } else {
        toolCallTracker.set(message.tool_call_id, { status: 'responded' });
      }
    }
  }
  
  // Check for unresolved tool calls
  const pendingCalls = [...toolCallTracker.entries()]
    .filter(([_, state]) => state.status === 'pending')
    .map(([id]) => id);
    
  if (pendingCalls.length > 0) {
    errors.push(`Missing tool responses for: ${pendingCalls.join(', ')}`);
  }
  
  return { valid: errors.length === 0, errors, toolCallTracker };
}

// CRITICAL PATTERN: Response Tool Call Preservation (Task 4)
translateQwenToOpenAI(qwenResponse) {
  const openAIResponse = {
    id: qwenResponse.id || this.generateId(),
    object: qwenResponse.object || 'chat.completion',
    created: qwenResponse.created || Math.floor(Date.now() / 1000),
    model: qwenResponse.model || 'qwen-coder-plus',
    choices: qwenResponse.choices || [],
    usage: qwenResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };

  // ✅ CORRECT: Preserve tool_calls structure completely  
  openAIResponse.choices = openAIResponse.choices.map((choice, index) => ({
    index: choice.index !== undefined ? choice.index : index,
    message: {
      role: choice.message?.role || 'assistant',
      content: choice.message?.content || '',
      // CRITICAL: Preserve tool_calls if present
      ...(choice.message?.tool_calls && { tool_calls: choice.message.tool_calls })
    },
    finish_reason: choice.finish_reason || 'stop'
  }));

  return openAIResponse;
}
```

### Integration Points

```yaml
EXPRESS_SERVER:
  - middleware: Request validation before translation in src/server.js
  - endpoint: POST /v1/chat/completions handles tool calling requests
  - pattern: "Async middleware with proper error handling and response streaming"

OAUTH_INTEGRATION:  
  - manager: oauth-token-manager.js provides Qwen API authentication
  - pattern: "await tokenManager.getValidToken() before API requests"
  - endpoint: "Uses resource_url from token response or fallback to dashscope URL"

LOGGING:
  - integration: logger.js for structured JSON logging of tool calling operations
  - pattern: "Log tool call counts, validation results, translation steps"
  - levels: "Info for successful operations, warn for validation issues, error for failures"

CONFIG:
  - manager: config-manager.js for environment variable configuration
  - pattern: "No new config needed - uses existing timeout and API URL settings"
  - validation: "Existing port, host, and timeout validations apply"
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# Run after each file creation/modification - fix before proceeding
npm test                           # Node.js native test runner validation
node --check src/request-translator.js    # Syntax validation for modified files
node --check src/tool-call-validator.js   # Syntax validation for new validator

# ESM import validation  
node -e "import('./src/request-translator.js').then(() => console.log('✅ Imports valid'))"
node -e "import('./src/tool-call-validator.js').then(() => console.log('✅ Validator imports valid'))"

# Expected: Zero syntax errors, successful imports. If errors exist, fix before proceeding.
```

### Level 2: Unit Tests (Component Validation)

```bash
# Test each component as it's created/modified
npm test test/tool-calling.test.js        # Tool calling unit tests
npm test test/basic.test.js               # Ensure existing tests still pass  
npm test test/config.test.js              # Ensure config integration works
npm test test/error-handler.test.js       # Ensure error handling unchanged

# Run specific test patterns
npm test -- --grep "tool.*call"          # Run only tool calling related tests
npm test -- --grep "translate"           # Run only translation tests

# Expected: All tests pass. If failing, debug root cause and fix implementation.
```

### Level 3: Integration Testing (System Validation)

```bash
# Full system integration testing
npm test test/integration.test.js         # End-to-end integration tests
npm start &                               # Start proxy server in background  
SERVER_PID=$!
sleep 3                                   # Allow server startup time

# Tool calling integration validation with curl
curl -X POST http://localhost:8732/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "model": "qwen-coder-plus",
    "messages": [
      {"role": "user", "content": "What is the weather?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get weather",
          "parameters": {
            "type": "object",
            "properties": {"location": {"type": "string"}},
            "required": ["location"]
          }
        }
      }
    ]
  }' \
  | jq .  # Pretty print JSON response

# Cleanup
kill $SERVER_PID

# Expected: Successful tool calling request/response, no validation errors
```

### Level 4: Real-World Validation (ccr Integration)

```bash
# CRITICAL: This is the ultimate validation test
node validation/ccr-integration-test.js   # Automated ccr integration test

# Manual validation steps:
# 1. Ensure ccr-qwen-bridge proxy is running on localhost:8732
npm start &

# 2. Configure claude-code-router to use proxy (if not automated)
export OPENAI_BASE_URL=http://localhost:8732/v1
export OPENAI_API_KEY=your-qwen-token

# 3. Run actual ccr command that requires tool calling
ccr code --prompt "Update the default port in this project to something random."

# 4. Verify task completion
# Expected: 
# - claude-code-router connects successfully to proxy
# - Tool calls for file reading/writing work correctly
# - Default port gets updated in config files  
# - No tool calling validation errors in proxy logs
# - Task completed successfully with confirmation

# Alternative validation using Desktop Commander MCP
mcp__desktop-commander__start_process "ccr code" 30000
mcp__desktop-commander__interact_with_process $PID "Update the default port in this project to something random."
# Expected: Successful task completion through proxy

# Validation log analysis
grep "tool" logs/bridge.log | grep -E "(ERROR|WARN)" 
# Expected: No tool calling errors in logs
```

## Final Validation Checklist

### Technical Validation

- [ ] All 4 validation levels completed successfully
- [ ] All tests pass: `npm test`
- [ ] No syntax errors: `node --check src/*.js` 
- [ ] ESM imports work: Module loading successful
- [ ] Express server starts without errors
- [ ] Tool calling endpoint responds correctly

### Feature Validation

- [ ] Tool definitions forwarded to Qwen API correctly
- [ ] Tool messages preserve role="tool" and tool_call_id
- [ ] Assistant messages with tool_calls preserved in responses  
- [ ] Tool call sequence validation prevents API errors
- [ ] ccr integration test passes: Port update task completes successfully
- [ ] All existing functionality works unchanged

### Code Quality Validation

- [ ] Follows existing JavaScript/Node.js patterns and conventions
- [ ] Error handling comprehensive with proper logging
- [ ] File placement matches desired codebase tree structure
- [ ] Tool call state management robust and tested
- [ ] Anti-patterns avoided (no tool message conversion to user messages)

### Real-World Integration

- [ ] claude-code-router successfully connects to proxy
- [ ] Tool calling operations complete without validation errors
- [ ] File operations work correctly through tool calls
- [ ] Default port update task verifies end-to-end functionality
- [ ] Proxy logs show successful tool calling workflow

---

## Anti-Patterns to Avoid

- ❌ Don't convert tool messages to user messages - breaks tool calling semantics
- ❌ Don't filter out tool calls that lack responses - breaks ongoing conversations
- ❌ Don't ignore tool_call_id relationships - Qwen API strictly validates them
- ❌ Don't strip tool definitions from requests - completely breaks tool functionality
- ❌ Don't assume tool call arguments are valid JSON without parsing safely
- ❌ Don't skip validation steps - each level catches different classes of errors
- ❌ Don't modify tool call IDs - they must remain consistent across the proxy

## Confidence Score: 9/10

This PRP provides comprehensive context from proven implementations, detailed API specifications, current codebase analysis, and step-by-step implementation guidance. The validation includes real-world testing with claude-code-router integration. The only potential challenge is handling edge cases in tool call state management, but the qwen-code project patterns provide solid guidance for robust implementation.
