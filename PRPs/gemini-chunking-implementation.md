# Gemini Chunking Implementation PRP

## Goal

**Feature Goal**: Implement a robust chunking and batching solution for large requests to prevent timeouts and payload size limits when processing large files or messages with the Gemini provider, matching the chunking behavior of the gemini-cli tool.

**Deliverable**: A complete chunking utility integrated into the Gemini translator that automatically handles large requests by splitting them into manageable chunks, with configurable chunk size limits and batch processing capabilities.

**Success Definition**: Large file processing requests (20MB+) and large message sets (2000+ messages) are automatically chunked and processed without timeouts or payload size errors, maintaining the same user experience as smaller requests.

## User Persona

**Target User**: Developers using `claude-code-router` or other OpenAI-compatible clients who need to process large files or extensive message histories through Gemini models via the CCR Qwen Bridge.

**Use Case**: Processing large code files, extensive conversation histories, or document analysis tasks that exceed Gemini's natural processing limits but are supported by the gemini-cli chunking approach.

**User Journey**:
1. Developer sends a large file or message set to the server via OpenAI-compatible API
2. Server detects the request exceeds size/line limits during Gemini translation
3. Chunking utility automatically splits the request into manageable pieces
4. Each chunk is processed sequentially or in batches
5. Responses are aggregated and returned as a single OpenAI-compatible response
6. Developer receives successful response without any manual chunking intervention

**Pain Points Addressed**:
- Timeouts when processing large files that exceed API limits
- Payload size errors (413) for requests over 20MB
- Manual chunking required by developers for large inputs
- Inconsistent behavior compared to gemini-cli tool

## Why

- **Business Value**: Enables processing of larger inputs without manual intervention, matching gemini-cli capabilities
- **User Impact**: Eliminates need for developers to manually chunk large requests
- **Integration**: Seamless integration with existing Gemini provider without breaking changes
- **Problems Solved**: Addresses timeout issues, payload size limits, and improves reliability for large requests

## What

### Core Functionality
1. **Chunking Utility**: Automatic splitting of large requests based on configurable limits
2. **Batch Processing**: Sequential or parallel processing of request chunks
3. **Response Aggregation**: Combining chunk responses into single coherent output
4. **Configuration Options**: Adjustable chunk size limits and processing parameters

### Success Criteria
- [ ] Requests exceeding 20MB are automatically chunked and processed
- [ ] Message sets exceeding 2000 lines are automatically chunked
- [ ] Chunked requests maintain semantic coherence in responses
- [ ] Configuration options allow customization of chunking behavior
- [ ] Performance impact is minimal for non-chunked requests
- [ ] Error handling gracefully manages chunk processing failures

## All Needed Context

### Context Completeness Check
Before implementing this PRP, ensure understanding of:
- Gemini API size and timeout limitations
- Existing request translation flow in `gemini-translator.js`
- Current timeout and size checking mechanisms
- OpenAI-compatible response format requirements

### Documentation & References

```yaml
# MUST READ - Include these in your context window
- url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/technical-reference.md#request-size-limits"
  why: "Understanding gemini-cli's chunking approach and size limits"
  critical: "gemini-cli uses 20MB limit and 2000 lines limit for chunking"

- file: "/home/dustin/projects/qwen-code-bridge/src/translators/gemini-translator.js"
  why: "Existing size checking and timeout handling implementation"
  pattern: "analyzeRequestSize() and forwardToProviderAPI() methods"
  gotcha: "Current implementation only warns but doesn't chunk - needs actual chunking logic"

- file: "/home/dustin/projects/qwen-code-bridge/src/config-manager.js"
  why: "Configuration management for chunking parameters"
  pattern: "Existing config loading and validation patterns"
  gotcha: "Need to add new chunking configuration options"

- docfile: "PRPs/ai_docs/gemini-api-integration-reference.md"
  why: "Understanding Gemini API request/response format details"
  section: "Request Format Conversion and API Endpoints"
```

### Current Codebase Tree

```bash
src/
├── translators/
│   ├── base-translator.js
│   ├── gemini-translator.js     # PRIMARY MODIFICATION TARGET
│   └── qwen-translator.js
├── providers/
│   └── gemini-provider.js       # Secondary integration point
├── config-manager.js            # Configuration extension needed
└── utils/                       # NEW DIRECTORY FOR CHUNKING UTILITIES
    └── chunking-utils.js        # NEW FILE - Core chunking logic
```

