# Base PRP: Qwen Code Bridge Implementation

**Feature:** OAuth 2.0 Proxy Server for Qwen-Code API Integration  
**Status:** Planning Phase  
**Priority:** High  
**Estimated Effort:** 3-4 weeks (3 phases)

## Executive Summary

The Qwen Code Bridge is a lightweight, stateful proxy server that enables OpenAI-compatible clients (specifically `claude-code-router`) to seamlessly use Qwen-Code's 2,000 free daily API requests. The bridge handles the complex OAuth 2.0 Device Authorization Flow that would normally require the official `qwen-code` CLI, allowing developers to leverage their free API quota through third-party tools.

## Problem Statement

Developers want to leverage Qwen-Code's generous free tier for their coding assistant workflows but are locked into using specific tools that expect OpenAI-compatible endpoints. Qwen-Code's CLI-based authentication prevents direct integration, forcing users to choose between their preferred tools and free API credits.

## Solution Overview

A proxy server that:
- Manages OAuth 2.0 Device Authorization Flow authentication lifecycle
- Provides OpenAI-compatible API endpoints
- Maintains persistent authentication sessions
- Proxies requests between OpenAI and Qwen-Code API formats

## Technical Architecture

### Core Components
1. **HTTP Proxy Server** - Express.js server listening on configurable host/port
2. **OAuth Token Manager** - Handles token lifecycle, refresh, and persistence  
3. **Request Translator** - Converts between OpenAI ↔ Qwen-Code formats
4. **Configuration Manager** - File/environment-based configuration
5. **Logger** - Structured JSON logging with multiple levels

### Key Technical Specifications

#### Authentication Flow
- **Token URL:** `https://chat.qwen.ai/api/v1/oauth2/token`
- **Client ID:** `f0304373b74a44d2b584a3fb70ca9e56`
- **Credentials File:** `~/.qwen/oauth_creds.json`
- **Required Fields:** `access_token`, `refresh_token`, `expiry_date` (Unix timestamp in ms)

#### API Endpoints
- **Primary:** `POST /v1/chat/completions` (OpenAI-compatible)
- **Health Check:** `GET /health`
- **Target API:** Dynamic from `resource_url` in token response
- **Fallback:** `https://dashscope.aliyuncs.com/compatible-mode/v1`

#### Token Management
- **Expiration Check:** Before each request (`Date.now() > expiry_date`)
- **Refresh Request:** 
  ```json
  {
    "grant_type": "refresh_token",
    "client_id": "f0304373b74a44d2b584a3fb70ca9e56", 
    "refresh_token": "[current_refresh_token]"
  }
  ```
- **Expiry Calculation:** `Date.now() + (expires_in * 1000)`
- **Atomic File Writes:** Prevent credential corruption

## Implementation Phases

### Phase 1: MVP (Core Engine)
**Goal:** Achieve core functionality and solve the immediate problem

**Deliverables:**
- Basic HTTP server with `/v1/chat/completions` endpoint
- OAuth token management with file persistence
- Request/response translation for chat completions
- Basic console logging
- Hardcoded configuration with defaults

**Acceptance Criteria:**
- Server successfully proxies OpenAI requests to Qwen-Code API
- Tokens automatically refresh when expired
- Credentials persist across server restarts
- Basic error logging for diagnostics

### Phase 2: Usability & Robustness
**Goal:** Make the server configurable, reliable, and developer-friendly

**Deliverables:**
- Configuration file support (`.env`, environment variables)
- Structured JSON logging with configurable levels
- Enhanced error handling and user-friendly messages
- Health check endpoint
- Improved packaging and CLI wrapper

**Acceptance Criteria:**
- All settings configurable via environment/files
- Detailed logs for troubleshooting
- Graceful handling of auth failures with user guidance
- Production-ready error handling

### Phase 3: Advanced Features & Polish
**Goal:** Harden for advanced use cases and deployments

