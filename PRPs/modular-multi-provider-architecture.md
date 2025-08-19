# Modular Multi-Provider Architecture for Qwen-Claude Bridge

## Goal

**Feature Goal**: Transform the Qwen-Claude Bridge into a modular, extensible proxy server that supports multiple AI providers (Qwen, Gemini, and future providers) with a unified authentication and request handling system.

**Deliverable**: A refactored proxy server architecture with provider-agnostic interfaces, modular authentication managers, and dynamic request routing that maintains full backward compatibility with existing Qwen functionality while enabling seamless integration of new providers like Gemini CLI.

**Success Definition**: The server can dynamically handle requests for multiple providers based on configuration, with each provider having its own authentication manager and credential storage, all while maintaining the same OpenAI-compatible API interface for clients.

## User Persona (if applicable)

**Target User**: Developers using `claude-code-router` or other OpenAI-compatible clients who want to leverage free API quotas from multiple providers (Qwen, Gemini, etc.)

**Use Case**: Developer wants to route requests to different AI providers based on availability, cost, or model capabilities without changing their existing tooling.

**User Journey**: 
1. Developer configures the server with multiple provider credentials
2. Server starts and initializes authentication for all configured providers
3. Client sends OpenAI-compatible requests with provider/model specified
4. Server routes request to appropriate provider, handles authentication, and returns translated response

**Pain Points Addressed**: 
- Vendor lock-in to single provider
- Complex credential management for multiple providers
- Inconsistent API interfaces between providers
- Need to re-authenticate when switching providers

## Why

- **Business Value**: Enables the bridge to serve a broader user base by supporting multiple providers
- **User Impact**: Provides flexibility and redundancy for developers using AI services
- **Integration**: Maintains backward compatibility while extending functionality
- **Problems Solved**: Eliminates need for separate proxy servers for each provider

## What

### Success Criteria

- [ ] Server supports dynamic provider configuration at startup
- [ ] Each provider has isolated authentication and credential management
- [ ] Qwen functionality remains unchanged and fully operational
- [ ] New providers (starting with Gemini) can be added without modifying core logic
- [ ] All existing environment variables and configuration options continue to work
- [ ] Proper error handling for each provider's specific authentication flows
- [ ] Credential files are stored in provider-specific locations (`~/.qwen/`, `~/.gemini/`, etc.)

## All Needed Context

### Context Completeness Check

Before writing this PRP, validate: "If someone knew nothing about this codebase, would they have everything needed to implement this successfully?"

### Documentation & References

```yaml
# MUST READ - Include these in your context window
- file: /home/dustin/projects/qwen-code-bridge/src/server.js
  why: Current server implementation showing request routing and component initialization
  pattern: Express.js server setup with modular components
  gotcha: Token manager and translator are tightly coupled to Qwen currently

- file: /home/dustin/projects/qwen-code-bridge/src/oauth-token-manager.js
  why: Current Qwen OAuth implementation showing token refresh and credential management
  pattern: File-based credential storage with atomic writes
  gotcha: Hardcoded Qwen-specific constants (TOKEN_URL, CLIENT_ID)

- file: /home/dustin/projects/qwen-code-bridge/src/request-translator.js
  why: Current request/response translation showing OpenAI-Qwen compatibility
  pattern: Message transformation preserving tool calling structure
  gotcha: API base URL resolution tied to Qwen token manager

- file: /home/dustin/projects/qwen-code-bridge/src/config-manager.js
  why: Current configuration system showing precedence and validation
  pattern: Environment variables > .env file > defaults
  gotcha: Currently Qwen-specific configuration options

- docfile: /home/dustin/projects/qwen-code-bridge/PRPs/ai_docs/tool_calling_patterns.md
  why: Critical patterns for preserving tool calling across API translations
  section: Key Implementation Requirements
  gotcha: Tool messages must never be converted to user messages

- url: https://github.com/QwenLM/qwen-code/blob/main/packages/core/src/qwen/qwenOAuth2.ts
  why: Reference for Qwen OAuth2 device flow implementation
  critical: Understanding of credential storage format and refresh mechanism
```

### Current Codebase tree (run `tree` in the root of the project) to get an overview of the codebase

```bash
src/
├── server.js
├── config-manager.js
├── oauth-token-manager.js
├── request-translator.js
├── tool-call-validator.js
├── error-handler.js
└── logger.js
```

