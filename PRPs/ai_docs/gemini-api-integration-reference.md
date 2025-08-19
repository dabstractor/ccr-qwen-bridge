# Gemini API Integration Technical Reference

## Overview
This document provides technical details for implementing the Gemini provider in the CCR Qwen Bridge, based on the Gemini CLI Technical Reference and the existing modular architecture.

## Authentication Configuration

### OAuth Constants
```javascript
// src/auth/gemini-auth-manager.js
this.TOKEN_URL = 'https://oauth2.googleapis.com/token';
this.CLIENT_ID = '688255829395-of8ft2oprdrnp9e3aqf6dv3hmdib135j.apps.googleusercontent.com';
this.SCOPE = 'https://www.googleapis.com/auth/generative-language';
this.credentialsPath = '~/.gemini/oauth_creds.json';
```

### Credential File Structure
```json
{
  "access_token": "ya29...",
  "refresh_token": "1//...",
  "token_type": "Bearer",
  "expiry_date": 1234567890123,
  "scopes": [
    "https://www.googleapis.com/auth/generative-language"
  ]
}
```

## API Translation Mappings

### Request Format Conversion
**OpenAI Input:**
```json
{
  "model": "gemini/gemini-pro",
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

**Gemini Output:**
```javascript
{
  "model": "gemini-pro",
  "contents": [
    {"role": "user", "parts": [{"text": "Hello"}]}
  ]
}
```

### Role Mapping
| OpenAI Role | Gemini Role |
|-------------|-------------|
| user        | user        |
| assistant   | model       |
| system      | user        |
| tool        | user        |

### Tool Calling Format
**OpenAI Function Call:**
```json
{
  "role": "assistant",
  "tool_calls": [{
    "id": "call_123",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\": \"New York\"}"
    }
  }]
}
```

**Gemini Function Call:**
```javascript
{
  "role": "model",
  "parts": [{
    "functionCall": {
      "name": "get_weather",
      "args": {
        "location": "New York"
      }
    }
  }]
}
```

**OpenAI Tool Response:**
```json
{
  "role": "tool",
  "tool_call_id": "call_123",
  "content": "Sunny, 75°F"
}
```

**Gemini Tool Response:**
```javascript
{
  "role": "user",
  "parts": [{
    "functionResponse": {
      "name": "get_weather",
      "response": {
        "content": "Sunny, 75°F"
      }
    }
  }]
}
```

## API Endpoints

### Base URL
- **Gemini**: `https://generativelanguage.googleapis.com/v1`
- **Model Endpoint**: `/models/{model}:generateContent?key={access_token}`

### Available Models
- `gemini-pro` (default)
- `gemini-flash`
- `gemini-flash-lite`

## Streaming Response Format

### SSE Format
```
data: {"candidates": [...]}
data: {"candidates": [...]}
data: [DONE]
```

### Chunk Translation
**Gemini Chunk:**
```javascript
{
  "candidates": [{
    "content": {
      "role": "model",
      "parts": [{"text": "Hel"}]
    }
  }]
}
```

**OpenAI Chunk:**
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion.chunk",
  "choices": [{
    "delta": {
      "content": "Hel"
    }
  }]
}
```

## Error Handling

### Common Error Codes
- **401**: Invalid or expired access token
- **403**: Insufficient permissions or quota exceeded
- **429**: Rate limiting
- **500**: Internal server error

### Error Response Format
```json
{
  "error": {
    "code": 401,
    "message": "Request had invalid authentication credentials.",
    "status": "UNAUTHENTICATED"
  }
}
```

## Configuration Environment Variables

```env
# Provider Enablement
PROVIDER_GEMINI_ENABLED=true

# Authentication
PROVIDER_GEMINI_CREDENTIALS_PATH=~/.gemini/oauth_creds.json
PROVIDER_GEMINI_CLIENT_ID=688255829395-of8ft2oprdrnp9e3aqf6dv3hmdib135j.apps.googleusercontent.com

# API Configuration
PROVIDER_GEMINI_DEFAULT_MODEL=gemini-pro
PROVIDER_GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1
PROVIDER_GEMINI_REQUEST_TIMEOUT=30000
```

## Implementation Checklist

### Core Functionality
- [ ] Authentication manager with token refresh
- [ ] Request translator (OpenAI → Gemini)
- [ ] Response translator (Gemini → OpenAI)
- [ ] API forwarding with proper headers
- [ ] Streaming response handling

### Advanced Features
- [ ] Tool calling translation
- [ ] Function call/response handling
- [ ] Role mapping preservation
- [ ] Error code translation

### Integration Points
- [ ] Provider factory registration
- [ ] Server-side provider selection
- [ ] Configuration manager support
- [ ] Credential file isolation

## Testing Scenarios

### Basic Functionality
1. Simple chat completion request
2. Multi-turn conversation
3. System message handling
4. Empty response handling

### Tool Calling
1. Function call generation
2. Tool response processing
3. Multi-tool call scenarios
4. Invalid tool call handling

### Edge Cases
1. Invalid access token
2. Expired credentials
3. Rate limiting
4. Network timeouts
5. Malformed responses

## Performance Considerations

### Token Management
- Proactive token refresh 5 minutes before expiration
- Automatic retry on token expiration
- Credential file atomic writes for safety

### Request Handling
- 30-second default timeout (configurable)
- Connection pooling for efficiency
- Proper error propagation

### Memory Management
- Streaming response buffering limits
- Chunk processing without excessive memory usage
- Proper cleanup of request resources
