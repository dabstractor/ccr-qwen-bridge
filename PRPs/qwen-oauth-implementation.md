name: "Qwen OAuth 2.0 Device Authorization Flow Implementation"
description: |
  Implementation of Qwen-Code OAuth 2.0 Device Authorization Flow with PKCE for seamless authentication and token management

---
## Goal

**Feature Goal**: Implement Qwen-Code OAuth 2.0 Device Authorization Flow with PKCE to enable seamless authentication and automatic token refresh for the qwen-code-bridge proxy server

**Deliverable**: A fully functional OAuth token manager that integrates with the existing Qwen authentication system, supporting automatic token refresh, credential persistence, and API endpoint construction

**Success Definition**: The proxy server can successfully authenticate with Qwen-Code using existing user credentials, automatically refresh tokens when expired, and make authenticated API calls to the correct endpoints

## User Persona (if applicable)

**Target User**: Developers using the qwen-code-bridge proxy server who have already authenticated with the official qwen-code CLI

**Use Case**: Seamless authentication for OpenAI-compatible API requests to Qwen-Code without requiring manual token management

**User Journey**: 
1. User has already authenticated with official qwen-code CLI
2. User starts qwen-code-bridge proxy server
3. Server loads existing credentials from ~/.qwen/oauth_creds.json
4. Server automatically refreshes tokens when needed
5. Server makes authenticated API calls using valid access tokens

**Pain Points Addressed**: 
- Manual token management and refresh
- Credential file corruption or loss
- Incorrect API endpoint construction
- Authentication failures due to expired tokens

## Why

- Enable seamless integration with Qwen-Code's free daily API quota
- Maintain compatibility with existing qwen-code CLI authentication flow
- Provide automatic token refresh to minimize service interruptions
- Ensure secure credential storage and handling
- Support dynamic API endpoint construction based on token response

## What

Implementation of OAuth 2.0 Device Authorization Flow with PKCE for Qwen-Code authentication, including:
- Credential loading from ~/.qwen/oauth_creds.json
- Token expiration checking and proactive refresh
- Secure credential file handling with atomic writes
- Dynamic API endpoint construction from resource_url
- Proper error handling for unrecoverable authentication errors

### Success Criteria

- [ ] Server loads existing Qwen credentials on startup
- [ ] Access tokens are automatically refreshed when expired
- [ ] Credentials are securely stored with proper file permissions
- [ ] API calls are made to the correct endpoints based on resource_url
- [ ] Unrecoverable authentication errors are properly handled
- [ ] All existing functionality continues to work without regression

## All Needed Context

### Context Completeness Check

_If someone knew nothing about this codebase, they would have everything needed to implement this successfully based on the detailed documentation and references provided._

### Documentation & References

```yaml
# MUST READ - Qwen OAuth Implementation Details
- docfile: qwen-code-oauth-lifecycle.md
  why: Complete understanding of Qwen OAuth flow and endpoints
  critical: Understanding the exact token refresh process and API endpoints

- docfile: qwen_oauth_implementation_details.md
  why: Technical details of PKCE implementation and token storage format
  critical: Correct implementation of code_verifier/code_challenge generation and expiry_date format

- file: src/auth/qwen-auth-manager.js
  why: Existing Qwen authentication manager to integrate with
  pattern: Credential loading, saving, and token refresh patterns
  gotcha: File path expansion and error handling patterns

- file: packages/core/src/qwen/qwenOAuth2.ts
  why: Reference implementation from official qwen-code CLI
  pattern: PKCE generation, token refresh logic, error handling
  gotcha: Specific error response handling and polling mechanics

- file: packages/core/src/qwen/qwenContentGenerator.ts
  why: Reference for API endpoint construction and token usage
  pattern: resource_url processing and API base URL normalization
  gotcha: Correct URL construction with protocol and /v1 suffix
```

### Current Codebase tree (run `tree` in the root of the project) to get an overview of the codebase

```bash
src/
├── auth/
│   ├── base-auth-manager.js
│   ├── credential-discovery.js
│   ├── gemini-auth-manager.js
│   └── qwen-auth-manager.js
├── oauth-token-manager.js
└── providers/
    ├── qwen-provider.js
    └── provider-factory.js
```

### Desired Codebase tree with files to be added and responsibility of file

```bash
src/
├── auth/
│   └── qwen-auth-manager.js (updated with PKCE and enhanced refresh logic)
├── oauth-token-manager.js (enhanced with Qwen-specific logic)
└── utils/
    └── pkce-utils.js (new file for PKCE generation utilities)
```