### Desired Codebase tree with files to be added and responsibility of file

```bash
src/
├── server.js                           # Main server with provider routing
├── config-manager.js                   # Enhanced configuration with provider support
├── providers/                          # New directory for provider-specific modules
│   ├── base-provider.js               # Abstract base class for all providers
│   ├── qwen-provider.js               # Qwen-specific implementation (extracted from current)
│   ├── gemini-provider.js             # Gemini-specific implementation
│   └── provider-factory.js            # Factory for creating provider instances
├── auth/                              # New directory for authentication managers
│   ├── base-auth-manager.js           # Abstract base class for auth managers
│   ├── qwen-auth-manager.js           # Qwen OAuth manager (extracted from current)
│   └── gemini-auth-manager.js         # Gemini OAuth manager
├── translators/                       # New directory for request translators
│   ├── base-translator.js            # Abstract base class for translators
│   ├── qwen-translator.js            # Qwen translator (extracted from current)
│   └── gemini-translator.js          # Gemini translator
├── tool-call-validator.js
├── error-handler.js
└── logger.js
```

### Known Gotchas of our codebase & Library Quirks

```javascript
// CRITICAL: OAuth token refresh must be proactive to avoid latency in user requests
// CRITICAL: Tool calling structure must be preserved exactly - never convert tool messages to user messages
// CRITICAL: Credential files must be written atomically to prevent corruption
// CRITICAL: Access tokens must never be logged or exposed in error messages
// GOTCHA: API base URLs are provider-specific and may come from token responses
// GOTCHA: Each provider has different OAuth constants (client IDs, token URLs, scopes)
```

## Implementation Blueprint

### Data models and structure

Create the core data models, we ensure type safety and consistency.

```javascript
// Provider configuration structure
interface ProviderConfig {
  name: string;              // 'qwen', 'gemini', etc.
  enabled: boolean;
  credentialsPath: string;   // Provider-specific credential file path
  defaultModel: string;
  // Provider-specific configuration
  [key: string]: any;
}

// Generic credential structure
interface ProviderCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  // Provider-specific fields
  [key: string]: any;
}

// Provider interface
interface Provider {
  name: string;
  initialize(): Promise<void>;
  getValidAccessToken(): Promise<string | null>;
  translateRequest(openAIRequest: any): any;
  translateResponse(providerResponse: any): any;
  forwardRequest(translatedRequest: any, accessToken: string): Promise<any>;
  getApiBaseUrl(): string;
}
```

### Implementation Tasks (ordered by dependencies)

```yaml
Task 1: CREATE src/providers/base-provider.js
  - IMPLEMENT: Abstract base class defining provider interface
  - FOLLOW pattern: Similar to current OAuthTokenManager but with request/response methods
  - NAMING: Abstract methods for all provider-specific functionality
  - PLACEMENT: Provider abstraction layer in src/providers/

Task 2: REFACTOR src/oauth-token-manager.js -> src/auth/qwen-auth-manager.js
  - IMPLEMENT: Extract Qwen-specific OAuth logic from current implementation
  - FOLLOW pattern: Current OAuthTokenManager with Qwen-specific constants
  - NAMING: QwenAuthManager class extending BaseAuthManager
  - DEPENDENCIES: None
  - PLACEMENT: Authentication layer in src/auth/

Task 3: CREATE src/auth/gemini-auth-manager.js
  - IMPLEMENT: Gemini-specific OAuth manager based on research
  - FOLLOW pattern: QwenAuthManager but with Gemini constants
  - NAMING: GeminiAuthManager class extending BaseAuthManager
  - DEPENDENCIES: BaseAuthManager
  - PLACEMENT: Authentication layer in src/auth/

Task 4: REFACTOR src/request-translator.js -> src/translators/qwen-translator.js
  - IMPLEMENT: Extract Qwen-specific translation logic from current implementation
  - FOLLOW pattern: Current RequestTranslator but as Qwen-specific class
  - NAMING: QwenTranslator class extending BaseTranslator
  - DEPENDENCIES: None
  - PLACEMENT: Translation layer in src/translators/

Task 5: CREATE src/translators/gemini-translator.js
  - IMPLEMENT: Gemini-specific request/response translator
  - FOLLOW pattern: QwenTranslator but with Gemini-specific transformations
  - NAMING: GeminiTranslator class extending BaseTranslator
  - DEPENDENCIES: BaseTranslator
  - PLACEMENT: Translation layer in src/translators/

Task 6: CREATE src/providers/qwen-provider.js
  - IMPLEMENT: Qwen provider implementation combining auth and translation
  - FOLLOW pattern: BaseProvider with Qwen-specific components
  - NAMING: QwenProvider class implementing Provider interface
  - DEPENDENCIES: QwenAuthManager, QwenTranslator
  - PLACEMENT: Provider implementations in src/providers/

Task 7: CREATE src/providers/gemini-provider.js
  - IMPLEMENT: Gemini provider implementation combining auth and translation
  - FOLLOW pattern: BaseProvider with Gemini-specific components
  - NAMING: GeminiProvider class implementing Provider interface
  - DEPENDENCIES: GeminiAuthManager, GeminiTranslator
  - PLACEMENT: Provider implementations in src/providers/

Task 8: UPDATE src/config-manager.js
  - IMPLEMENT: Enhanced configuration to support multiple providers
  - FOLLOW pattern: Current ConfigManager with provider configuration support
  - NAMING: Add provider-specific configuration loading
  - DEPENDENCIES: None
  - PLACEMENT: Configuration management in src/

Task 9: UPDATE src/server.js
  - IMPLEMENT: Provider routing and dynamic request handling
  - FOLLOW pattern: Current server but with provider selection logic
  - NAMING: Provider selection based on request model or header
  - DEPENDENCIES: ProviderFactory, updated ConfigManager
  - PLACEMENT: Main server logic in src/
```

