# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **CCR Qwen Bridge** project - a lightweight, stateful proxy server that enables OpenAI-compatible clients (specifically `claude-code-router`) to use Qwen-Code's free daily API quota. The server manages OAuth 2.0 Device Authorization Flow authentication and proxies requests between OpenAI-compatible format and Qwen-Code's API.

## Architecture

The system consists of 5 main components:

1. **HTTP Proxy Server** - Listens for OpenAI-compatible requests on configurable host/port
2. **OAuth Token Manager** - Manages authentication tokens, refresh, and credential persistence  
3. **Request Translator** - Converts between OpenAI and Qwen-Code API formats
4. **Configuration Manager** - Handles server configuration via files/environment variables
5. **Logger** - Provides structured logging for monitoring and debugging

## Key Technical Details

### Authentication Flow
- Uses OAuth 2.0 Device Authorization Flow with PKCE
- Credentials stored in `~/.qwen/oauth_creds.json` 
- Tokens refreshed proactively before expiration
- Client ID: `f0304373b74a44d2b584a3fb70ca9e56`
- Token endpoint: `https://chat.qwen.ai/api/v1/oauth2/token`

### API Endpoints
- Primary endpoint: `/v1/chat/completions` (OpenAI-compatible)
- Health check: `/health`
- Target API base URL determined from `resource_url` in token response
- Fallback: `https://dashscope.aliyuncs.com/compatible-mode/v1`

### Configuration
Default values:
- Host: `localhost`
- Port: `31337`
- Credentials file: `~/.qwen/oauth_creds.json`

Configuration precedence: Environment variables → Config file (`.env`) → Defaults

## Development Status

This is a **planning phase** project. Currently contains only documentation:
- `PRD.md` - Complete product requirements document
- `ARCHITECTURE_AND_DESIGN.md` - Detailed technical architecture 
- `qwen-code-oauth-lifecycle.md` - OAuth flow analysis
- `qwen_oauth_implementation_details.md` - Technical implementation specifics

## Implementation Roadmap

### Phase 1: MVP
- Basic HTTP server (Express.js/Node.js recommended)
- OAuth token management with file persistence
- Request/response translation for chat completions
- Basic console logging

### Phase 2: Usability & Robustness  
- Configuration file support
- Structured JSON logging
- Enhanced error handling
- Health check endpoint

### Phase 3: Advanced Features
- Docker containerization
- File locking for credential writes
- Performance monitoring

## Security Requirements

- All communication with Qwen-Code API uses HTTPS
- Access tokens never logged or exposed in error messages
- Atomic writes for credential file updates
- Appropriate file permissions for credential storage

## Error Handling Strategy

**Recoverable errors** (log and retry):
- Network issues, rate limiting, temporary token refresh failures

**Unrecoverable errors** (fatal, stop serving):
- Invalid refresh token (`invalid_grant`)
- Access denied (`access_denied`) 
- Credential file corruption

When unrecoverable errors occur, instruct user to re-authenticate with official CLI.

## Technology Choices

- **Framework**: Express.js (Node.js) for HTTP server
- **Authentication**: Native OAuth 2.0 implementation (no external libraries needed)
- **Configuration**: Environment variables + optional `.env` file
- **Logging**: Structured JSON format with configurable levels
- **Storage**: File-based credential persistence (no database required)