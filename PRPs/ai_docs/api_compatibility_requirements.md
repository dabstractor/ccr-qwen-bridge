# OpenAI and Qwen API Tool Calling Compatibility Requirements

## Overview

This document provides critical compatibility information for implementing tool calling between OpenAI and Qwen APIs based on 2024 specifications.

## OpenAI API Tool Calling Specification (2024)

### Current API Structure

#### Tools Parameter (Replaces deprecated functions)
```json
{
  "tools": [
    {
      "type": "function", 
      "function": {
        "name": "get_weather",
        "description": "Get weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name"
            }
          },
          "required": ["location"]
        },
        "strict": true
      }
    }
  ],
  "tool_choice": "auto"
}
```

#### Tool Choice Options
- `"auto"` - Model decides whether to call tools (default)
- `"none"` - Force model to not call any tools  
- `{"type": "function", "function": {"name": "specific_tool"}}` - Force specific tool
- `"required"` - Force model to call at least one tool

#### Tool Message Format
```json
{
  "role": "tool",
  "tool_call_id": "call_abc123", 
  "content": "Weather is 72F and sunny"
}
```

#### Assistant Message with Tool Calls
```json
{
  "role": "assistant",
  "content": "I'll check the weather for you.",
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function", 
      "function": {
        "name": "get_weather",
        "arguments": "{\"location\": \"San Francisco\"}"
      }
    }
  ]
}
```

### Structured Outputs (2024 Enhancement) 
- Set `"strict": true` in function definition for guaranteed JSON Schema compliance
- Model will always return arguments that match the exact schema
- Prevents hallucinated parameters or invalid JSON

### Deprecated Fields (Still Supported)
- `functions` parameter → Use `tools` instead
- `function_call` parameter → Use `tool_choice` instead

## Qwen API Tool Calling Compatibility

### OpenAI Interface Compatibility
- **Endpoint**: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- **Format**: Supports OpenAI-compatible tool calling format directly
- **Tool Role**: Supports `role: "tool"` messages with `tool_call_id` mapping

### Qwen-Specific Optimizations
- **Hermes-style tool calling**: Recommended for best performance with Qwen3
- **Parallel tool calls**: Native support for concurrent function execution
- **Template parsing**: Can use vLLM/SGLang for advanced tool call parsing

### Deployment Options
```bash
# vLLM with Hermes tool parsing
vllm serve Qwen/Qwen3-8B --enable-auto-tool-choice --tool-call-parser hermes

# SGLang with Qwen2.5 parsing  
python -m sglang.launch_server --model-path Qwen/Qwen3-8B --tool-call-parser qwen25
```

### API Configuration
```javascript
// Qwen API client configuration
const client = new OpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY,
});

// Tool calling request (same as OpenAI format)
const completion = await client.chat.completions.create({
  model: 'qwen-coder-plus',
  messages: [
    { role: 'user', content: 'What is the weather in NYC?' },
    { 
      role: 'assistant', 
      content: 'I will check the weather for you.',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "NYC"}'
          }
        }
      ]
    },
    {
      role: 'tool',
      tool_call_id: 'call_123', 
      content: '{"temperature": 65, "condition": "partly cloudy"}'
    }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' }
          },
          required: ['location']
        }
      }
    }
  ]
});
```

## Critical Compatibility Requirements

### Message Role Validation
Both APIs require strict adherence to message role patterns:

1. **Assistant with tool_calls** must be followed by **tool messages** with matching `tool_call_id`
2. **Tool messages** must have valid `tool_call_id` that references a previous tool call
3. **Tool calls** must have unique IDs within the conversation

### Tool Definition Requirements
```typescript
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;           // Required, must be valid identifier
    description: string;    // Required, max 1024 characters  
    parameters?: {          // Optional, JSON Schema object
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
    strict?: boolean;       // OpenAI Structured Outputs flag
  };
}
```

### Error Handling Patterns