### Implementation Patterns & Key Details

```javascript
// Provider interface pattern
class BaseProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }
  
  async getValidAccessToken() {
    throw new Error('getValidAccessToken() must be implemented by subclass');
  }
  
  translateRequest(openAIRequest) {
    throw new Error('translateRequest() must be implemented by subclass');
  }
  
  translateResponse(providerResponse) {
    throw new Error('translateResponse() must be implemented by subclass');
  }
  
  async forwardRequest(translatedRequest, accessToken) {
    throw new Error('forwardRequest() must be implemented by subclass');
  }
  
  getApiBaseUrl() {
    throw new Error('getApiBaseUrl() must be implemented by subclass');
  }
}

// Provider factory pattern
class ProviderFactory {
  static createProvider(providerName, config, logger) {
    switch (providerName.toLowerCase()) {
      case 'qwen':
        return new QwenProvider(config, logger);
      case 'gemini':
        return new GeminiProvider(config, logger);
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }
  }
}

// Configuration pattern for multiple providers
const providerConfigs = {
  qwen: {
    name: 'qwen',
    enabled: true,
    credentialsPath: '~/.qwen/oauth_creds.json',
    defaultModel: 'qwen3-coder-plus',
    tokenUrl: 'https://chat.qwen.ai/api/v1/oauth2/token',
    clientId: 'f0304373b74a44d2b584a3fb70ca9e56'
  },
  gemini: {
    name: 'gemini',
    enabled: true,
    credentialsPath: '~/.gemini/oauth_creds.json',
    defaultModel: 'gemini-pro',
    tokenUrl: 'https://oauth2.googleapis.com/token', // Example - research needed
    clientId: 'gemini-client-id' // Example - research needed
  }
};
```

### Integration Points

```yaml
DATABASE:
  - migration: No database changes required - file-based credential storage continues
  - client: No database client needed
  - pattern: File system access with atomic writes for credential files

CONFIG:
  - add to: .env file or environment variables
  - pattern: Provider-specific configuration with common prefixes
  - example: 
    PROVIDER_QWEN_ENABLED=true
    PROVIDER_QWEN_CREDENTIALS_PATH=~/.qwen/oauth_creds.json
    PROVIDER_GEMINI_ENABLED=true
    PROVIDER_GEMINI_CREDENTIALS_PATH=~/.gemini/oauth_creds.json

ROUTES:
  - file structure: Single server endpoint continues to handle all providers
  - api routes: POST /v1/chat/completions (provider determined by request content)
  - middleware: Provider selection middleware added to route requests
  - pattern: Provider selection by model name prefix (e.g., "qwen/qwen3-coder-plus", "gemini/gemini-pro")
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# Run after each file creation - fix before proceeding
npm run lint                    # ESLint checks
node --check src/**/*.js       # Syntax checking
npm run format                 # Prettier formatting (if configured)

# Project-wide validation
npm run lint:fix               # Auto-fix linting issues (if configured)
# Expected: Zero errors. If errors exist, READ output and fix before proceeding.
```

