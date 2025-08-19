# Tool Calling Implementation Patterns from qwen-code Project

## Overview

This document contains critical patterns extracted from the qwen-code project for implementing robust tool calling translation between OpenAI and Qwen APIs.

## Key Files to Reference

### Primary Implementation Files
- `/home/dustin/src/qwen-code/packages/core/src/core/openaiContentGenerator.ts` - Main OpenAI tool calling logic
- `/home/dustin/src/qwen-code/packages/core/src/core/coreToolScheduler.ts` - Tool execution state management  
- `/home/dustin/src/qwen-code/packages/core/src/tools/` - Tool system implementation

## Critical Tool Calling Conversion Patterns

### 1. Gemini to OpenAI Tool Conversion

```typescript
// From openaiContentGenerator.ts lines 483-536
private async convertGeminiToolsToOpenAI(
  geminiTools: ToolListUnion,
): Promise<OpenAI.Chat.ChatCompletionTool[]> {
  const openAITools: OpenAI.Chat.ChatCompletionTool[] = [];
  for (const tool of geminiTools) {
    let actualTool: Tool;
    // Handle CallableTool vs Tool
    if ('tool' in tool) {
      // This is a CallableTool
      actualTool = await (tool as CallableTool).tool();
    } else {
      // This is already a Tool
      actualTool = tool as Tool;
    }
    if (actualTool.functionDeclarations) {
      for (const func of actualTool.functionDeclarations) {
        if (func.name && func.description) {
          let parameters: Record<string, unknown> | undefined;
          // Handle both Gemini tools (parameters) and MCP tools (parametersJsonSchema)
          if (func.parametersJsonSchema) {
            // MCP tool format - use parametersJsonSchema directly
            parameters = {
              ...(func.parametersJsonSchema as Record<string, unknown>),
            };
          } else if (func.parameters) {
            // Gemini tool format - convert parameters to OpenAI format
            parameters = this.convertGeminiParametersToOpenAI(
              func.parameters as Record<string, unknown>,
            );
          }
          openAITools.push({
            type: 'function',
            function: {
              name: func.name,
              description: func.description,
              parameters,
            },
          });
        }
      }
    }
  }
  return openAITools;
}
```

### 2. Message Conversion with Tool Calls

```typescript
// From openaiContentGenerator.ts lines 537-620
private convertToOpenAIFormat(
  request: GenerateContentParameters,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  
  // Handle function responses (tool results)
  if (functionResponses.length > 0) {
    for (const funcResponse of functionResponses) {
      messages.push({
        role: 'tool' as const,
        tool_call_id: funcResponse.id || '',
        content:
          typeof funcResponse.response === 'string'
            ? funcResponse.response
            : JSON.stringify(funcResponse.response),
      });
    }
  }
  // Handle model messages with function calls
  else if (content.role === 'model' && functionCalls.length > 0) {
    const toolCalls = functionCalls.map((fc, index) => ({
      id: fc.id || `call_${index}`,
      type: 'function' as const,
      function: {
        name: fc.name || '',
        arguments: JSON.stringify(fc.args || {}),
      },
    }));
    messages.push({
      role: 'assistant' as const,
      content: textParts.join('\n') || null,
      tool_calls: toolCalls,
    });
  }
}
```

### 3. Response Conversion from OpenAI to Gemini

```typescript  
// From openaiContentGenerator.ts lines 621-670
private convertToGeminiFormat(
  openaiResponse: OpenAI.Chat.ChatCompletion,
): GenerateContentResponse {
  const choice = openaiResponse.choices[0];
  const response = new GenerateContentResponse();
  const parts: Part[] = [];
  
  // Handle tool calls
  if (choice.message.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.function) {
        let args: Record<string, unknown> = {};
        if (toolCall.function.arguments) {
          args = safeJsonParse(toolCall.function.arguments, {});
        }
        parts.push({
          functionCall: {
            id: toolCall.id,
            name: toolCall.function.name,
            args,
          },
        });
      }
    }
  }
  
  response.candidates = [
    {
      content: {
        parts,
        role: 'model' as const,
      },
      finishReason: this.mapFinishReason(choice.finish_reason || 'stop'),
      index: 0,
      safetyRatings: [],
    },
  ];
  
  return response;
}
```

## Tool State Management Patterns  

### Tool Call Status Types

```typescript
// From coreToolScheduler.ts lines 33-82
export type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequestInfo;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequestInfo;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequestInfo;
  tool: Tool;
  liveOutput?: string;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequestInfo;
  tool: Tool;
  response: ToolCallResponseInfo;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};
```

## Key Implementation Requirements

### 1. Preserve Tool Call Structure
- Never convert tool messages to user messages
- Maintain tool_call_id mapping between calls and responses
- Preserve all tool definition metadata

### 2. State Management
- Track tool call execution status
- Handle concurrent tool calls properly  
- Implement proper error recovery

### 3. Format Validation
- Validate tool definitions match OpenAI schema
- Ensure tool call arguments are valid JSON
- Verify tool responses have required fields

### 4. Error Handling
- Distinguish recoverable vs unrecoverable tool errors
- Provide meaningful error messages
- Implement proper timeout handling

## Anti-Patterns to Avoid

### ❌ Converting Tool Messages to User Messages
```javascript
// DON'T DO THIS - breaks tool calling flow
if (message.role === 'tool') {
  return {
    role: 'user',
    content: `Tool result: ${message.content}`
  };
}
```

### ❌ Aggressive Tool Call Filtering  
```javascript
// DON'T DO THIS - removes valid pending tool calls
const filteredToolCalls = message.tool_calls.filter(call => 
  toolCallIdsWithResponses.has(call.id)
);
```

### ❌ Ignoring Tool Call IDs
```javascript
// DON'T DO THIS - breaks tool call correlation  
messages.push({
  role: 'tool',
  content: response,
  // Missing tool_call_id field!
});
```

## Best Practices

### ✅ Preserve Tool Message Structure
```javascript
// Proper tool message preservation
if (message.role === 'tool') {
  return {
    role: 'tool',
    tool_call_id: message.tool_call_id,
    content: message.content
  };
}
```

### ✅ Proper Tool Call State Management
```javascript
// Track tool call lifecycle properly
const toolCallState = {
  id: toolCall.id,
  status: 'executing',
  startTime: Date.now(),
  request: toolCall,
  tool: resolvedTool
};
```

### ✅ Comprehensive Error Handling
```javascript
// Handle specific tool calling error cases
if (error.message.includes('tool_calls')) {
  throw new ToolCallValidationError(
    'Tool call format validation failed', 
    { originalError: error }
  );
}
```