### Desired Codebase Tree with New Files

```bash
src/
├── translators/
│   ├── base-translator.js
│   ├── gemini-translator.js     # Enhanced with chunking integration
│   └── qwen-translator.js
├── providers/
│   └── gemini-provider.js       # Configuration updates
├── config-manager.js            # Extended with chunking options
├── utils/
│   └── chunking-utils.js        # NEW - Core chunking functionality
└── types/
    └── chunking-types.js        # NEW - Type definitions for chunking
```

### Known Gotchas of Our Codebase & Library Quirks

```python
# CRITICAL: Gemini API has specific size and timeout constraints
# Example: 20MB request size limit, 30-second default timeout
# Example: Large requests cause timeouts, not 413 errors in many cases

# CRITICAL: Chunking must maintain semantic context between chunks
# Example: Splitting mid-sentence breaks meaning, splitting between logical sections preserves it

# CRITICAL: Response aggregation must maintain OpenAI-compatible format
# Example: Each chunk response must be properly combined into single coherent response
```

## Implementation Blueprint

### Data Models and Structure

Create the core data models for chunking configuration and processing:

```javascript
// src/types/chunking-types.js
export interface ChunkingConfig {
  enabled: boolean;
  maxSizeBytes: number;        // Default: 15 * 1024 * 1024 (15MB)
  maxLines: number;            // Default: 1500
  maxTokens: number;           // Default: 30000
  batchSize: number;           // Default: 1
  overlapLines: number;        // Default: 50 (for context preservation)
  strategy: 'line-based' | 'token-based' | 'size-based'; // Default: 'line-based'
}

export interface Chunk {
  id: string;
  index: number;
  content: any;
  metadata: {
    originalPosition: number;
    sizeBytes: number;
    lineCount: number;
    tokenEstimate: number;
  };
}

export interface ChunkedRequest {
  chunks: Chunk[];
  originalRequest: any;
  config: ChunkingConfig;
}
```

### Implementation Tasks (Ordered by Dependencies)

```yaml
Task 1: CREATE src/utils/chunking-utils.js
  - IMPLEMENT: Core chunking logic functions
  - FOLLOW pattern: src/translators/base-translator.js (modular, well-documented functions)
  - INCLUDE: 
    * createChunksFromMessages() - Split large message arrays
    * createChunksFromText() - Split large text content
    * aggregateChunkResponses() - Combine responses from chunks
    * estimateTokens() - Token counting approximation
    * validateChunkingConfig() - Configuration validation
  - NAMING: camelCase functions, descriptive names
  - PLACEMENT: Utility functions in src/utils/

Task 2: CREATE src/types/chunking-types.js
  - IMPLEMENT: TypeScript-style JSDoc type definitions
  - FOLLOW pattern: Consistent with existing type documentation
  - INCLUDE: ChunkingConfig, Chunk, ChunkedRequest interfaces
  - NAMING: PascalCase for interface names
  - PLACEMENT: Type definitions in src/types/

Task 3: MODIFY src/config-manager.js
  - IMPLEMENT: Chunking configuration options loading
  - FOLLOW pattern: src/config-manager.js (existing config loading patterns)
  - ADD: 
    * GEMINI_CHUNKING_ENABLED=true
    * GEMINI_CHUNKING_MAX_SIZE_BYTES=15728640 (15MB)
    * GEMINI_CHUNKING_MAX_LINES=1500
    * GEMINI_CHUNKING_MAX_TOKENS=30000
    * GEMINI_CHUNKING_BATCH_SIZE=1
    * GEMINI_CHUNKING_OVERLAP_LINES=50
    * GEMINI_CHUNKING_STRATEGY=line-based
  - NAMING: PROVIDER_GEMINI_CHUNKING_* prefix for consistency
  - PLACEMENT: Gemini-specific configuration section

Task 4: MODIFY src/translators/gemini-translator.js
  - IMPLEMENT: Chunking integration in request processing flow
  - FOLLOW pattern: Existing forwardToProviderAPI() error handling approach
  - ADD: 
    * shouldChunkRequest() - Decision logic for when to chunk
    * processChunkedRequest() - Orchestration of chunked processing
    * chunkAndForwardRequest() - Main chunking workflow
  - MODIFY: analyzeRequestSize() to include chunking-aware analysis
  - INTEGRATE: Import and use chunking-utils functions
  - PRESERVE: Existing non-chunked request handling
  - PLACEMENT: Enhanced methods within existing class structure

Task 5: MODIFY src/providers/gemini-provider.js
  - IMPLEMENT: Configuration passing to translator
  - FOLLOW pattern: Existing configuration passing to translator
  - UPDATE: Constructor to pass chunking config to translator
  - PRESERVE: Existing initialization and authentication logic
  - PLACEMENT: Configuration initialization in constructor

Task 6: CREATE src/utils/tests/test-chunking-utils.js
  - IMPLEMENT: Unit tests for chunking utility functions
  - FOLLOW pattern: src/translators/gemini-translator.js test approach
  - TEST: 
    * createChunksFromMessages() with various input sizes
    * aggregateChunkResponses() with different response types
    * estimateTokens() accuracy for different content types
    * shouldChunkRequest() decision logic
  - COVERAGE: All public functions with positive and edge cases
  - PLACEMENT: Tests in src/utils/tests/

Task 7: MODIFY src/translators/tests/gemini-translator.test.js
  - IMPLEMENT: Integration tests for chunking functionality
  - FOLLOW pattern: Existing translator test structure
  - TEST: 
    * Large request chunking behavior
    * Chunked response aggregation
    * Configuration-based chunking decisions
    * Error handling in chunked processing
  - MOCK: Gemini API responses for chunked scenarios
  - COVERAGE: Chunking integration points
  - PLACEMENT: Enhanced existing test file
```