### Known Gotchas of our codebase & Library Quirks

```javascript
// CRITICAL: Qwen OAuth requires specific client_id and token endpoint
// CRITICAL: Expiry_date must be stored as Unix timestamp in milliseconds
// CRITICAL: resource_url processing requires proper URL normalization
// CRITICAL: Atomic writes must preserve file permissions (mode: 0o600)
// CRITICAL: Error handling must distinguish between recoverable and unrecoverable errors
```

## Implementation Blueprint

### Data models and structure

```javascript
// QwenCredentials interface
interface QwenCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number; // Unix timestamp in milliseconds
  token_type: string;
  resource_url?: string;
}

// DeviceAuthorizationResponse interface
interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
}

// DeviceTokenResponse interface
interface DeviceTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  resource_url?: string;
}

// ErrorData interface
interface ErrorData {
  error: string;
  error_description: string;
}
```

### Implementation Tasks (ordered by dependencies)

```yaml
Task 1: CREATE src/utils/pkce-utils.js
  - IMPLEMENT: generateCodeVerifier() function using crypto.randomBytes(32)
  - IMPLEMENT: generateCodeChallenge() function using SHA-256 hash
  - IMPLEMENT: generatePKCEPair() function returning both verifier and challenge
  - FOLLOW pattern: Official qwen-code CLI implementation
  - NAMING: camelCase function names, base64url encoding
  - PLACEMENT: Utility functions in src/utils/

Task 2: ENHANCE src/auth/qwen-auth-manager.js
  - IMPLEMENT: PKCE generation during initialization
  - ENHANCE: refreshToken() method with proper error handling
  - IMPLEMENT: getApiBaseUrl() with correct URL normalization
  - IMPLEMENT: isTokenExpired() with proper buffer time
  - FOLLOW pattern: Existing error handling and logging
  - NAMING: Consistent with existing codebase
  - PLACEMENT: Enhanced methods in existing class

Task 3: ENHANCE src/oauth-token-manager.js
  - IMPLEMENT: Integration with QwenAuthManager for Qwen provider
  - ENHANCE: getValidAccessToken() with proactive refresh logic
  - IMPLEMENT: saveCredentials() with atomic write pattern
  - FOLLOW pattern: Existing credential handling
  - NAMING: Consistent with existing codebase
  - PLACEMENT: Enhanced methods in existing class

Task 4: UPDATE src/providers/qwen-provider.js
  - INTEGRATE: Enhanced QwenAuthManager for token management
  - IMPLEMENT: Dynamic API endpoint construction
  - FOLLOW pattern: Existing provider implementation
  - NAMING: Consistent with existing codebase
  - PLACEMENT: Updated provider methods

Task 5: CREATE src/utils/tests/test-pkce-utils.js
  - IMPLEMENT: Unit tests for PKCE generation functions
  - TEST: Code verifier length and format
  - TEST: Code challenge generation from verifier
  - TEST: PKCE pair generation
  - FOLLOW pattern: Existing test structure
  - NAMING: test_* function naming
  - PLACEMENT: Tests alongside the code they test
```

### Implementation Patterns & Key Details

```javascript
// PKCE Generation Pattern
export function generateCodeVerifier() {
  // PATTERN: 32 random bytes encoded as base64url
  // CRITICAL: Must be 43-128 characters as per RFC 7636
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(codeVerifier) {
  // PATTERN: SHA-256 hash of code_verifier encoded as base64url
  // CRITICAL: Use createHash('sha256') for proper implementation
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  return hash.digest('base64url');
}

// Token Refresh Pattern
async refreshToken() {
  // PATTERN: POST to token endpoint with refresh_token grant type
  // GOTCHA: Must include correct client_id and Content-Type headers
  // CRITICAL: Handle specific error responses (invalid_grant, access_denied)
  
  const response = await fetch(this.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'qwen-code/1.0.0'
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: this.CLIENT_ID,
      refresh_token: this.credentials.refresh_token
    })
  });

  if (!response.ok) {
    // PATTERN: Specific error handling for unrecoverable errors
    // CRITICAL: invalid_grant and access_denied require user re-authentication
  }
}

// API Endpoint Construction Pattern
normalizeApiUrl(resourceUrl) {
  // PATTERN: Ensure proper protocol and /v1 suffix
  // GOTCHA: resource_url might be just a domain without protocol
  // CRITICAL: Must end with /v1, not /api/v1
  
  let normalized = resourceUrl;
  if (!normalized.startsWith('http')) {
    normalized = `https://${normalized}`;
  }
  
  const suffix = '/v1';
  if (!normalized.endsWith(suffix)) {
    normalized = normalized.replace(/\/+$/, '') + suffix;
  }
  
  return normalized;
}
```

### Integration Points

```yaml
AUTHENTICATION:
  - integration: src/auth/qwen-auth-manager.js enhanced with PKCE
  - pattern: Credential loading from ~/.qwen/oauth_creds.json
  - error_handling: Proper distinction between recoverable and unrecoverable errors

