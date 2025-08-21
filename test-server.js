import express from 'express';
import { RequestTranslator } from './src/request-translator.js';
import { Logger } from './src/logger.js';
import { ErrorHandler } from './src/error-handler.js';

// Test server with mocked authentication for testing tool calling functionality
class TestQwenCodeBridge {
  constructor() {
    this.app = express();
    this.logger = new Logger('info', 'console');
    this.translator = new RequestTranslator(this.logger, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    this.errorHandler = new ErrorHandler(this.logger);
    
    // Mock token manager for testing
    this.mockTokenManager = {
      getValidAccessToken: () => Promise.resolve('mock-test-token'),
      getApiBaseUrl: () => 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    };
    
    this.translator.setTokenManager(this.mockTokenManager);
  }

  initialize() {
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type')
      });
      next();
    });
  }

  setupRoutes() {
    // Primary endpoint: OpenAI-compatible chat completions
    this.app.post('/v1/chat/completions', this.errorHandler.asyncHandler(async (req, res) => {
      await this.handleChatCompletions(req, res);
    }));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0-test'
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: {
          message: `Endpoint ${req.method} ${req.path} not found`,
          type: 'not_found',
          available_endpoints: [
            'POST /v1/chat/completions',
            'GET /health'
          ]
        }
      });
    });

    // Global error handler middleware
    this.app.use(this.errorHandler.errorMiddleware());
  }

  async handleChatCompletions(req, res) {
    try {
      // Validate request format
      this.translator.validateOpenAIRequest(req.body);
      
      // Mock getting valid token (always succeeds in test mode)
      const validToken = await this.mockTokenManager.getValidAccessToken();
      
      if (!validToken) {
        throw new Error('FATAL: Unable to obtain valid access token');
      }

      // For testing, create a mock response that includes tool calling if tools are present
      const qwenRequest = this.translator.translateOpenAIToQwen(req.body);
      
      // Mock Qwen API response based on request
      let mockQwenResponse;
      
      if (req.body.tools && req.body.tools.length > 0) {
        // Mock response with tool calls if tools are requested
        mockQwenResponse = {
          id: 'mock-test-id-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: qwenRequest.model || 'qwen3-coder-plus',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'I will help you with that task. Let me use the available tools.',
                tool_calls: [
                  {
                    id: 'call_' + Math.random().toString(36).substr(2, 9),
                    type: 'function',
                    function: {
                      name: req.body.tools[0].function.name,
                      arguments: JSON.stringify({ task: 'test_execution' })
                    }
                  }
                ]
              },
              finish_reason: 'tool_calls'
            }
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 30,
            total_tokens: 80
          }
        };
      } else {
        // Mock simple response without tools
        mockQwenResponse = {
          id: 'mock-test-id-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: qwenRequest.model || 'qwen3-coder-plus',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! I can help you with your request. How can I assist you today?'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 15,
            total_tokens: 35
          }
        };
      }

      // Handle streaming vs non-streaming responses
      if (req.body.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":" from"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":" test"}}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Transform response back to OpenAI-compatible format
        const openAIResponse = this.translator.translateQwenToOpenAI(mockQwenResponse);
        
        this.logger.info('Successfully processed mock chat completion request', {
          model: qwenRequest.model,
          messageCount: qwenRequest.messages.length,
          completionId: openAIResponse.id,
          hasTools: !!req.body.tools,
          toolCount: req.body.tools ? req.body.tools.length : 0
        });
        
        res.json(openAIResponse);
      }
      
    } catch (error) {
      this.logger.error('Error handling chat completions', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  start(port = 31337) {
    this.initialize();
    
    this.app.listen(port, 'localhost', () => {
      this.logger.info('Test Qwen Code Bridge server started', {
        host: 'localhost',
        port,
        version: '1.0.0-test',
        mode: 'testing'
      });
    });
  }
}

// Start the test server
const testBridge = new TestQwenCodeBridge();
testBridge.start();