### Implementation Patterns & Key Details

```javascript
// Show critical patterns and gotchas - keep concise, focus on non-obvious details

// Example: Chunking decision pattern
function shouldChunkRequest(request, config) {
  // PATTERN: Check multiple dimensions (size, lines, tokens)
  const size = calculateRequestSize(request);
  const lines = countRequestLines(request);
  const tokens = estimateTokens(request);
  
  // GOTCHA: Early return on first exceeded limit for performance
  // CRITICAL: Configurable thresholds with sensible defaults
  return size > config.maxSizeBytes || 
         lines > config.maxLines || 
         tokens > config.maxTokens;
}

// Example: Chunk processing pattern
async function processChunkedRequest(chunks, translator, accessToken) {
  // PATTERN: Sequential processing with progress tracking
  // GOTCHA: Maintain context between chunks with overlap
  // CRITICAL: Proper error handling and rollback capability
  
  const responses = [];
  for (const [index, chunk] of chunks.entries()) {
    try {
      const response = await translator.forwardSingleChunk(chunk, accessToken);
      responses.push(response);
    } catch (error) {
      // Handle chunk processing failure appropriately
      throw new Error(`Failed processing chunk ${index + 1}/${chunks.length}: ${error.message}`);
    }
  }
  
  return aggregateChunkResponses(responses);
}

// Example: Response aggregation pattern
function aggregateChunkResponses(chunkResponses) {
  // PATTERN: Preserve OpenAI response format
  // GOTCHA: Handle streaming vs non-streaming responses differently
  // CRITICAL: Maintain semantic coherence in combined response
  
  const aggregated = {
    id: generateResponseId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: chunkResponses[0]?.model || 'gemini-pro',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: chunkResponses.map(r => r.choices[0]?.message?.content || '').join('')
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: chunkResponses.reduce((sum, r) => sum + (r.usage?.prompt_tokens || 0), 0),
      completion_tokens: chunkResponses.reduce((sum, r) => sum + (r.usage?.completion_tokens || 0), 0),
      total_tokens: chunkResponses.reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0)
    }
  };
  
  return aggregated;
}
```

### Integration Points

