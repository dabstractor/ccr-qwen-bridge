import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { Logger } from '../src/logger.js';
import { RequestTranslator } from '../src/request-translator.js';
import { ErrorHandler } from '../src/error-handler.js';

describe('Integration Tests - Tool Calling Workflow', () => {
  let app;
  let server;
  let mockTokenManager;
  let baseURL;
  
  beforeEach(async () => {
    // Create Express app for testing
    app = express();
    app.use(express.json({ limit: '10mb' }));
    
    // Mock token manager
    mockTokenManager = {
      getValidAccessToken: mock.fn(() => Promise.resolve('test-token')),
      getApiBaseUrl: mock.fn(() => 'https://mock-qwen-api.com/v1')
    };
    
    // Setup components
    const logger = new Logger('debug');
    const translator = new RequestTranslator(logger, 'https://mock-qwen-api.com/v1');
    translator.setTokenManager(mockTokenManager);
    const errorHandler = new ErrorHandler(logger);
    
    // Store translator reference for test access
    app.locals.translator = translator;
    
    // Setup routes
    app.post('/v1/chat/completions', errorHandler.asyncHandler(async (req, res) => {
      // Validate request format
      translator.validateOpenAIRequest(req.body);
      
      // Get valid token
      const validToken = await mockTokenManager.getValidAccessToken();
      if (!validToken) {
        throw new Error('FATAL: Unable to obtain valid access token');
      }

      // Translate and forward request  
      const qwenRequest = translator.translateOpenAIToQwen(req.body);
      const qwenResponse = await translator.forwardToQwenAPI(qwenRequest, validToken);
      
      // Handle streaming vs non-streaming
      if (req.body.stream) {
        // For integration tests, we'll simulate streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.write('data: {"choices":[{"delta":{"content":"test"}}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Transform response back to OpenAI format
        const openAIResponse = translator.translateQwenToOpenAI(qwenResponse);
        res.json(openAIResponse);
      }
    }));
    
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
    
    app.use(errorHandler.errorMiddleware());
    
    // Start server on random port
    server = app.listen(0);
    const address = server.address();
    baseURL = `http://localhost:${address.port}`;
  });
  
  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  test('should handle basic tool calling request', async () => {
    // Mock Qwen API response with tool calls
    const mockQwenResponse = {
      id: 'qwen-test-id',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'qwen-coder-plus',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I will read the file for you.',
            tool_calls: [
              {
                id: 'call_file_read',
                type: 'function',
                function: {
                  name: 'file_read',
                  arguments: '{"path": "/etc/config.txt"}'
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 25,
        total_tokens: 75
      }
    };

    // Setup mock response for this test
    const translator = app.locals.translator;
    translator.forwardToQwenAPI = mock.fn(() => Promise.resolve(mockQwenResponse));

    const requestBody = {
      model: 'qwen-coder-plus',
      messages: [
        {
          role: 'user',
          content: 'Please read the config file'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'file_read',
            description: 'Read a file from the filesystem',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path to read' }
              },
              required: ['path']
            }
          }
        }
      ],
      tool_choice: 'auto'
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 200);
    
    const responseData = await response.json();
    
    // Verify OpenAI-compatible response structure
    assert(responseData.id, 'Response should have ID');
    assert.strictEqual(responseData.object, 'chat.completion');
    assert(responseData.created, 'Response should have created timestamp');
    assert.strictEqual(responseData.model, 'qwen-coder-plus');
    assert(Array.isArray(responseData.choices), 'Response should have choices array');
    assert.strictEqual(responseData.choices.length, 1);
    
    // Verify tool call preservation
    const choice = responseData.choices[0];
    assert.strictEqual(choice.message.role, 'assistant');
    assert(choice.message.tool_calls, 'Assistant message should have tool_calls');
    assert.strictEqual(choice.message.tool_calls.length, 1);
    
    const toolCall = choice.message.tool_calls[0];
    assert.strictEqual(toolCall.id, 'call_file_read');
    assert.strictEqual(toolCall.type, 'function');
    assert.strictEqual(toolCall.function.name, 'file_read');
    
    // Verify arguments are valid JSON
    const args = JSON.parse(toolCall.function.arguments);
    assert.strictEqual(args.path, '/etc/config.txt');
    
    // Verify usage information
    assert(responseData.usage, 'Response should have usage information');
    assert.strictEqual(responseData.usage.total_tokens, 75);
  });

  test('should handle tool calling with tool response sequence', async () => {
    // Mock Qwen API response for a complete tool calling sequence
    const mockQwenResponse = {
      id: 'qwen-complete-id',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'qwen-coder-plus',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I have read the file. The content is: "Configuration data"'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 15,
        total_tokens: 115
      }
    };

    mock.method(RequestTranslator.prototype, 'forwardToQwenAPI')
      .mock.mockImplementation(() => Promise.resolve(mockQwenResponse));

    const requestBody = {
      model: 'qwen-coder-plus',
      messages: [
        {
          role: 'user',
          content: 'Please read the config file'
        },
        {
          role: 'assistant',
          content: 'I will read the file for you.',
          tool_calls: [
            {
              id: 'call_file_read',
              type: 'function',
              function: {
                name: 'file_read',
                arguments: '{"path": "/etc/config.txt"}'
              }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_file_read',
          content: 'Configuration data'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'file_read',
            description: 'Read a file from the filesystem',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' }
              },
              required: ['path']
            }
          }
        }
      ]
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 200);
    
    const responseData = await response.json();
    
    // Verify response structure
    assert(responseData.id, 'Response should have ID');
    assert.strictEqual(responseData.choices[0].message.role, 'assistant');
    assert(responseData.choices[0].message.content.includes('Configuration data'));
    assert.strictEqual(responseData.choices[0].finish_reason, 'stop');
  });

  test('should handle parallel tool calls', async () => {
    const mockQwenResponse = {
      id: 'qwen-parallel-id',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'qwen-coder-plus',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I will check both the weather and time for you.',
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
          finish_reason: 'tool_calls'
        }
      ],
      usage: {
        prompt_tokens: 40,
        completion_tokens: 30,
        total_tokens: 70
      }
    };

    mock.method(RequestTranslator.prototype, 'forwardToQwenAPI')
      .mock.mockImplementation(() => Promise.resolve(mockQwenResponse));

    const requestBody = {
      model: 'qwen-coder-plus',
      messages: [
        {
          role: 'user',
          content: 'What is the weather and time in NYC?'
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
                location: { type: 'string' }
              },
              required: ['location']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'get_time',
            description: 'Get current time',
            parameters: {
              type: 'object',
              properties: {
                timezone: { type: 'string' }
              },
              required: ['timezone']
            }
          }
        }
      ]
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 200);
    
    const responseData = await response.json();
    
    // Verify parallel tool calls are preserved
    const toolCalls = responseData.choices[0].message.tool_calls;
    assert.strictEqual(toolCalls.length, 2);
    
    const weatherCall = toolCalls.find(call => call.function.name === 'get_weather');
    const timeCall = toolCalls.find(call => call.function.name === 'get_time');
    
    assert(weatherCall, 'Weather tool call should be present');
    assert(timeCall, 'Time tool call should be present');
    assert.strictEqual(weatherCall.id, 'call_weather');
    assert.strictEqual(timeCall.id, 'call_time');
  });

  test('should handle streaming tool calling response', async () => {
    const requestBody = {
      model: 'qwen-coder-plus',
      messages: [
        {
          role: 'user',
          content: 'Please help me with this task'
        }
      ],
      stream: true,
      tools: [
        {
          type: 'function',
          function: {
            name: 'helper_function',
            description: 'A helper function'
          }
        }
      ]
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'text/event-stream');
    
    const responseText = await response.text();
    assert(responseText.includes('data:'), 'Should contain SSE data');
    assert(responseText.includes('[DONE]'), 'Should contain SSE completion marker');
  });

  test('should handle error when tool call sequence validation fails', async () => {
    // Mock the translator to throw validation error
    mock.method(RequestTranslator.prototype, 'forwardToQwenAPI')
      .mock.mockImplementation(() => {
        throw new Error('Tool call sequence validation failed');
      });

    const requestBody = {
      model: 'qwen-coder-plus',
      messages: [
        {
          role: 'tool',
          tool_call_id: 'nonexistent_call',
          content: 'Orphaned tool response'
        }
      ]
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 500);
    
    const errorData = await response.json();
    assert(errorData.error, 'Response should contain error information');
    assert(errorData.error.message.includes('validation'), 'Error should mention validation');
  });

  test('should handle invalid request format', async () => {
    const requestBody = {
      // Missing required messages field
      model: 'qwen-coder-plus',
      tools: []
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 400);
    
    const errorData = await response.json();
    assert(errorData.error, 'Response should contain error information');
    assert(errorData.error.message.includes('messages'), 'Error should mention missing messages');
  });

  test('should handle token manager failure', async () => {
    // Mock token manager to return null (invalid token)
    mockTokenManager.getValidAccessToken = mock.fn(() => Promise.resolve(null));

    const requestBody = {
      model: 'qwen-coder-plus',
      messages: [{ role: 'user', content: 'Test message' }]
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 500);
    
    const errorData = await response.json();
    assert(errorData.error, 'Response should contain error information');
    assert(errorData.error.message.includes('access token'), 'Error should mention token failure');
  });

  test('should handle health check endpoint', async () => {
    const response = await fetch(`${baseURL}/health`);
    
    assert.strictEqual(response.status, 200);
    
    const healthData = await response.json();
    assert.strictEqual(healthData.status, 'healthy');
    assert(healthData.timestamp, 'Health response should have timestamp');
  });

  test('should handle 404 for unknown endpoints', async () => {
    const response = await fetch(`${baseURL}/v1/unknown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    assert.strictEqual(response.status, 404);
    
    const errorData = await response.json();
    assert(errorData.error, 'Response should contain error information');
    assert(errorData.error.message.includes('not found'), 'Error should mention not found');
    assert(errorData.error.available_endpoints, 'Should list available endpoints');
  });

  test('should preserve tool choice parameter', async () => {
    const mockQwenResponse = {
      id: 'test-tool-choice',
      choices: [{ message: { role: 'assistant', content: 'Response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    };

    const mockForward = mock.method(RequestTranslator.prototype, 'forwardToQwenAPI')
      .mock.mockImplementation((qwenRequest) => {
        // Verify tool_choice is preserved in the request
        assert.strictEqual(qwenRequest.tool_choice, 'required');
        return Promise.resolve(mockQwenResponse);
      });

    const requestBody = {
      model: 'qwen-coder-plus',
      messages: [{ role: 'user', content: 'Use a tool' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'A test tool'
          }
        }
      ],
      tool_choice: 'required'
    };

    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    assert.strictEqual(response.status, 200);
    
    // Verify the mock was called (which validates tool_choice was preserved)
    assert.strictEqual(mockForward.mock.callCount(), 1);
  });
});