**Deliverables:**
- Docker containerization
- Robust file locking for credential writes
- Performance monitoring and metrics
- Documentation and distribution packaging
- Optional response caching

**Acceptance Criteria:**
- Container-ready deployment
- No credential file corruption under load
- Comprehensive documentation
- Performance optimizations implemented

## Functional Requirements

### Core Functionality (F-1.x)
- **F-1.1:** Listen on configurable IP address and port
- **F-1.2:** Accept OpenAI-compatible Chat Completion requests
- **F-1.3:** Forward requests to Qwen-Code API with format translation
- **F-1.4:** Transform responses back to OpenAI-compatible format

### Authentication & Session Management (F-2.x)
- **F-2.1:** Require pre-existing valid `oauth_creds.json` from official CLI
- **F-2.2:** Load credentials from `~/.qwen/oauth_creds.json` on startup
- **F-2.3:** Manage `access_token`, `refresh_token`, `expiry_date` in memory
- **F-2.4:** Check token expiration before each request
- **F-2.5:** Automatically refresh expired tokens
- **F-2.6:** Persist updated credentials atomically to disk
- **F-2.7:** Include valid access token in Authorization header

### Configuration (F-3.x)
- **F-3.1:** Configurable host/port via files or command-line
- **F-3.2:** Configurable credentials file path

### Logging & Error Handling (F-4.x)
- **F-4.1:** Structured logs for key events
- **F-4.2:** Detailed error logging for failed requests/refreshes
- **F-4.3:** Fatal error handling for unrecoverable auth errors

## Error Handling Strategy

### Recoverable Errors (Log & Retry)
- Network issues with Qwen-Code API
- Rate limiting from API
- Temporary token refresh failures

### Unrecoverable Errors (Fatal, Stop Serving)
- Invalid refresh token (`invalid_grant`)
- Access denied (`access_denied`)
- Credential file corruption
- **Action:** Log fatal error, instruct user to re-authenticate with official CLI

## Security Considerations

- **HTTPS Only:** All Qwen-Code API communication
- **Token Protection:** Never log or expose access tokens
- **File Permissions:** Appropriate security for credential storage
- **Atomic Writes:** Prevent credential file corruption

## Success Metrics

- **Functional:** Successfully proxy 100% of valid OpenAI requests to Qwen-Code
- **Reliability:** 99.9% uptime with proper token refresh
- **Performance:** <100ms additional latency for request translation
- **Usability:** Clear error messages and recovery instructions

## Dependencies & Assumptions

### Dependencies
- Node.js runtime environment
- Pre-existing `oauth_creds.json` from official `qwen-code` CLI
- Network access to Qwen-Code API endpoints

### Assumptions
- Qwen API endpoints and auth flow remain stable
- Users have successfully authenticated once with official CLI
- OAuth 2.0 Device Flow specifications are followed exactly

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Qwen API changes | High | Medium | Clear dependency documentation, easy-to-update constants |
| Refresh token expiry | Medium | Low | Clear user guidance for re-authentication |
| Concurrent file writes | Medium | Medium | Atomic write operations, file locking |
| Token security | High | Low | No token logging, secure file permissions |

## Technical Implementation Notes

### OAuth 2.0 Device Flow Details
- **PKCE Implementation:** 32 random bytes → base64url encoded
- **Code Challenge:** SHA-256 hash of verifier → base64url encoded  
- **Polling:** 2-second intervals, adaptive backoff on `slow_down`
- **Termination:** Success, cancellation, timeout, or unrecoverable error

### API Endpoint Construction
- Check `resource_url` in token response
- Fallback to `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Normalize: ensure `https://` prefix and `/v1` suffix

### Configuration Precedence
1. Environment variables
2. Configuration file (`.env`)
3. Default values

## Future Extensibility

- Support for additional Qwen API endpoints
- In-memory caching for frequent completions
- Authentication helper for initial device flow
- Support for multiple credential profiles