```yaml
CONFIGURATION:
  - add to: src/config-manager.js
  - pattern: "GEMINI_CHUNKING_ENABLED = process.env.PROVIDER_GEMINI_CHUNKING_ENABLED === 'true'"
  - pattern: "GEMINI_CHUNKING_MAX_SIZE_BYTES = parseInt(process.env.PROVIDER_GEMINI_CHUNKING_MAX_SIZE_BYTES || '15728640')"
  - pattern: "GEMINI_CHUNKING_STRATEGY = process.env.PROVIDER_GEMINI_CHUNKING_STRATEGY || 'line-based'"

TRANSLATOR_INTEGRATION:
  - modify: src/translators/gemini-translator.js
  - pattern: "Enhance forwardToProviderAPI() with chunking logic"
  - pattern: "Add shouldChunkRequest() decision method"
  - pattern: "Add processChunkedRequest() orchestration method"

PROVIDER_WIRING:
  - modify: src/providers/gemini-provider.js
  - pattern: "Pass chunking config to translator constructor"
  - pattern: "Maintain backward compatibility with existing API"

UTILITY_FUNCTIONS:
  - create: src/utils/chunking-utils.js
  - pattern: "Pure functions with no side effects"
  - pattern: "Comprehensive error handling and validation"
  - pattern: "Detailed logging for debugging chunking decisions"
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# Run after each file creation - fix before proceeding
npx eslint src/utils/chunking-utils.js --fix
npx eslint src/types/chunking-types.js --fix
npx eslint src/translators/gemini-translator.js --fix

# Project-wide validation
npm run lint
npm run test:unit

# Expected: Zero errors. If errors exist, READ output and fix before proceeding.
```

### Level 2: Unit Tests (Component Validation)

```bash
# Test each component as it's created
node --test src/utils/tests/test-chunking-utils.js
node --test src/translators/tests/gemini-translator.test.js

# Full test suite for affected areas
npm run test

# Coverage validation
npm run test:coverage

# Expected: All tests pass with >90% coverage for new functionality. 
# If failing, debug root cause and fix implementation.
```

### Level 3: Integration Testing (System Validation)

```bash
# Service startup validation
npm start &
sleep 3  # Allow startup time

# Health check validation
curl -f http://localhost:31337/health || echo "Service health check failed"

# Test chunking with large request
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini/gemini-pro",
    "messages": [
      {"role": "user", "content": "Large file content..."},
      {"role": "user", "content": "More large content..."}
      // ... 2000+ message lines to trigger chunking
    ]
  }' \
  | jq .

# Test normal (non-chunked) requests still work
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini/gemini-pro",
    "messages": [
      {"role": "user", "content": "Small request"}
    ]
  }' \
  | jq .

# Expected: Chunked requests process successfully, normal requests unaffected
```

### Level 4: Creative & Domain-Specific Validation

```bash
# Performance testing with large requests
ab -n 10 -c 2 -p large_request.json -T "application/json" http://localhost:31337/v1/chat/completions

# Configuration validation
# Test with different chunking strategies
PROVIDER_GEMINI_CHUNKING_STRATEGY=token-based npm start

# Test with different size limits
PROVIDER_GEMINI_CHUNKING_MAX_SIZE_BYTES=10485760 npm start # 10MB limit

# Memory usage monitoring during chunking
# Use system monitoring tools to ensure no memory leaks

# Gemini-specific validation
# Verify chunked responses maintain semantic coherence
# Test tool calling functionality with chunked requests
# Validate streaming responses work with chunking (if implemented)

# Expected: All creative validations pass, performance meets requirements
```

## Final Validation Checklist

### Technical Validation

- [ ] All 4 validation levels completed successfully
- [ ] All tests pass: `npm run test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npm run type-check` (if TypeScript)
- [ ] Performance impact < 5% for non-chunked requests

### Feature Validation

- [ ] Requests > 20MB are automatically chunked and processed
- [ ] Message sets > 2000 lines are automatically chunked
- [ ] Chunked responses maintain semantic coherence
- [ ] Configuration options work as expected
- [ ] Error cases handled gracefully with proper error messages
- [ ] Backward compatibility maintained for existing functionality

### Code Quality Validation

- [ ] Follows existing codebase patterns and naming conventions
- [ ] File placement matches desired codebase tree structure
- [ ] Anti-patterns avoided (check against Anti-Patterns section)
- [ ] Dependencies properly managed and imported
- [ ] Configuration changes properly integrated
- [ ] Comprehensive logging for debugging chunking decisions

### Documentation & Deployment

- [ ] Code is self-documenting with clear variable/function names
- [ ] Logs are informative but not verbose
- [ ] Environment variables documented in .env.example
- [ ] Configuration options documented in README
- [ ] New utility functions have JSDoc comments

## Anti-Patterns to Avoid

- ❌ Don't create new patterns when existing ones work
- ❌ Don't skip validation because "it should work"
- ❌ Don't ignore failing tests - fix them
- ❌ Don't process chunks in parallel without proper context management
- ❌ Don't hardcode chunking values that should be config
- ❌ Don't break existing non-chunked request handling
- ❌ Don't create memory leaks during chunk processing
- ❌ Don't lose semantic context when splitting large requests

---