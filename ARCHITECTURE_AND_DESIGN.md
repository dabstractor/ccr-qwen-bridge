# Qwen Code Bridge: Architecture and Design Document

**Version:** 1.0
**Date:** August 14, 2025
**Author:** Qwen Code

## 1. Introduction

This document outlines the architecture and design for the Qwen Code Bridge, a proxy server that enables OpenAI-compatible clients (specifically `claude-code-router`) to seamlessly use Qwen-Code's free daily API quota. The server implements Qwen-Code's OAuth 2.0 Device Authorization Flow to maintain authenticated sessions and proxy requests.

## 2. System Overview

The Qwen Code Bridge is a lightweight, stateful proxy server that sits between OpenAI-compatible clients (like `claude-code-router`) and Qwen-Code's API. It handles the complex OAuth 2.0 authentication flow that would normally require the official `qwen-code` CLI, allowing users to leverage their free API quota through third-party tools.

### 2.1. Key Components

1. **HTTP Proxy Server**: Listens for incoming OpenAI-compatible requests and forwards them to Qwen-Code's API
2. **OAuth Token Manager**: Manages authentication tokens, including proactive refresh and credential persistence
3. **Request Translator**: Converts between OpenAI and Qwen-Code API formats
4. **Configuration Manager**: Handles server configuration via files or environment variables
5. **Logger**: Provides structured logging for monitoring and debugging

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenAI-Compatible Client                 │
│                   (e.g., claude-code-router)                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ OpenAI-compatible requests
                          │ (POST /v1/chat/completions)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Qwen Code Bridge Server                   │
│                                                             │
│  ┌──────────────────┐    ┌─────────────────────────────┐   │
│  │  HTTP Server     │───▶│   OAuth Token Manager       │   │
│  │                  │    │                             │   │
│  │  - Listens on    │    │  - Reads/writes credentials │   │
│  │    configurable  │    │  - Proactively refreshes    │   │
│  │    port          │    │    tokens                   │   │
│  │  - Handles       │    │  - Manages token lifecycle  │   │
│  │    routing       │    │                             │   │
│  └──────────────────┘    └─────────────────────────────┘   │
│            │                        │                      │
│            ▼                        ▼                      │
│  ┌──────────────────┐    ┌─────────────────────────────┐   │
│  │ Request/Response │    │   Configuration Manager     │   │
│  │   Translator     │    │                             │   │
│  │                  │    │  - Loads config from file   │   │
│  │  - Converts      │    │    or environment vars      │   │
│  │    request       │    │  - Manages server settings  │   │
│  │    formats       │    │                             │   │
│  │  - Converts      │    └─────────────────────────────┘   │
│  │    response      │                                      │
│  │    formats       │                                      │
│  └──────────────────┘                                      │
│            │                                               │
│            ▼                                               │
│  ┌──────────────────┐                                      │
│  │     Logger       │                                      │
│  │                  │                                      │
│  │  - Structured    │                                      │
│  │    logging       │                                      │
│  │  - Log levels    │                                      │
│  └──────────────────┘                                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Qwen-Code API requests
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Qwen-Code API                        │
└─────────────────────────────────────────────────────────────┘
```

## 4. Detailed Component Design

### 4.1. HTTP Proxy Server

**Responsibilities:**
- Listen for incoming HTTP requests on a configurable host and port
- Handle OpenAI-compatible `/v1/chat/completions` requests
- Route requests through the authentication and translation layers
- Return properly formatted responses to clients

**Specifications:**
- Framework: Express.js (Node.js)
- Default port: 31337
- Supported endpoints:
  - `POST /v1/chat/completions` - Chat completions proxy
  - `GET /health` - Health check endpoint

### 4.2. OAuth Token Manager

**Responsibilities:**
- Load credentials from the Qwen-Code credentials file
- Check token expiration status
- Proactively refresh expired tokens
- Persist updated credentials to disk
- Provide valid access tokens for API requests

**Specifications:**
- Credentials file path: `~/.qwen/oauth_creds.json` (configurable)
- Token refresh logic:
  - Check if current token is expired before each request
  - If expired, make POST request to token endpoint:
    ```
    POST https://chat.qwen.ai/api/v1/oauth2/token
    Content-Type: application/json
    
    {
      "grant_type": "refresh_token",
      "client_id": "f0304373b74a44d2b584a3fb70ca9e56",
      "refresh_token": "[current_refresh_token]"
    }
    ```
  - Calculate new `expiry_date` as `Date.now() + (expires_in * 1000)`
  - Atomically write updated credentials to file
- Error handling:
  - Log unrecoverable auth errors (e.g., `invalid_grant`)
  - Stop serving requests until manually restarted

### 4.3. Request/Response Translator

**Responsibilities:**
- Translate OpenAI-compatible requests to Qwen-Code API format
- Translate Qwen-Code responses to OpenAI-compatible format
- Handle API endpoint construction based on `resource_url`

**Specifications:**
- API endpoint construction:
  - Base URL from `resource_url` in token response
  - Fallback to `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - Normalize URL to ensure it starts with `https://` and ends with `/v1`
- Request translation:
  - Map OpenAI fields to Qwen-Code equivalent fields
  - Preserve model selection and parameters
- Response translation:
  - Convert Qwen-Code response format to OpenAI-compatible format
  - Ensure proper error handling and status codes

### 4.4. Configuration Manager

**Responsibilities:**
- Load configuration from file or environment variables
- Provide default values for all configuration options
- Validate configuration values