#### Qwen API Error Format
```json
{
  "error": {
    "message": "An assistant message with \"tool_calls\" must be followed by tool messages responding to each \"tool_call_id\"",
    "type": "validation_error",
    "details": "Please check your request format and ensure all required fields are present."
  }
}
```

#### Common Validation Errors
1. **Missing tool responses**: Assistant tool_calls without corresponding tool messages
2. **Orphaned tool messages**: Tool messages without matching tool_call_id  
3. **Invalid tool_call_id**: Tool messages referencing non-existent tool calls
4. **Malformed arguments**: Tool call arguments that aren't valid JSON
5. **Unsupported message roles**: APIs rejecting unknown role types

### Tool Call State Management

#### Required State Tracking
```typescript
interface ToolCallState {
  id: string;
  name: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  arguments: Record<string, unknown>;
  response?: string;
  error?: Error;
  timestamp: number;
}

// Track all tool calls in conversation
const toolCallTracker = new Map<string, ToolCallState>();
```

#### Validation Logic
```typescript  
function validateToolCallSequence(messages: Message[]): ValidationResult {
  const pendingToolCalls = new Set<string>();
  const respondedToolCalls = new Set<string>();
  
  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        pendingToolCalls.add(toolCall.id);
      }
    }
    
    if (message.role === 'tool') {
      if (!pendingToolCalls.has(message.tool_call_id)) {
        return { valid: false, error: 'Orphaned tool response' };
      }
      respondedToolCalls.add(message.tool_call_id);
    }
  }
  
  const unrespondedCalls = [...pendingToolCalls].filter(
    id => !respondedToolCalls.has(id)
  );
  
  if (unrespondedCalls.length > 0) {
    return { 
      valid: false, 
      error: `Missing tool responses for: ${unrespondedCalls.join(', ')}` 
    };
  }
  
  return { valid: true };
}
```

## Implementation Guidelines

### Request Translation Checklist
- [ ] Preserve all tool definitions in OpenAI format
- [ ] Pass through tool_choice parameter correctly  
- [ ] Maintain tool_call_id consistency
- [ ] Convert function calls to proper JSON strings
- [ ] Validate tool call sequences before sending

### Response Translation Checklist  
- [ ] Preserve tool_calls structure in assistant messages
- [ ] Extract tool call IDs correctly
- [ ] Parse function arguments safely with error handling
- [ ] Maintain finish_reason mapping
- [ ] Preserve usage metadata

### Error Recovery Strategies
- [ ] Retry on transient network errors
- [ ] Validate tool call format before API submission
- [ ] Provide helpful error messages for validation failures
- [ ] Implement circuit breaker for repeated API failures
- [ ] Log tool calling interactions for debugging

## Testing Validation

### Unit Test Cases
```javascript
// Test tool call validation
it('should validate tool call sequences', () => {
  const messages = [
    { role: 'assistant', tool_calls: [{ id: 'call_1', ... }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'result' }
  ];
  expect(validateToolCallSequence(messages)).toEqual({ valid: true });
});

// Test orphaned tool responses
it('should reject orphaned tool responses', () => {
  const messages = [
    { role: 'tool', tool_call_id: 'nonexistent', content: 'result' }
  ];
  expect(validateToolCallSequence(messages).valid).toBe(false);
});
```

### Integration Test Scenarios
1. **Basic tool calling flow**: Single tool call with response
2. **Parallel tool calls**: Multiple simultaneous tool calls  
3. **Multi-turn conversations**: Tool calls across multiple exchanges
4. **Error scenarios**: Invalid tool calls, network failures, timeouts
5. **Edge cases**: Empty tool responses, large payloads, special characters

## URL References

- OpenAI Function Calling Guide: https://platform.openai.com/docs/guides/function-calling
- OpenAI API Reference: https://platform.openai.com/docs/api-reference/chat/create
- Qwen Function Calling Docs: https://qwen.readthedocs.io/en/latest/framework/function_call.html
- Alibaba Cloud Model Studio: https://www.alibabacloud.com/help/en/model-studio/developer-reference/compatibility-of-openai-with-dashscope