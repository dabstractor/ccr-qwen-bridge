# Gemini Provider Implementation PRP

## Feature Goal
Implement full support for Google's Gemini API as a provider in the CCR Qwen Bridge, enabling OpenAI-compatible clients to route requests to Gemini models via the gemini-cli's OAuth authentication flow.

## Deliverable
A fully functional Gemini provider that integrates seamlessly with the existing modular architecture, supporting all core functionality including authentication, request/response translation, and tool calling capabilities.

## Success Definition
- Server can dynamically route requests to Gemini based on model name prefix (`gemini/*`)
- Full OAuth2 authentication flow integration with gemini-cli credentials
- Complete request/response translation preserving OpenAI compatibility
- Tool calling functionality working identically to Qwen provider
- Backward compatibility maintained for existing Qwen functionality

## User Persona
**Target User**: Developers using `claude-code-router` or other OpenAI-compatible clients who want to leverage Google's Gemini models via the free gemini-cli quota.

**Use Case**: Developer wants to route requests to Gemini models without changing their existing tooling, using the same OpenAI-compatible API interface.

**User Journey**:
1. Developer authenticates with gemini-cli to obtain OAuth credentials
2. Developer configures the server with Gemini provider enabled
3. Client sends OpenAI-compatible requests with `gemini/*` model names
4. Server routes request to Gemini, handles authentication, and returns translated response

## Why This Matters
- **Business Value**: Extends the bridge to support multiple AI providers, increasing user base
- **User Impact**: Provides flexibility and access to Google's Gemini models
- **Integration**: Maintains backward compatibility while extending functionality
- **Problems Solved**: Eliminates need for separate proxy servers for each provider

## What Needs to be Built

### Core Components to Implement

#### 1. Gemini Auth Manager (`src/auth/gemini-auth-manager.js`)
- **Status**: Partially implemented
- **Required Updates**: 
  - Update OAuth constants with correct Gemini values from technical reference
  - Implement proper scope handling and token refresh logic
  - Ensure credential file path uses `~/.gemini/oauth_creds.json`

#### 2. Gemini Translator (`src/translators/gemini-translator.js`)
- **Status**: Partially implemented
- **Required Updates**:
  - Complete message transformation logic for Gemini API format
  - Implement proper role mapping (user/model)
  - Complete tool calling transformation
  - Add streaming support for SSE format

#### 3. Gemini Provider (`src/providers/gemini-provider.js`)
- **Status**: Implemented but needs validation
- **Required Updates**: None if current implementation is correct

#### 4. Modular Server Update (`src/server.js`)
- **Status**: Not yet updated
- **Required Implementation**:
  - Replace hardcoded Qwen logic with dynamic provider selection
  - Implement model name parsing to determine provider (`gemini/gemini-pro` → `gemini`)
  - Add provider initialization for all configured providers at startup
  - Update request handling to route to correct provider dynamically

### Configuration Requirements
```env
# Enable Gemini provider
PROVIDER_GEMINI_ENABLED=true
PROVIDER_GEMINI_CREDENTIALS_PATH=~/.gemini/oauth_creds.json
PROVIDER_GEMINI_DEFAULT_MODEL=gemini-pro
PROVIDER_GEMINI_CLIENT_ID=681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com
PROVIDER_GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1
```

## Technical Implementation Details

### Authentication Flow
Based on Gemini CLI Technical Reference:
- **OAuth Client ID**: `681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com`
- **Token URL**: `https://oauth2.googleapis.com/token`
- **Scopes**: `https://www.googleapis.com/auth/generative-language`
- **Credential File**: `~/.gemini/oauth_creds.json`

### API Differences from Qwen
1. **Base URL**: `https://generativelanguage.googleapis.com/v1` vs Qwen's dynamic URLs
2. **Message Format**: `contents` array with `parts` vs `messages` array
3. **Roles**: `user`/`model` vs `user`/`assistant`
4. **Tool Calling**: Different function call/response structure
5. **Streaming**: Different SSE format with `data: ` prefixes

### Key Implementation Tasks

#### Task 1: Update Gemini Auth Manager
```javascript
// src/auth/gemini-auth-manager.js
// Update OAuth constants:
this.TOKEN_URL = 'https://oauth2.googleapis.com/token';
this.CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
this.SCOPE = 'https://www.googleapis.com/auth/generative-language';
this.credentialsPath = '~/.gemini/oauth_creds.json';
```

#### Task 2: Complete Gemini Translator
```javascript
// src/translators/gemini-translator.js
// Key transformations needed:
// 1. OpenAI messages → Gemini contents structure
// 2. Role mapping: assistant → model
// 3. Tool calls: function_call → functionCall
// 4. Response format: candidates → choices
```

#### Task 3: Refactor Server for Multi-Provider Support
```javascript
// src/server.js
// Replace hardcoded provider logic with:
// 1. Provider initialization at startup
// 2. Dynamic provider selection from model name
// 3. Request routing to appropriate provider
```

