# Tool Call Validation System Fix

## Goal

**Feature Goal**: Fix critical failures in the tool call validation system that are causing widespread tool call rejections and API authentication errors

**Deliverable**: A fully functional tool call validation system with proper nested parameter handling, correct Gemini API authentication, and robust JSON parsing

**Success Definition**: 99.5%+ tool call success rate with zero "Invalid tool parameters" errors for valid tool calls and successful Gemini API authentication

## User Persona

**Target User**: Developers and end-users using the CCR Qwen Bridge for tool-based interactions

**Use Case**: Making tool calls through OpenAI-compatible clients that are proxied to Qwen/Gemini APIs

**User Journey**: 
1. User invokes a tool call (e.g., TodoWrite, file operations, MCP tools)
2. System validates tool parameters and structure
3. System translates and forwards request to appropriate provider API
4. System processes response and returns to user

**Pain Points Addressed**: 
- Tool calls failing with "Invalid tool parameters" errors
- Gemini API requests failing with 403 authentication errors
- JSON parsing failures in tool arguments
- Inconsistent tool call validation behavior

## Why

- **System Reliability**: Tool calls are fundamental to the system's functionality - failures block core operations
- **User Experience**: Repeated tool call failures make the system unusable
- **API Integration**: Authentication issues prevent access to Gemini API features
- **Data Integrity**: JSON parsing failures cause loss of user work and incorrect tool execution

## What

A comprehensive fix for the tool call validation system addressing four critical issues:

1. **Nested Parameter Validation Fix**: Correct the schema cleaning logic that incorrectly processes nested required parameters
2. **Gemini Authentication Scope Fix**: Add missing OAuth scopes for proper API access
3. **JSON Parsing Robustness**: Improve handling of malformed JSON in tool arguments
4. **Validation Logic Consistency**: Ensure consistent validation behavior across all tool types

### Success Criteria

- [ ] Zero "Invalid tool parameters" errors for valid tool calls
- [ ] 99.5%+ success rate for all tool call types (TodoWrite, MultiEdit, file operations, MCP tools)
- [ ] Successful Gemini API authentication with proper scopes
- [ ] Robust JSON parsing with fallback mechanisms
- [ ] Consistent validation behavior across all providers

## All Needed Context

### Context Completeness Check

_This PRP provides everything needed to implement the tool call validation fixes, including specific file paths, exact error patterns, root cause analysis, and step-by-step implementation guidance._

### Documentation & References

```yaml
- url: https://developers.google.com/workspace/guides/auth-overview
  why: OAuth 2.0 authentication patterns and scope requirements for Google APIs
  critical: Proper scope configuration prevents 403 authentication errors

- url: https://ai.google.dev/gemini-api/docs/oauth
  why: Gemini-specific OAuth requirements and authentication setup
  critical: Required scopes for generative-language API access

- file: src/translators/gemini-translator.js
  why: Contains the flawed removeUnsupportedSchemaFields method that causes validation failures
  pattern: Lines 782-813 show incorrect nested parameter validation logic
  gotcha: Method filters required arrays against wrong property scope, breaking nested schemas

- file: src/auth/gemini-auth-manager.js
  why: Contains incomplete OAuth scope configuration
  pattern: Lines 23-27 show current scope setup missing generative-language scope
  gotcha: Missing scope causes 403 "insufficient authentication scopes" errors

- file: src/tool-call-validator.js
  why: Core validation logic that works correctly but is affected by schema issues
  pattern: ValidationResult class and validateToolCallSequence method structure
  gotcha: Validation passes but downstream schema cleaning breaks valid schemas

- file: src/translators/qwen-translator.js
  why: Similar JSON parsing patterns that handle malformed arguments correctly
  pattern: Lines 118-126 show robust error handling for invalid JSON
  gotcha: Provides fallback to empty object while logging detailed error information
```

### Current Codebase tree

```bash
src/
├── auth/
│   ├── base-auth-manager.js
│   ├── gemini-auth-manager.js
│   └── qwen-auth-manager.js
├── translators/
│   ├── base-translator.js
│   ├── gemini-translator.js
│   └── qwen-translator.js
├── providers/
│   ├── base-provider.js
│   ├── gemini-provider.js
│   └── qwen-provider.js
├── tool-call-validator.js
└── server.js
```

### Desired Codebase tree with files to be modified

```bash
src/
├── auth/
│   ├── gemini-auth-manager.js (MODIFY: Add missing OAuth scope)
├── translators/
│   ├── gemini-translator.js (MODIFY: Fix nested parameter validation)
│   └── qwen-translator.js (MODIFY: Enhance JSON parsing robustness)
├── tool-call-validator.js (MODIFY: Add better error reporting)
└── utils/
    └── json-parser.js (CREATE: Centralized JSON parsing utilities)
```

