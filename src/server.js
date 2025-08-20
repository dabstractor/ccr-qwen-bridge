import express from 'express';
import { Logger } from './logger.js';
import { ConfigManager } from './config-manager.js';
import { ErrorHandler } from './error-handler.js';
import { ProviderFactory } from './providers/provider-factory.js';

class ClaudeBridge {
  constructor() {
    this.app = express();
    // Initialize with basic logger first, will be reconfigured after config load
    this.logger = new Logger();
    this.configManager = new ConfigManager(this.logger);
    this.providers = new Map(); // Map of initialized providers
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
      
      // Initialize all enabled providers
      await this.initializeProviders();
      
      this.logger.info('Initialized providers', {
        providerList: Array.from(this.providers.keys()),
        providerConfigs: this.configManager.getAllProviderConfigs()
      });
      
      // Setup Express middleware and routes
      this.setupMiddleware();
      this.setupRoutes();
      
      this.logger.info('Claude Bridge initialized successfully', {
        config: this.configManager.dumpConfig(),
        providers: Array.from(this.providers.keys())
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize Claude Bridge', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async initializeProviders() {
    const providerConfigs = this.configManager.getAllProviderConfigs();
    const enabledProviders = this.configManager.getEnabledProviders();
    
    this.logger.info('Initializing providers', {
      enabledProviders,
      totalProviders: Object.keys(providerConfigs).length
    });
    
    // Initialize each enabled provider
    for (const providerName of enabledProviders) {
      try {
        const config = providerConfigs[providerName];
        const provider = ProviderFactory.createProvider(providerName, config, this.logger);
        await provider.initialize();
        this.providers.set(providerName, provider);
        
        this.logger.info(`${providerName} provider initialized successfully`);
      } catch (error) {
        this.logger.error(`Failed to initialize ${providerName} provider`, {
          error: error.message
        });
        
        // Check if we should continue with other providers or fail completely
        // For now, we'll skip failed providers but log the error
        this.logger.warn(`Skipping ${providerName} provider due to initialization failure`);
        continue;
      }
    }
    
    if (this.providers.size === 0) {
      throw new Error('No providers are enabled or configured');
    }
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    
    // Basic request logging
    this.app.use((req, res, next) => {
      if (req.path !== '/health') {
        this.logger.debug(`${req.method} ${req.path}`);
      }
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
        version: '1.0.0',
        providers: Array.from(this.providers.keys())
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

  getProviderFromModel(modelName) {
    // Extract provider from model name (e.g., "gemini/gemini-pro" → "gemini")
    if (!modelName || typeof modelName !== 'string') {
      return null;
    }
    
    // Split on '/' and take the first part as provider name
    const parts = modelName.split('/');
    
    if (parts.length < 2) {
      // If no prefix, default to qwen for backward compatibility
      return this.providers.has('qwen') ? 'qwen' : null;
    }
    
    const providerName = parts[0].toLowerCase();
    return this.providers.has(providerName) ? providerName : null;
  }

  async handleChatCompletions(req, res) {
    // Validate request format
    if (!req.body || !req.body.model) {
      throw new Error('Invalid request: model is required');
    }
    
    // Determine provider based on model name prefix
    const providerName = this.getProviderFromModel(req.body.model);
    
    if (!providerName) {
      throw new Error(`No provider available for model: ${req.body.model}`);
    }
    
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not initialized: ${providerName}`);
    }
    
    // Validate request format using provider's translator
    provider.translator.validateOpenAIRequest(req.body);
    
    // Get valid access token from the provider
    const validToken = await provider.getValidAccessToken();
    if (!validToken) {
      const error = new Error(`FATAL: Unable to obtain valid access token for ${providerName}`);
      throw error;
    }

    // Translate request to provider format
    const providerRequest = provider.translateRequest(req.body);
    const providerResponse = await provider.forwardRequest(providerRequest, validToken);
    
    // Handle streaming vs non-streaming responses
    if (req.body.stream) {
      // For streaming responses, we need to process each chunk to translate tool calls
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      if (providerName === 'qwen') {
        // Qwen uses fetch response streaming
        const reader = providerResponse.body.getReader();
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
                const processedLine = provider.translator.processStreamingChunk(line);
                res.write(processedLine + '\n');
              } else {
                res.write(line + '\n');
              }
            }
          }
          
          // Process any remaining buffer content
          if (buffer.trim()) {
            const processedLine = provider.translator.processStreamingChunk(buffer);
            res.write(processedLine);
          }
          
          res.end();
        } catch (error) {
          this.logger.error('Error streaming response', { 
            provider: providerName,
            error: error.message 
          });
          res.end();
        }
      } else if (providerName === 'gemini') {
        // Gemini uses direct response streaming with proper buffering
        const reader = providerResponse.body.getReader();
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
                // Process each SSE chunk and translate to OpenAI format
                const processedLine = provider.translator.processStreamingChunk(line);
                res.write(processedLine + '\n');
              } else {
                res.write(line + '\n');
              }
            }
          }
          
          // Process any remaining buffer content
          if (buffer.trim()) {
            const processedLine = provider.translator.processStreamingChunk(buffer);
            res.write(processedLine);
          }
          
          res.end();
        } catch (error) {
          this.logger.error('Error streaming response', { 
            provider: providerName,
            error: error.message 
          });
          res.end();
        }
      }
      
      // Started streaming response
    } else {
      // Transform response back to OpenAI-compatible format
      const openAIResponse = provider.translateResponse(providerResponse);
      
      this.logger.info('Successfully proxied chat completion request', {
        provider: providerName,
        model: providerRequest.model,
        messageCount: req.body.messages.length,
        completionId: openAIResponse.id
      });
      
      res.json(openAIResponse);
    }
  }

  async start() {
    try {
      // Initialize all components
      await this.initialize();
      
      // Start the HTTP server
      const host = this.configManager.getHost();
      const port = this.configManager.getPort();
      
      this.app.listen(port, host, () => {
        this.logger.info('Claude Bridge server started', {
          host,
          port,
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          providers: Array.from(this.providers.keys())
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