#### Task 4: Update Configuration Manager
```javascript
// src/config-manager.js
// Already has Gemini configuration support - validate it's correct
```

## Data Models and Structure

### Provider Interface
```javascript
interface Provider {
  name: string;                    // 'gemini'
  initialize(): Promise<void>;     // Initialize auth and components
  getValidAccessToken(): Promise<string|null>;  // Get/proactively refresh token
  translateRequest(openAIRequest: any): any;    // OpenAI → Provider format
  translateResponse(providerResponse: any): any; // Provider → OpenAI format
  forwardRequest(translatedRequest: any, accessToken: string): Promise<any>;
  getApiBaseUrl(): string;         // Provider-specific base URL
}
```

### Request Flow
1. **Client Request**: OpenAI-compatible POST to `/v1/chat/completions`
2. **Provider Selection**: Parse model name (`gemini/gemini-pro` → `gemini`)
3. **Token Management**: Get valid access token from provider
4. **Request Translation**: OpenAI → Gemini format
5. **API Call**: Forward to `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent`
6. **Response Translation**: Gemini → OpenAI format
7. **Client Response**: Return OpenAI-compatible response

## Integration Points

### File System
- **Credential Storage**: `~/.gemini/oauth_creds.json` (separate from Qwen)
- **Atomic Writes**: Same pattern as Qwen for credential persistence
- **File Permissions**: 0o600 for security

### Configuration
- **Environment Variables**: `PROVIDER_GEMINI_*` prefixed variables
- **Backward Compatibility**: Existing Qwen configuration unchanged
- **Dynamic Loading**: Providers loaded based on configuration at startup

### Routes
- **API Endpoint**: Single `/v1/chat/completions` handles all providers
- **Model Selection**: Provider determined by model name prefix
- **Error Handling**: Provider-specific error messages and recovery

## Validation Gates

### Level 1: Syntax & Style
```bash
npm run lint                    # ESLint checks
node --check src/**/*.js       # Syntax checking
```

### Level 2: Unit Tests
```bash
# Test provider factory
node --test test/provider-factory.test.js

# Test Gemini provider components
node --test test/gemini-auth-manager.test.js
node --test test/gemini-translator.test.js
```

### Level 3: Integration Testing
```bash
# Start server
npm start &

# Test Gemini functionality
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini/gemini-pro",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Test backward compatibility with Qwen
curl -X POST http://localhost:31337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen3-coder-plus",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Level 4: Functional Validation
```bash
# Test tool calling with Gemini
# Test streaming responses
# Test error scenarios
# Test credential isolation between providers
```

## Final Validation Checklist

### Technical Validation
- [ ] All validation levels completed successfully
- [ ] No syntax or linting errors
- [ ] Backward compatibility maintained for Qwen
- [ ] New files follow existing code patterns

### Feature Validation
- [ ] Server routes to correct provider based on model name
- [ ] Gemini authentication works with gemini-cli credentials
- [ ] Request/response translation preserves tool calling
- [ ] Streaming responses work correctly
- [ ] Error handling is provider-specific

### Code Quality
- [ ] Follows existing JavaScript patterns
- [ ] Proper file placement in modular structure
- [ ] No tight coupling between providers
- [ ] Configuration properly integrated

## Anti-Patterns to Avoid
- ❌ Don't create tight coupling between providers
- ❌ Don't duplicate authentication logic
- ❌ Don't break existing Qwen functionality
- ❌ Don't hardcode provider-specific values in core logic
- ❌ Don't mix credential files between providers

## Research Notes

### Gemini API Key Differences
Based on technical reference:
- **Message Structure**: `contents: [{role: "user", parts: [{text: "Hello"}]}]`
- **Tool Calling**: `functionCall: {name: "tool_name", args: {}}`
- **Response Format**: `candidates: [{content: {role: "model", parts: [...]}}]`
- **Streaming**: SSE format with `data: ` prefixed lines

### OAuth Implementation
- **Token Refresh**: Similar to Qwen but with Google-specific endpoints
- **Credential Format**: Similar structure but may have Google-specific fields
- **Scopes**: `https://www.googleapis.com/auth/generative-language`

### Tool Calling Patterns
- **Function Calls**: `parts: [{functionCall: {name: "func", args: {}}}]`
- **Function Responses**: `parts: [{functionResponse: {name: "func", response: {}}}]`
- **Role Mapping**: Tool responses use `user` role in Gemini API

## Success Criteria
- [ ] Server successfully routes requests to Gemini provider
- [ ] Authentication works with gemini-cli OAuth flow
- [ ] Tool calling functionality preserved
- [ ] Streaming responses work correctly
- [ ] Backward compatibility with Qwen maintained
- [ ] All validation tests pass
- [ ] Manual testing successful with real Gemini credentials