import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Logger } from '../src/logger.js';
import { RequestTranslator } from '../src/request-translator.js';
import { ToolCallValidator, ToolCallState, ValidationResult } from '../src/tool-call-validator.js';

describe('ToolCallValidator', () => {
  test('should create validator instance', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    assert(validator instanceof ToolCallValidator);
    assert(validator.logger instanceof Logger);
  });

  test('should validate valid tool call sequence', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    
    const messages = [
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
        content: '{"temperature": 65, "condition": "sunny"}'
      }
    ];

    const result = validator.validateToolCallSequence(messages);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.toolCallCount, 1);
    assert.strictEqual(result.respondedToolCallCount, 1);
  });

  test('should detect orphaned tool responses', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    
    const messages = [
      {
        role: 'tool',
        tool_call_id: 'nonexistent_call',
        content: 'Some result'
      }
    ];

    const result = validator.validateToolCallSequence(messages);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 1);
    assert(result.errors[0].includes('Orphaned tool response'));
  });

  test('should detect missing tool responses', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    
    const messages = [
      {
        role: 'assistant',
        content: 'I will check the weather.',
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
      }
      // Missing tool response
    ];

    const result = validator.validateToolCallSequence(messages);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 1);
    assert(result.errors[0].includes('Missing tool responses'));
    assert(result.errors[0].includes('call_123'));
  });

  test('should validate tool call with invalid JSON arguments', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    
    const messages = [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: 'invalid json'
            }
          }
        ]
      }
    ];

    const result = validator.validateToolCallSequence(messages);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 1);
    assert(result.errors[0].includes('invalid JSON arguments'));
  });

  test('should handle parallel tool calls', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    
    const messages = [
      {
        role: 'assistant',
        content: 'I will check weather and time.',
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "NYC"}'
            }
          },
          {
            id: 'call_time',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{"timezone": "EST"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_weather',
        content: '{"temperature": 65}'
      },
      {
        role: 'tool',
        tool_call_id: 'call_time',
        content: '{"time": "2:30 PM"}'
      }
    ];

    const result = validator.validateToolCallSequence(messages);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.toolCallCount, 2);
    assert.strictEqual(result.respondedToolCallCount, 2);
  });

  test('should track tool call state', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    
    validator.trackToolCallState('call_123', ToolCallState.EXECUTING, { startTime: Date.now() });
    
    const state = validator.getToolCallState('call_123');
    assert.strictEqual(state.status, ToolCallState.EXECUTING);
    assert(state.startTime);
  });

  test('should cleanup orphaned calls', () => {
    const logger = new Logger();
    const validator = new ToolCallValidator(logger);
    
    const oldTimestamp = Date.now() - 400000; // 6+ minutes ago
    validator.trackToolCallState('old_call', ToolCallState.PENDING, { 
      timestamp: oldTimestamp,
      call: { function: { name: 'test' } }
    });
    validator.trackToolCallState('new_call', ToolCallState.PENDING, { 
      timestamp: Date.now(),
      call: { function: { name: 'test' } }
    });
    
    const cleanedUp = validator.cleanupOrphanedCalls(300000); // 5 minute timeout
    assert.strictEqual(cleanedUp.length, 1);
    assert.strictEqual(cleanedUp[0], 'old_call');
    assert(validator.getToolCallState('new_call')); // Should still exist
  });
});