### Known Gotchas & Library Quirks

```javascript
// CRITICAL: Gemini API requires specific OAuth scopes
// Missing 'https://www.googleapis.com/auth/generative-language.retriever' causes 403 errors

// CRITICAL: removeUnsupportedSchemaFields processes nested schemas incorrectly
// It applies top-level property validation to nested object requirements
// This breaks TodoWrite and other tools with array parameters containing objects

// CRITICAL: JSON.parse() fails on single-quoted properties
// Tool arguments like "{'content': 'value'}" must be "{"content": "value"}"
// Need robust parsing that handles mixed quote formats

// CRITICAL: Schema validation must distinguish between:
// - Top-level tool parameters (e.g., 'todos' for TodoWrite)
// - Nested object properties within arrays (e.g., 'content', 'status' within todo items)
```

## Implementation Blueprint

### Data models and structure

```javascript
// Enhanced validation result structure
class ValidationResult {
  constructor(valid = true, errors = [], warnings = []) {
    this.valid = valid;
    this.errors = errors;
    this.warnings = warnings;
    this.toolCallCount = 0;
    this.respondedToolCallCount = 0;
    // NEW: Add detailed context for debugging
    this.context = {
      schemaValidation: [],
      parameterProcessing: [],
      jsonParsing: []
    };
  }
}

// JSON parsing utilities
class JSONParser {
  static parseToolArguments(jsonString) {
    // Robust parsing with fallback mechanisms
    // Handle mixed quotes, escape sequences, malformed JSON
  }
}
```

### Implementation Tasks (ordered by dependencies)

```yaml
Task 1: FIX src/auth/gemini-auth-manager.js
  - MODIFY: Lines 23-27 SCOPE configuration
  - ADD: 'https://www.googleapis.com/auth/generative-language.retriever' to SCOPE array
  - VERIFY: All required Gemini API scopes are present
  - PRESERVE: Existing scope entries for cloud-platform, userinfo.email, userinfo.profile

Task 2: CREATE src/utils/json-parser.js
  - IMPLEMENT: JSONParser utility class with robust parsing methods
  - ADD: parseToolArguments method with fallback mechanisms
  - HANDLE: Single quotes, mixed quotes, escape sequences, malformed JSON
  - RETURN: Parsed object or safe fallback with detailed error logging
  - FOLLOW pattern: Error handling from qwen-translator.js lines 118-126

Task 3: FIX src/translators/gemini-translator.js
  - MODIFY: removeUnsupportedSchemaFields method (lines 782-813)
  - SEPARATE: Top-level parameter validation from nested object validation
  - PRESERVE: Required parameters for top-level tool parameters
  - VALIDATE: Nested object schemas independently without affecting parent
  - ADD: Better logging for schema validation steps
  - IMPORT: JSONParser utility from Task 2

Task 4: ENHANCE src/translators/qwen-translator.js
  - MODIFY: JSON parsing in lines 118-126 to use JSONParser utility
  - IMPROVE: Error context and reporting for malformed tool arguments
  - ADD: More detailed logging for JSON parsing failures
  - PRESERVE: Existing fallback behavior (empty object for invalid JSON)

Task 5: IMPROVE src/tool-call-validator.js
  - ENHANCE: ValidationResult class with detailed error context
  - ADD: Schema validation error tracking
  - IMPROVE: Error messages to include specific parameter information
  - PRESERVE: Existing validation logic and tool call tracking

Task 6: UPDATE tests and validation
  - CREATE: Unit tests for JSONParser utility
  - UPDATE: Existing tests to cover new validation scenarios
  - VERIFY: All tool types pass validation (TodoWrite, MultiEdit, file ops, MCP tools)
  - TEST: Gemini API authentication with new scopes
```

### Implementation Patterns & Key Details

```javascript
// Pattern: Robust JSON parsing with fallbacks
class JSONParser {
  static parseToolArguments(jsonString, context = {}) {
    // First attempt: Standard JSON.parse
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      // Second attempt: Fix common issues (single quotes, etc.)
      try {
        const fixedJson = jsonString.replace(/'/g, '"');
        return JSON.parse(fixedJson);
      } catch (fixError) {
        // Log detailed error and return safe fallback
        logger.warn('Failed to parse tool arguments, using fallback', {
          ...context,
          originalError: error.message,
          fixAttemptError: fixError.message,
          jsonLength: jsonString.length,
          jsonPreview: jsonString.substring(0, 100)
        });
        return {};
      }
    }
  }
}

// Pattern: Separate schema validation logic
removeUnsupportedSchemaFields(obj, isTopLevel = true) {
  // CRITICAL: Only validate top-level required arrays against top-level properties
  if (isTopLevel && obj.properties && obj.required && Array.isArray(obj.required)) {
    // Filter required array only for top-level schemas
    obj.required = obj.required.filter(propName => obj.properties[propName]);
  }
  
  // Recursively clean nested objects without affecting parent validation
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      value.forEach(item => this.removeUnsupportedSchemaFields(item, false));
    } else if (value && typeof value === 'object') {
      this.removeUnsupportedSchemaFields(value, false);
    }
  }
}

// Pattern: Enhanced Gemini OAuth scope configuration
constructor(credentialsPath, clientId, clientSecret, logger) {
  // ... existing code ...
  this.SCOPE = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/generative-language.retriever', // NEW: Required for Gemini API
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];
}
```