**Specifications:**
- Configurable options:
  - `HOST`: Server listening host (default: `localhost`)
  - `PORT`: Server listening port (default: `31337`)
  - `CREDENTIALS_FILE_PATH`: Path to Qwen-Code credentials file (default: `~/.qwen/oauth_creds.json`)
- Configuration precedence:
  1. Environment variables
  2. Configuration file (`.env`)
  3. Default values

### 4.5. Logger

**Responsibilities:**
- Provide structured logging for all server operations
- Support different log levels (INFO, WARN, ERROR)
- Log critical events and errors for diagnostics

**Specifications:**
- Log format: JSON with timestamp, level, and message
- Key events to log:
  - Server startup/shutdown
  - Successful API request proxying
  - Successful token refresh
  - Failed API requests
  - Failed token refreshes
  - Fatal authentication errors

## 5. Data Flow

### 5.1. Server Startup

1. Configuration Manager loads settings
2. OAuth Token Manager reads credentials from file
3. HTTP Server starts listening on configured port
4. Logger records successful startup

### 5.2. Incoming Request Handling

1. HTTP Server receives OpenAI-compatible request
2. OAuth Token Manager checks if access token is expired
3. If expired:
   - Make token refresh request to Qwen-Code API
   - Update credentials file with new tokens
4. Request Translator converts OpenAI request to Qwen-Code format
5. HTTP Server forwards request to Qwen-Code API with Bearer token
6. Qwen-Code API processes request and returns response
7. Request Translator converts response to OpenAI-compatible format
8. HTTP Server returns response to client
9. Logger records successful request or any errors

### 5.3. Token Refresh Process

1. OAuth Token Manager detects expired token
2. Make POST request to token endpoint with refresh token
3. If successful:
   - Calculate new `expiry_date`
   - Atomically update credentials file
   - Update in-memory token state
4. If failed:
   - Log error details
   - If unrecoverable error, stop serving requests
5. Logger records token refresh success or failure

## 6. Error Handling

### 6.1. Recoverable Errors

- Temporary network issues with Qwen-Code API
- Rate limiting from Qwen-Code API
- Token refresh failures that can be retried

These errors will be logged and retried where appropriate, with proper error responses sent to clients.

### 6.2. Unrecoverable Errors

- Invalid refresh token (`invalid_grant`)
- Access denied (`access_denied`)
- Credentials file corruption or inaccessibility

These errors will be logged as fatal errors, with instructions for the user to re-authenticate with the official CLI. The server will stop serving requests until manually restarted.

## 7. Security Considerations

1. **Token Storage**: Credentials are stored in the user's home directory with appropriate file permissions
2. **Token Transmission**: All communication with Qwen-Code API uses HTTPS
3. **Token Exposure**: Access tokens are never logged or exposed in error messages
4. **File Access**: Atomic writes are used to prevent credential file corruption

## 8. Performance Considerations

1. **Token Refresh**: Proactive token refresh prevents latency spikes for user requests
2. **Connection Reuse**: HTTP connections to Qwen-Code API are reused where possible
3. **Minimal Processing**: Request/response translation is kept to a minimum for low latency

## 9. Deployment Considerations

1. **Docker Support**: Dockerfile provided for containerized deployment
2. **Health Checks**: `/health` endpoint for monitoring
3. **Configuration**: All settings configurable via environment variables for container orchestration

## 10. Future Extensibility

1. **Additional Endpoints**: Support for other Qwen-Code API endpoints can be added following the same pattern
2. **Caching**: In-memory cache for frequently requested completions to reduce API calls
3. **Authentication Helper**: Utility to automate the initial device authorization flow

## 11. PRD Requirements Coverage

This architecture covers all requirements specified in the Product Requirements Document (PRD.md):

| PRD Requirement | Coverage Location |
|-----------------|-------------------|
| F-1.1: Configurable IP address and port | Section 4.1, 4.4 |
| F-1.2: OpenAI-compatible Chat Completion requests | Section 4.1, 10 (MVP) |
| F-1.3: Forward requests to Qwen-Code API | Section 4.3, 5.2 |
| F-1.4: Transform response to OpenAI format | Section 4.3, 5.2 |
| F-2.1: Pre-existing oauth_creds.json file | Section 4.2, 5.1 |
| F-2.2: Credential loading on startup | Section 4.2, 5.1 |
| F-2.3: In-memory token state management | Section 4.2 |
| F-2.4: Proactive token refresh check | Section 4.2, 5.2 |
| F-2.5: Token refresh logic | Section 4.2, 5.3 |
| F-2.6: Credential persistence | Section 4.2, 5.3 |
| F-2.7: Authorization header with Bearer token | Section 4.2, 5.2 |
| F-3.1: Configurable host and port | Section 4.4, 5.1 |
| F-3.2: Configurable credentials file path | Section 4.4, 5.1 |
| F-4.1: Structured logging for key events | Section 4.5, 5.1, 5.2, 5.3 |
| F-4.2: Detailed error logging | Section 4.5, 6.1, 6.2 |
| F-4.3: Fatal error handling | Section 6.2 |

## 12. Implementation Roadmap

### Phase 1: MVP (Minimum Viable Product)
1. Basic HTTP server implementation
2. OAuth token management with file-based persistence
3. Request/response translation for chat completions
4. Basic console logging
5. Hardcoded configuration with defaults

### Phase 2: Usability & Robustness
1. Configuration file support
2. Environment variable support
3. Structured JSON logging
4. Enhanced error handling and reporting
5. Health check endpoint

### Phase 3: Advanced Features
1. Docker containerization
2. Robust file locking for credential writes
3. Performance monitoring and metrics
4. Documentation and packaging for distribution