TOKEN_MANAGEMENT:
  - integration: src/oauth-token-manager.js with Qwen-specific logic
  - pattern: Proactive token refresh before expiration
  - atomic_writes: Credential file updates with temp file and rename

API_INTEGRATION:
  - integration: src/providers/qwen-provider.js with dynamic endpoint construction
  - pattern: Authorization header with Bearer token
  - endpoint_construction: resource_url processing with fallback URL
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# Run after each file creation - fix before proceeding
npm run lint src/utils/pkce-utils.js
npm run lint src/auth/qwen-auth-manager.js
npm run lint src/oauth-token-manager.js

# Project-wide validation
npm run lint
npm run test

# Expected: Zero errors. If errors exist, READ output and fix before proceeding.
```

### Level 2: Unit Tests (Component Validation)

```bash
# Test each component as it's created
npm run test src/utils/tests/test-pkce-utils.js
npm run test src/auth/qwen-auth-manager.js
npm run test src/oauth-token-manager.js

# Full test suite for affected areas
npm run test src/auth/
npm run test src/utils/

# Expected: All tests pass. If failing, debug root cause and fix implementation.
```

### Level 3: Integration Testing (System Validation)

```bash
# Service startup validation with valid credentials
QWEN_CREDENTIALS_PATH="~/.qwen/oauth_creds.json" npm start

# Test token refresh functionality
# Simulate expired token and verify automatic refresh

# API endpoint validation
# Verify calls are made to correct endpoints based on resource_url

# Credential file handling
# Verify atomic writes and proper file permissions

# Expected: All integrations working, proper responses, no connection errors
```

### Level 4: Creative & Domain-Specific Validation

```bash
# Test with actual Qwen-Code credentials
# Verify compatibility with official qwen-code CLI authentication

# Test error scenarios
# invalid_grant error should trigger user re-authentication message
# access_denied error should provide clear instructions

# Test edge cases
# Missing resource_url should use fallback URL
# Expired tokens should be refreshed automatically
# Network errors should be handled gracefully

# Performance testing
# Token refresh should not cause significant delays
# Credential file operations should be atomic and fast

# Expected: All creative validations pass, performance meets requirements
```

## Final Validation Checklist

### Technical Validation

- [ ] All 4 validation levels completed successfully
- [ ] All tests pass: `npm run test`
- [ ] No linting errors: `npm run lint`
- [ ] No formatting issues: `npm run format --check`

### Feature Validation

- [ ] Server loads existing Qwen credentials on startup
- [ ] Access tokens are automatically refreshed when expired
- [ ] Credentials are securely stored with proper file permissions
- [ ] API calls are made to the correct endpoints based on resource_url
- [ ] Unrecoverable authentication errors are properly handled
- [ ] PKCE implementation matches official qwen-code CLI

### Code Quality Validation

- [ ] Follows existing codebase patterns and naming conventions
- [ ] File placement matches desired codebase tree structure
- [ ] Anti-patterns avoided (check against Anti-Patterns section)
- [ ] Dependencies properly managed and imported
- [ ] Configuration changes properly integrated

### Documentation & Deployment

- [ ] Code is self-documenting with clear variable/function names
- [ ] Logs are informative but not verbose
- [ ] Environment variables documented if new ones added
- [ ] README updated with any new setup or usage instructions

---
## Anti-Patterns to Avoid

- ❌ Don't reimplement existing patterns when they work
- ❌ Don't skip validation because "it should work"
- ❌ Don't ignore failing tests - fix them
- ❌ Don't hardcode values that should be configurable
- ❌ Don't catch all exceptions - be specific about error handling
- ❌ Don't use insecure file operations for credential storage
- ❌ Don't ignore proper URL normalization for API endpoints