describe('RequestTranslator - Tool Calling', () => {
  test('should preserve tool definitions in OpenAI to Qwen translation', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const openAIRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' }
              },
              required: ['location']
            }
          }
        }
      ],
      tool_choice: 'auto'
    };

    const qwenRequest = translator.translateOpenAIToQwen(openAIRequest);
    
    assert.strictEqual(qwenRequest.tools.length, 1);
    assert.strictEqual(qwenRequest.tools[0].function.name, 'get_weather');
    assert.strictEqual(qwenRequest.tool_choice, 'auto');
  });

  test('should preserve tool messages in message transformation', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const messages = [
      {
        role: 'assistant',
        content: 'I will check the weather.',
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
        content: '{"temperature": 65, "condition": "sunny"}'
      }
    ];

    const transformedMessages = translator.transformMessagesForQwen(messages);
    
    // Tool message should be preserved as-is
    const toolMessage = transformedMessages.find(m => m.role === 'tool');
    assert(toolMessage, 'Tool message should be preserved');
    assert.strictEqual(toolMessage.role, 'tool');
    assert.strictEqual(toolMessage.tool_call_id, 'call_123');
    assert.strictEqual(toolMessage.content, '{"temperature": 65, "condition": "sunny"}');
    
    // Assistant message with tool calls should be preserved
    const assistantMessage = transformedMessages.find(m => m.role === 'assistant');
    assert(assistantMessage, 'Assistant message should be preserved');
    assert(assistantMessage.tool_calls, 'Tool calls should be preserved');
    assert.strictEqual(assistantMessage.tool_calls.length, 1);
    assert.strictEqual(assistantMessage.tool_calls[0].id, 'call_123');
  });

  test('should handle tool messages missing tool_call_id', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const messages = [
      {
        role: 'tool',
        content: 'Some result'
        // Missing tool_call_id
      }
    ];

    const transformedMessages = translator.transformMessagesForQwen(messages);
    
    // Should still preserve structure but log error
    const toolMessage = transformedMessages.find(m => m.role === 'tool');
    assert(toolMessage, 'Tool message should be preserved despite missing ID');
    assert.strictEqual(toolMessage.role, 'tool');
  });

  test('should validate and filter invalid tool calls in assistant messages', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const messages = [
      {
        role: 'assistant',
        content: 'Processing tools.',
        tool_calls: [
          {
            id: 'valid_call',
            type: 'function',
            function: {
              name: 'valid_function',
              arguments: '{"param": "value"}'
            }
          },
          {
            // Missing ID
            type: 'function',
            function: {
              name: 'invalid_function',
              arguments: '{"param": "value"}'
            }
          },
          {
            id: 'invalid_json_call',
            type: 'function',
            function: {
              name: 'another_function',
              arguments: 'invalid json'
            }
          }
        ]
      }
    ];

    const transformedMessages = translator.transformMessagesForQwen(messages);
    
    const assistantMessage = transformedMessages.find(m => m.role === 'assistant');
    assert(assistantMessage.tool_calls, 'Should have tool calls');
    assert.strictEqual(assistantMessage.tool_calls.length, 1, 'Should filter out invalid tool calls');
    assert.strictEqual(assistantMessage.tool_calls[0].id, 'valid_call');
  });

  test('should preserve tool calls in Qwen to OpenAI response translation', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const qwenResponse = {
      id: 'test-id',
      model: 'qwen3-coder-plus',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I will help you with that.',
            tool_calls: [
              {
                id: 'call_456',
                type: 'function',
                function: {
                  name: 'file_read',
                  arguments: '{"path": "/etc/config"}'
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    };

    const openAIResponse = translator.translateQwenToOpenAI(qwenResponse);
    
    assert.strictEqual(openAIResponse.choices.length, 1);
    const choice = openAIResponse.choices[0];
    assert(choice.message.tool_calls, 'Tool calls should be preserved');
    assert.strictEqual(choice.message.tool_calls.length, 1);
    assert.strictEqual(choice.message.tool_calls[0].id, 'call_456');
    assert.strictEqual(choice.message.tool_calls[0].function.name, 'file_read');
    assert.strictEqual(choice.finish_reason, 'tool_calls');
  });

  test('should handle invalid JSON in tool call arguments during response translation', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const qwenResponse = {
      id: 'test-id',
      model: 'qwen3-coder-plus',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Processing tools.',
            tool_calls: [
              {
                id: 'call_456',
                type: 'function',
                function: {
                  name: 'file_read',
                  arguments: 'invalid json here'
                }
              }
            ]
          }
        }
      ]
    };

    const openAIResponse = translator.translateQwenToOpenAI(qwenResponse);
    
    // Should preserve tool call but fix arguments to empty object
    const toolCall = openAIResponse.choices[0].message.tool_calls[0];
    assert.strictEqual(toolCall.function.arguments, '{}');
  });

  test('should handle multi-turn tool calling conversation', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const messages = [
      {
        role: 'user',
        content: 'Read the file and then write a summary'
      },
      {
        role: 'assistant',
        content: 'I will read the file first.',
        tool_calls: [
          {
            id: 'call_read',
            type: 'function',
            function: {
              name: 'file_read',
              arguments: '{"path": "/data.txt"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_read',
        content: 'File contents: Important data here.'
      },
      {
        role: 'assistant',
        content: 'Now I will write a summary.',
        tool_calls: [
          {
            id: 'call_write',
            type: 'function',
            function: {
              name: 'file_write',
              arguments: '{"path": "/summary.txt", "content": "Summary of data"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_write',
        content: 'File written successfully.'
      }
    ];

    const transformedMessages = translator.transformMessagesForQwen(messages);
    
    // All tool messages should be preserved
    const toolMessages = transformedMessages.filter(m => m.role === 'tool');
    assert.strictEqual(toolMessages.length, 2);
    
    // All assistant messages with tool calls should be preserved
    const assistantMessages = transformedMessages.filter(m => m.role === 'assistant' && m.tool_calls);
    assert.strictEqual(assistantMessages.length, 2);
    
    // Validate tool call sequence
    const result = translator.toolCallValidator.validateToolCallSequence(transformedMessages);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.toolCallCount, 2);
    assert.strictEqual(result.respondedToolCallCount, 2);
  });

  test('should handle empty tool calls array', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const messages = [
      {
        role: 'assistant',
        content: 'No tools needed.',
        tool_calls: []
      }
    ];

    const transformedMessages = translator.transformMessagesForQwen(messages);
    
    const assistantMessage = transformedMessages.find(m => m.role === 'assistant');
    assert.strictEqual(assistantMessage.tool_calls.length, 0);
  });

  test('should preserve system and user messages unchanged', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant.'
      },
      {
        role: 'user', 
        content: 'Hello there!'
      }
    ];

    const transformedMessages = translator.transformMessagesForQwen(messages);
    
    assert.strictEqual(transformedMessages.length, 2);
    assert.strictEqual(transformedMessages[0].role, 'system');
    assert.strictEqual(transformedMessages[0].content, 'You are a helpful assistant.');
    assert.strictEqual(transformedMessages[1].role, 'user');
    assert.strictEqual(transformedMessages[1].content, 'Hello there!');
  });
});

describe('RequestTranslator - Error Scenarios', () => {
  test('should handle malformed tool call response', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const qwenResponse = {
      id: 'test-id',
      choices: [
        {
          message: {
            role: 'assistant',
            tool_calls: [
              {
                // Missing required fields
                type: 'function'
              }
            ]
          }
        }
      ]
    };

    const openAIResponse = translator.translateQwenToOpenAI(qwenResponse);
    
    // Should handle gracefully and not include invalid tool calls
    assert(!openAIResponse.choices[0].message.tool_calls || 
           openAIResponse.choices[0].message.tool_calls.length === 0);
  });

  test('should validate request with tool definition but invalid messages', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    // Request with tool definition but malformed tool message
    const invalidRequest = {
      messages: [
        { role: 'tool' } // Missing required content and tool_call_id
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'test_function',
            description: 'Test function'
          }
        }
      ]
    };

    // Should not throw but should validate message structure
    assert.throws(() => translator.validateOpenAIRequest(invalidRequest));
  });
});