import express from 'express';
import { OAuthTokenManager } from './oauth-token-manager.js';
import { QwenTranslator } from './translators/qwen-translator.js';
import { Logger } from './logger.js';
import { ConfigManager } from './config-manager.js';
import { ErrorHandler } from './error-handler.js';

class ClaudeBridge {
  constructor() {
    this.app = express();
    // Initialize with basic logger first, will be reconfigured after config load
    this.logger = new Logger();
    this.configManager = new ConfigManager(this.logger);
    this.tokenManager = null;
    this.translator = null;
  }

  async initialize() {
    try {
      // Load configuration first
      await this.configManager.initialize();
      
      // Reconfigure logger with proper settings
      this.logger = new Logger(
        this.configManager.getLogLevel(),
        this.configManager.getLogFormat()
      );
      
      // Initialize error handler
      this.errorHandler = new ErrorHandler(this.logger);
      
      // Get Qwen provider configuration
      const qwenConfig = this.configManager.getProviderConfig('qwen');
      if (!qwenConfig || !qwenConfig.enabled) {
        throw new Error('Qwen provider is not enabled or configured');
      }

      // Initialize other components with configuration
      this.tokenManager = new OAuthTokenManager(
        this.configManager.expandHomePath(qwenConfig.credentialsPath),
        this.logger
      );
      this.translator = new QwenTranslator(
        this.logger,
        qwenConfig.apiBaseUrl,
        qwenConfig.requestTimeout
      );
      
      // Connect translator to token manager for API URL resolution
      this.translator.setTokenManager(this.tokenManager);
      
      // Setup Express middleware and routes
      this.setupMiddleware();
      this.setupRoutes();
      
      this.logger.info('Claude Bridge initialized successfully', {
        config: this.configManager.dumpConfig()
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize Claude Bridge', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
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

    // Health check endpoint (Phase 2)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
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
    // Validate request format
    this.translator.validateOpenAIRequest(req.body);
    
    // F-2.4: Check token expiration before each request
    const validToken = await this.tokenManager.getValidAccessToken();
    
    if (!validToken) {
      const error = new Error('FATAL: Unable to obtain valid access token');
      throw error;
    }

    // F-1.3: Forward request to Qwen-Code API with format translation
    const qwenRequest = this.translator.translateOpenAIToProvider(req.body);
    const qwenResponse = await this.translator.forwardToProviderAPI(qwenRequest, validToken);
    
    // Handle streaming vs non-streaming responses
    if (req.body.stream) {
      // For streaming responses, we need to process each chunk to translate tool calls
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Use the correct way to pipe fetch response to Express response
      const reader = qwenResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Process complete lines from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.trim()) {
              // Process each SSE chunk and translate tool calls if needed
              const processedLine = this.translator.processStreamingChunk(line);
              res.write(processedLine + '\n');
            } else {
              res.write(line + '\n');
            }
          }
        }
        
        // Process any remaining buffer content
        if (buffer.trim()) {
          const processedLine = this.translator.processStreamingChunk(buffer);
          res.write(processedLine);
        }
        
        res.end();
      } catch (error) {
        this.logger.error('Error streaming response', { error: error.message });
        res.end();
      }
      
      this.logger.info('Started streaming chat completion response', {
        model: qwenRequest.model,
        messageCount: qwenRequest.messages.length
      });
    } else {
      // F-1.4: Transform response back to OpenAI-compatible format
      const openAIResponse = this.translator.translateProviderToOpenAI(qwenResponse);
      
      this.logger.info('Successfully proxied chat completion request', {
        model: qwenRequest.model,
        messageCount: qwenRequest.messages.length,
        completionId: openAIResponse.id
      });
      
      res.json(openAIResponse);
    }
  }

  async start() {
    try {
      // Initialize all components
      await this.initialize();
      
      // F-2.2: Load credentials on startup
      await this.tokenManager.initialize();
      
      // Start the HTTP server
      const host = this.configManager.getHost();
      const port = this.configManager.getPort();
      
      this.app.listen(port, host, () => {
        this.logger.info('Claude Bridge server started', {
          host,
          port,
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development'
        });
      });
      
    } catch (error) {
      this.logger.error('Failed to start server', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }
}

// Start the server
const bridge = new ClaudeBridge();
bridge.start().catch(error => {
  console.error('Fatal error starting Claude Bridge:', error);
  process.exit(1);
});