### Level 2: Unit Tests (Component Validation)

```bash
# Test each component as it's created
# Note: Need to create test files for new components

# Test provider factory
node --test test/provider-factory.test.js

# Test Qwen provider (should continue working as before)
node --test test/qwen-provider.test.js

# Test Gemini provider
node --test test/gemini-provider.test.js

# Test configuration manager
node --test test/config-manager.test.js

# Expected: All tests pass. If failing, debug root cause and fix implementation.
```

### Level 3: Integration Testing (System Validation)

```bash
# Development server validation
npm run dev &
sleep 5  # Allow server startup time

# Test Qwen functionality (should work exactly as before)
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen3-coder-plus",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Test Gemini functionality (new)
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini/gemini-pro",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Expected: 200 OK responses with proper OpenAI-compatible format
# Expected: Qwen requests work identically to before refactoring
```

### Level 4: Creative & Domain-Specific Validation

```bash
# Test backward compatibility
# Ensure existing environment variables still work
PROVIDER_QWEN_ENABLED=true PROVIDER_QWEN_CREDENTIALS_PATH=~/.qwen/oauth_creds.json npm start

# Test mixed provider scenarios
# Server should handle both providers simultaneously

# Test error scenarios
# - Invalid provider name should return proper error
# - Unconfigured provider should return proper error
# - Authentication failures should be provider-specific

# Test credential isolation
# - Qwen credentials should not interfere with Gemini credentials
# - Each provider should use its own credential file

# Expected: All creative validations pass, proper error handling for edge cases
```

## Final Validation Checklist

### Technical Validation

- [ ] All 4 validation levels completed successfully
- [ ] No syntax errors: `node --check src/**/*.js`
- [ ] No linting errors: `npm run lint`
- [ ] All new files follow existing code style and patterns
- [ ] Backward compatibility maintained for existing Qwen functionality

### Feature Validation

- [ ] Server routes requests to correct provider based on model name
- [ ] Qwen functionality works identically to before refactoring
- [ ] Gemini provider can be configured and used
- [ ] Provider-specific credential files are used correctly
- [ ] Error handling is provider-specific and appropriate
- [ ] Manual testing successful with both providers

### Code Quality Validation

- [ ] Follows existing JavaScript patterns and naming conventions
- [ ] File placement matches desired codebase tree structure
- [ ] Anti-patterns avoided (no tight coupling between providers)
- [ ] Dependencies properly managed
- [ ] Configuration changes properly integrated

### Documentation & Deployment

- [ ] Code is self-documenting with clear interface definitions
- [ ] Provider-specific configuration documented
- [ ] Environment variables documented if new ones added
- [ ] README updated with new provider configuration instructions

---
## Anti-Patterns to Avoid

- ❌ Don't create tight coupling between providers
- ❌ Don't duplicate authentication logic across providers
- ❌ Don't break existing Qwen functionality
- ❌ Don't hardcode provider-specific values in core logic
- ❌ Don't mix credential files between providers
- ❌ Don't skip validation because "it should work"

## Research Notes

### Gemini CLI Authentication Pattern (Based on Research)

Based on general patterns for Google OAuth2 device flow:

```javascript
// Gemini OAuth constants (research needed for exact values)
const GEMINI_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GEMINI_CLIENT_ID = 'gemini-client-id'; // Need to research actual values
const GEMINI_SCOPES = 'https://www.googleapis.com/auth/generative-language'; // Example scope

// Credential file structure would be similar to Qwen:
// ~/.gemini/oauth_creds.json
{
  "access_token": "...",
  "refresh_token": "...", 
  "token_type": "Bearer",
  "expiry_date": 1234567890123, // Unix timestamp in milliseconds
  // Gemini-specific fields if any
}
```

### Key Implementation Considerations

1. **Provider Selection**: Determine provider from model name (e.g., "qwen/qwen3-coder-plus" vs "gemini/gemini-pro")
2. **Credential Isolation**: Each provider uses its own credential file in provider-specific directories
3. **Error Handling**: Provider-specific error messages and recovery strategies
4. **Configuration**: Environment variables with provider prefixes (PROVIDER_QWEN_*, PROVIDER_GEMINI_*)
5. **Backward Compatibility**: Existing Qwen configuration continues to work without changes