### Integration Points

```yaml
AUTHENTICATION:
  - update: Gemini OAuth scope configuration
  - verify: Token refresh includes new scopes
  - test: API access with enhanced permissions

VALIDATION:
  - integrate: JSONParser utility across all translators
  - enhance: Error reporting with detailed context
  - preserve: Existing validation behavior for valid cases

LOGGING:
  - improve: Schema validation error messages
  - add: JSON parsing failure details
  - maintain: Existing log levels and formats
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# Run after each file modification
ruff check src/utils/json-parser.js --fix
ruff check src/auth/gemini-auth-manager.js --fix  
ruff check src/translators/gemini-translator.js --fix
ruff check src/translators/qwen-translator.js --fix
ruff check src/tool-call-validator.js --fix

# Note: This is a JavaScript project, so use appropriate linting tools
npm run lint

# Expected: Zero linting errors before proceeding
```

### Level 2: Unit Tests (Component Validation)

```bash
# Test each component as modified
npm test src/utils/json-parser.test.js
npm test src/translators/tests/gemini-translator.test.js
npm test src/auth/tests/gemini-auth-manager.test.js

# Integration tests
npm test src/translators/
npm test src/auth/

# Expected: All tests pass, including new validation scenarios
```

### Level 3: Integration Testing (System Validation)

```bash
# Service startup validation
npm start &
sleep 3

# Health check
curl -f http://localhost:31337/health || echo "Health check failed"

# Tool call validation tests
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini/gemini-pro",
    "messages": [{"role": "user", "content": "Test message"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "TodoWrite",
          "parameters": {
            "type": "object",
            "properties": {
              "todos": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "content": {"type": "string"},
                    "status": {"type": "string"}
                  },
                  "required": ["content", "status"]
                }
              }
            },
            "required": ["todos"]
          }
        }
      }
    ]
  }' | jq .

# Gemini authentication test
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini/gemini-pro",
    "messages": [{"role": "user", "content": "Simple test"}]
  }' | jq .

# Expected: No 403 errors, no "Invalid tool parameters" errors, successful responses
```

### Level 4: Creative & Domain-Specific Validation

```bash
# Complex tool call validation
node test-scripts/test-complex-tool-calls.js

# Authentication scope verification
node test-scripts/verify-gemini-scopes.js

# JSON parsing edge cases
node test-scripts/test-json-parsing-edge-cases.js

# Load testing with tool calls
for i in {1..100}; do
  curl -s -X POST http://localhost:31337/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"model": "qwen/qwen3-coder-plus", "messages": [{"role": "user", "content": "test"}]}' > /dev/null
done

# Expected: 100% success rate, no validation failures
```

## Final Validation Checklist

### Technical Validation

- [ ] All 4 validation levels completed successfully
- [ ] No "Invalid tool parameters" errors for valid tool calls
- [ ] Gemini API authentication succeeds with proper scopes
- [ ] JSON parsing handles malformed input gracefully
- [ ] Tool call success rate >99.5%

### Feature Validation

- [ ] TodoWrite tool calls succeed with complex nested parameters
- [ ] MultiEdit operations work correctly
- [ ] File operation tools (Read, Write, Edit) function properly
- [ ] MCP tools validate and execute successfully
- [ ] All provider APIs (Qwen, Gemini) authenticate correctly

### Code Quality Validation

- [ ] Schema validation logic clearly separates top-level from nested validation
- [ ] JSON parsing provides robust fallback mechanisms
- [ ] Error messages include actionable debugging information
- [ ] OAuth scope configuration includes all required permissions
- [ ] Logging provides sufficient detail for troubleshooting

### Documentation & Deployment

- [ ] Error handling is informative and actionable
- [ ] Validation failures include specific parameter context
- [ ] Authentication errors provide clear remediation steps
- [ ] Code changes preserve existing functionality

---

## Anti-Patterns to Avoid

- ❌ Don't mix top-level and nested parameter validation logic
- ❌ Don't fail tool calls due to schema cleaning side effects
- ❌ Don't ignore authentication scope requirements
- ❌ Don't let JSON parsing failures break entire tool calls
- ❌ Don't remove error context that helps debugging
- ❌ Don't change validation behavior for currently working tools