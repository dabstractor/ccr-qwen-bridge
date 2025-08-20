import { ToolCallValidator } from '../tool-call-validator.js';
import { BaseTranslator } from './base-translator.js';
import { 
  shouldChunkRequest,
  createChunksFromMessages,
  aggregateChunkResponses,
  validateChunkingConfig,
  DEFAULT_CHUNKING_CONFIG
} from '../utils/chunking-utils.js';

/**
 * GeminiTranslator - Gemini-specific request translator
 * Translates between OpenAI-compatible format and Google Gemini API format
 */
export class GeminiTranslator extends BaseTranslator {
  constructor(logger, apiBaseUrl = null, requestTimeout = 30000, chunkingConfig = null) {
    super(logger, apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta', requestTimeout);
    this.toolCallValidator = new ToolCallValidator(logger);
    
    // Initialize chunking configuration
    this.chunkingConfig = chunkingConfig || { ...DEFAULT_CHUNKING_CONFIG };
    
    // Validate chunking configuration
    const validation = validateChunkingConfig(this.chunkingConfig);
    if (!validation.valid) {
      this.logger.warn('Invalid chunking configuration, using defaults', {
        errors: validation.errors,
        warnings: validation.warnings
      });
      this.chunkingConfig = { ...DEFAULT_CHUNKING_CONFIG };
    } else if (validation.warnings.length > 0) {
      this.logger.warn('Chunking configuration warnings', {
        warnings: validation.warnings
      });
    }
    
    this.logger.debug('Initialized Gemini translator with chunking configuration', {
      chunkingEnabled: this.chunkingConfig.enabled,
      maxSizeBytes: this.chunkingConfig.maxSizeBytes,
      maxLines: this.chunkingConfig.maxLines,
      strategy: this.chunkingConfig.strategy
    });
  }
  
  translateOpenAIToProvider(openAIRequest) {
    // Translate OpenAI-compatible requests to Gemini API format
    // Gemini API has a different structure than OpenAI
    
    // Extract model name (remove gemini/ prefix if present)
    let modelName = openAIRequest.model || 'gemini-pro';
    if (modelName.startsWith('gemini/')) {
      modelName = modelName.substring(7); // Remove 'gemini/' prefix
    }
    
    const geminiRequest = {
      contents: this.transformMessagesForGemini(openAIRequest.messages || []),
      generationConfig: {
        temperature: openAIRequest.temperature,
        maxOutputTokens: openAIRequest.max_tokens,
        topP: openAIRequest.top_p,
        topK: openAIRequest.top_k, // Gemini-specific parameter
        stopSequences: openAIRequest.stop
      }
    };
    
    // IMPORTANT: Never include stream field in Gemini request - it's not supported
    // Stream is handled by using different endpoint, not by request field
    
    // Handle streaming by using different endpoint, not by adding stream field
    const stream = openAIRequest.stream || false;
    
    // Handle tools/functions if present
    if (openAIRequest.tools || openAIRequest.functions) {
      geminiRequest.tools = this.transformToolsForGemini(openAIRequest.tools || openAIRequest.functions);
    }
    
    // Remove undefined fields to keep request clean
    this.cleanUndefinedFields(geminiRequest);
    this.cleanUndefinedFields(geminiRequest.generationConfig);
    
    this.logger.debug('Translated OpenAI request to Gemini format', {
      model: modelName,
      messageCount: geminiRequest.contents ? geminiRequest.contents.length : 0,
      stream: stream,
      hasTools: !!geminiRequest.tools,
      toolCount: geminiRequest.tools ? geminiRequest.tools.length : 0
    });
    
    return {
      model: modelName,
      request: geminiRequest,
      stream: stream
    };
  }
  
  translateProviderToOpenAI(geminiResponse) {
    // Transform Gemini responses to OpenAI-compatible format
    
    const openAIResponse = {
      id: geminiResponse.id || this.generateId(),
      object: 'chat.completion',
      created: geminiResponse.created || Math.floor(Date.now() / 1000),
      model: geminiResponse.model || 'gemini-pro',
      choices: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
    
    // Process Gemini response candidates
    if (geminiResponse.candidates && Array.isArray(geminiResponse.candidates)) {
      openAIResponse.choices = geminiResponse.candidates.map((candidate, index) => {
        const choice = {
          index: candidate.index !== undefined ? candidate.index : index,
          finish_reason: this.mapFinishReason(candidate.finishReason) || 'stop'
        };
        
        // Process content
        if (candidate.content) {
          choice.message = this.transformGeminiContentToOpenAI(candidate.content);
        } else {
          choice.message = {
            role: 'assistant',
            content: null
          };
        }
        
        return choice;
      });
    }
    
    // Process usage information if available
    if (geminiResponse.usageMetadata) {
      openAIResponse.usage = {
        prompt_tokens: geminiResponse.usageMetadata.promptTokenCount || 0,
        completion_tokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
        total_tokens: geminiResponse.usageMetadata.totalTokenCount || 0
      };
    }
    
    this.logger.debug('Translated Gemini response to OpenAI format', {
      id: openAIResponse.id,
      model: openAIResponse.model,
      choiceCount: openAIResponse.choices.length,
      hasUsage: !!openAIResponse.usage
    });
    
    return openAIResponse;
  }
  
  async forwardToProviderAPI(providerRequest, accessToken) {
    const { model, request, stream } = providerRequest;
    
    // Debug chunking decision
    const analysis = this.analyzeRequestSize(request);
    const toolCount = (request.tools && Array.isArray(request.tools)) ? request.tools.length : 0;
    const hasManyTools = toolCount > 50;
    const effectiveMaxLines = hasManyTools ? Math.floor(this.chunkingConfig.maxLines * 0.3) : this.chunkingConfig.maxLines;
    const effectiveMaxTokens = hasManyTools ? Math.floor(this.chunkingConfig.maxTokens * 0.5) : this.chunkingConfig.maxTokens;
    
    this.logger.debug('Chunking analysis', {
      model: model,
      analysis: analysis,
      toolCount: toolCount,
      hasManyTools: hasManyTools,
      chunkingEnabled: this.chunkingConfig.enabled,
      limits: {
        maxSizeBytes: this.chunkingConfig.maxSizeBytes,
        maxLines: this.chunkingConfig.maxLines,
        maxTokens: this.chunkingConfig.maxTokens,
        effectiveMaxLines: effectiveMaxLines,
        effectiveMaxTokens: effectiveMaxTokens
      },
      exceedsLimits: {
        size: analysis.sizeBytes > this.chunkingConfig.maxSizeBytes,
        lines: analysis.lineCount > effectiveMaxLines,
        tokens: analysis.tokenEstimate > effectiveMaxTokens,
        tools: hasManyTools
      }
    });
    
    // Check if chunking is needed and enabled
    if (this.chunkingConfig.enabled && shouldChunkRequest(request, this.chunkingConfig)) {
      this.logger.info('Large request detected, using chunking strategy', {
        model: model,
        strategy: this.chunkingConfig.strategy,
        analysis: analysis,
        limits: {
          maxSizeBytes: this.chunkingConfig.maxSizeBytes,
          maxLines: this.chunkingConfig.maxLines,
          maxTokens: this.chunkingConfig.maxTokens
        }
      });
      
      return await this.processChunkedRequest(model, request, stream, accessToken);
    }
    
    // Process single request without chunking
    return await this.processSingleRequest(model, request, stream, accessToken);
  }
  
  async processSingleRequest(model, request, stream, accessToken) {
    const maxRetries = 6; // Fibonacci sequence: 1,2,3,5,8,13 seconds
    
    // Generate Fibonacci sequence for delays: 1,2,3,5,8,13 seconds
    const fibonacciDelays = [1000, 2000, 3000, 5000, 8000, 13000];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Use standard endpoint for both streaming and non-streaming
        // Streaming is handled via alt=sse parameter, not different endpoints
        const endpoint = 'generateContent';
        
        // For public Gemini API, use API key instead of OAuth token
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('GEMINI_API_KEY environment variable is required for Gemini API access');
        }
        
        // Construct URL with appropriate parameters
        let apiUrl = `${this.apiBaseUrl}/models/${model}:${endpoint}?key=${apiKey}`;
        if (stream) {
          // Use alt=sse parameter for streaming, as per gemini-cli implementation
          apiUrl += '&alt=sse';
        }
        
        // CRITICAL: Remove any 'stream' field that might have leaked into the request
        if ('stream' in request) {
          this.logger.warn('Removing stream field from Gemini request - not supported by API');
          delete request.stream;
        }
        
        // Log request details for debugging (without sensitive data)
        const requestSize = this.analyzeRequestSize(request);
        this.logger.debug('Sending request to Gemini API', {
          model: model,
          endpoint: endpoint,
          stream: stream,
          contentLength: requestSize.contentLength,
          tokenEstimate: requestSize.tokenEstimate,
          messageCount: requestSize.messageCount,
          hasTools: !!request.tools,
          attempt: attempt + 1
        });
        
        
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
        
        const startTime = Date.now();
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'GeminiCLI/1.0.0 (linux; x64) node.js'
          },
          body: JSON.stringify(request),
          signal: controller.signal
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        clearTimeout(timeoutId);
        
        this.logger.debug('Gemini API response received', {
          status: response.status,
          responseTime: `${responseTime}ms`,
          attempt: attempt + 1
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          this.logger.error('Gemini API request failed', {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
            responseTime: `${responseTime}ms`,
            attempt: attempt + 1,
            maxRetries: maxRetries
          });
          
          const error = new Error(errorData.error?.message || `API request failed: ${response.status} ${response.statusText}`);
          error.statusCode = response.status;
          throw error;
        }
        
        // Handle streaming vs non-streaming responses
        if (stream) {
          // For streaming responses, return the response directly
          this.logger.debug('Streaming response initiated successfully', {
            model: model,
            responseTime: `${responseTime}ms`,
            attempt: attempt + 1
          });
          return response;
        } else {
          const responseData = await response.json();
          
          this.logger.debug('Received successful response from Gemini API', {
            id: responseData.id,
            model: model,
            usage: responseData.usageMetadata,
            responseTime: `${responseTime}ms`,
            attempt: attempt + 1
          });
          
          return {
            ...responseData,
            model: model
          };
        }
        
      } catch (error) {
        const isRetryable = (error.name === 'TypeError' && error.message.includes('fetch')) ||
                           (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('aborted')) ||
                           (error.statusCode >= 500 && error.statusCode !== 503); // 503 is handled specially
        
        // Special handling for timeout/abort errors that might be due to large requests
        const isTimeoutError = (error.name === 'AbortError' || 
                               error.message.includes('timeout') || 
                               error.message.includes('aborted') ||
                               (error.message.includes('operation was aborted')));
        
        this.logger.error('Error forwarding request to Gemini API', {
          error: error.message,
          errorName: error.name,
          statusCode: error.statusCode,
          attempt: attempt + 1,
          maxRetries: maxRetries,
          isRetryable: isRetryable,
          isTimeoutError: isTimeoutError
        });
        
        // If this is the last attempt or the error is not retryable, throw it
        if (attempt === maxRetries || !isRetryable) {
          // Handle specific error cases
          if (error.name === 'TypeError' && error.message.includes('fetch')) {
            const networkError = new Error('Network error: Unable to connect to Gemini API. Please check your internet connection.');
            networkError.statusCode = 503;
            throw networkError;
          }
          
          // Handle timeout errors with more specific messaging
          if (isTimeoutError) {
            const timeoutError = new Error('Request timeout: Gemini API did not respond in time. This is likely due to a large request that exceeds processing limits. The gemini-cli tool handles large files by chunking them into smaller pieces. Please reduce the size of your request or split it into smaller chunks.');
            timeoutError.statusCode = 504;
            throw timeoutError;
          }
          
          // Handle timeout errors
          if (error.name === 'AbortError' || error.message.includes('timeout')) {
            const timeoutError = new Error('Request timeout: Gemini API did not respond in time.');
            timeoutError.statusCode = 504;
            throw timeoutError;
          }
          
          // Re-throw with status code preserved
          if (!error.statusCode) {
            error.statusCode = 500;
          }
          throw error;
        }
        
        // Calculate Fibonacci backoff delay with jitter to avoid thundering herd
        const delay = fibonacciDelays[attempt] + Math.random() * 1000;
        this.logger.info(`Retrying Gemini API request in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  async processChunkedRequest(model, request, stream, accessToken) {
    try {
      // Create chunks from the request messages
      const chunks = createChunksFromMessages(request.contents, this.chunkingConfig);
      
      this.logger.info('Processing chunked request', {
        model: model,
        totalChunks: chunks.length,
        strategy: this.chunkingConfig.strategy,
        batchSize: this.chunkingConfig.batchSize
      });
      
      const chunkResponses = [];
      
      // Process chunks sequentially to maintain context (batchSize = 1 for now)
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        this.logger.debug('Processing chunk', {
          chunkIndex: i + 1,
          totalChunks: chunks.length,
          chunkId: chunk.id,
          chunkSize: chunk.metadata.sizeBytes,
          chunkLines: chunk.metadata.lineCount
        });
        
        // Create a new request for this chunk
        const chunkRequest = {
          ...request,
          contents: chunk.content
        };
        
        try {
          // Process single chunk without recursion
          const chunkResponse = await this.processSingleRequest(model, chunkRequest, stream, accessToken);
          chunkResponses.push(chunkResponse);
          
          this.logger.debug('Chunk processed successfully', {
            chunkIndex: i + 1,
            chunkId: chunk.id,
            hasResponse: !!chunkResponse
          });
          
        } catch (error) {
          this.logger.error('Failed to process chunk', {
            chunkIndex: i + 1,
            chunkId: chunk.id,
            error: error.message
          });
          
          // For now, we'll continue with other chunks
          // In future, we might want to implement different error handling strategies
          throw new Error(`Chunked request failed at chunk ${i + 1}/${chunks.length}: ${error.message}`);
        }
      }
      
      // Aggregate responses from all chunks
      const aggregatedResponse = aggregateChunkResponses(chunkResponses, model);
      
      this.logger.info('Chunked request completed successfully', {
        model: model,
        totalChunks: chunks.length,
        successfulChunks: chunkResponses.length,
        aggregatedResponseId: aggregatedResponse.id
      });
      
      return aggregatedResponse;
      
    } catch (error) {
      this.logger.error('Chunked request processing failed', {
        model: model,
        error: error.message
      });
      throw error;
    }
  }
  
  generateId() {
    // Generate OpenAI-style completion ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `chatcmpl-${timestamp}${random}`;
  }
  
  // Process streaming chunks to translate tool calls in SSE format
  processStreamingChunk(chunk) {
    try {
      // Handle Server-Sent Events format for Gemini
      if (chunk.startsWith('data: ')) {
        const jsonPart = chunk.substring(6).trim();
        
        // Handle special SSE messages
        if (jsonPart === '[DONE]') {
          return chunk;
        }
        
        if (!jsonPart || jsonPart === '') {
          return chunk;
        }
        
        // Parse the JSON data
        const data = JSON.parse(jsonPart);
        
        // Process the streaming response chunk
        const translatedData = this.translateStreamingGeminiToOpenAI(data);
        
        return 'data: ' + JSON.stringify(translatedData);
      }
      
      // For non-data lines (like event types), return as-is
      return chunk;
      
    } catch (error) {
      // More specific handling for JSON parsing errors
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        this.logger.warn('Failed to parse streaming chunk JSON, passing through unchanged', {
          error: error.message,
          chunk: chunk.substring(0, 200) + (chunk.length > 200 ? '...' : '')
        });
        // For JSON parsing errors, we might want to skip the chunk rather than pass it through
        // This prevents corrupted data from being sent to the client
        return ''; // Return empty string to skip the chunk
      }
      
      this.logger.warn('Failed to process streaming chunk, passing through unchanged', {
        error: error.message,
        chunk: chunk.substring(0, 200)
      });
      return chunk;
    }
  }
  
  // Translate streaming response chunks from Gemini to OpenAI format
  translateStreamingGeminiToOpenAI(geminiChunk) {
    // Handle streaming chunk translation similar to non-streaming
    const openAIChunk = {
      id: geminiChunk.id || this.generateId(),
      object: 'chat.completion.chunk',
      created: geminiChunk.created || Math.floor(Date.now() / 1000),
      model: geminiChunk.model || 'gemini-pro',
      choices: []
    };
    
    // Process Gemini response candidates for streaming
    if (geminiChunk.candidates && Array.isArray(geminiChunk.candidates)) {
      openAIChunk.choices = geminiChunk.candidates.map((candidate, index) => {
        const choice = {
          index: candidate.index !== undefined ? candidate.index : index,
          finish_reason: this.mapFinishReason(candidate.finishReason) || null
        };
        
        // Process content delta
        if (candidate.content) {
          choice.delta = this.transformGeminiContentToOpenAI(candidate.content);
        } else {
          choice.delta = {
            role: 'assistant',
            content: null
          };
        }
        
        return choice;
      });
    }
    
    return openAIChunk;
  }
  
  // Transform messages to be compatible with Gemini API
  transformMessagesForGemini(messages) {
    // Validate tool call sequence before transformation
    const validationResult = this.toolCallValidator.validateToolCallSequence(messages);
    
    if (!validationResult.valid) {
      this.logger.warn('Tool call sequence validation failed, but proceeding with transformation', {
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
    }
    
    // Check for extremely large message sets that would cause timeouts
    // This matches the gemini-cli approach of rejecting overly large inputs
    if (messages && messages.length > 2000) { // 2000 messages ~ similar to 2000 lines
      this.logger.error('Too many messages in request - would cause timeout like gemini-cli', {
        messageCount: messages.length,
        maxAllowed: 2000
      });
      throw new Error(`Request too large: ${messages.length} messages exceeds the limit of 2000 messages. The gemini-cli tool handles large inputs by chunking them. Please reduce the number of messages or split your request into smaller chunks.`);
    }
    
    // Transform OpenAI messages to Gemini format
    const geminiContents = [];
    
    for (const message of messages) {
      const geminiContent = {
        role: this.mapRoleToGemini(message.role),
        parts: []
      };
      
      // Handle different message types
      if (message.role === 'tool') {
        // Tool response messages - Gemini expects functionResponse format
        geminiContent.parts.push({
          functionResponse: {
            name: message.tool_call_id || 'unknown_tool',
            response: {
              content: message.content || ''
            }
          }
        });
      } else if (message.role === 'assistant' && message.tool_calls) {
        // Assistant messages with tool calls
        // Add content first if present
        if (message.content) {
          geminiContent.parts.push({
            text: message.content
          });
        }
        
        // Convert tool calls to Gemini function calls
        for (const toolCall of message.tool_calls) {
          geminiContent.parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
            }
          });
        }
      } else {
        // Regular text messages (system, user, assistant)
        if (message.content) {
          // Handle both string content and array content (from Claude Code Router)
          const textContent = this.extractTextFromContent(message.content);
          if (textContent) {
            geminiContent.parts.push({
              text: textContent
            });
          }
        }
      }
      
      if (geminiContent.parts.length > 0) {
        geminiContents.push(geminiContent);
      }
    }
    
    return geminiContents;
  }
  
  // Transform tools to be compatible with Gemini API
  transformToolsForGemini(tools) {
    if (!tools || !Array.isArray(tools)) {
      return undefined;
    }
    
    this.logger.debug('Transforming tools for Gemini', {
      toolCount: tools.length,
      toolNames: tools.map(t => t.function?.name || t.name).join(', ')
    });
    
    return tools.map((tool, index) => {
      this.logger.debug(`Processing tool ${index}`, {
        toolName: tool.function?.name || tool.name,
        hasParameters: !!(tool.function?.parameters),
        originalRequired: tool.function?.parameters?.required || []
      });
      
      if (tool.type === 'function') {
        const cleanedParams = this.cleanParametersForGemini(tool.function.parameters);
        
        this.logger.debug(`Cleaned parameters for tool ${tool.function.name}`, {
          originalRequired: tool.function.parameters?.required || [],
          cleanedRequired: cleanedParams?.required || [],
          availableProperties: Object.keys(cleanedParams?.properties || {})
        });
        
        return {
          functionDeclarations: [
            {
              name: tool.function.name,
              description: tool.function.description,
              parameters: cleanedParams
            }
          ]
        };
      } else if (tool.function) {
        // Handle direct function format
        const cleanedParams = this.cleanParametersForGemini(tool.function.parameters);
        
        this.logger.debug(`Cleaned parameters for direct function ${tool.function.name}`, {
          originalRequired: tool.function.parameters?.required || [],
          cleanedRequired: cleanedParams?.required || [],
          availableProperties: Object.keys(cleanedParams?.properties || {})
        });
        
        return {
          functionDeclarations: [
            {
              name: tool.function.name,
              description: tool.function.description,
              parameters: cleanedParams
            }
          ]
        };
      }
      return tool;
    });
  }
  
  // Clean JSON Schema parameters to be compatible with Gemini API
  cleanParametersForGemini(parameters) {
    if (!parameters || typeof parameters !== 'object') {
      return parameters;
    }
    
    // Create a deep copy to avoid modifying the original
    const cleaned = JSON.parse(JSON.stringify(parameters));
    
    // Log before cleaning for debugging
    this.logger.debug('Schema before cleaning', {
      properties: Object.keys(cleaned.properties || {}),
      required: cleaned.required || []
    });
    
    // Remove unsupported JSON Schema fields that Gemini doesn't recognize
    this.removeUnsupportedSchemaFields(cleaned);
    
    // Log after cleaning for debugging
    this.logger.debug('Schema after cleaning', {
      properties: Object.keys(cleaned.properties || {}),
      required: cleaned.required || []
    });
    
    return cleaned;
  }
  
  // Extract text content from either string or Claude Code Router content arrays
  extractTextFromContent(content) {
    // If content is already a string, return it
    if (typeof content === 'string') {
      return content;
    }
    
    // If content is an array (from Claude Code Router), extract text from all text blocks
    if (Array.isArray(content)) {
      let combinedText = '';
      for (const block of content) {
        if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
          combinedText += block.text;
        }
      }
      return combinedText;
    }
    
    // If content is an object with a text property, extract it
    if (content && typeof content === 'object' && typeof content.text === 'string') {
      return content.text;
    }
    
    // Fallback: try to convert to string
    return String(content || '');
  }
  
  // Recursively remove unsupported JSON Schema fields
  removeUnsupportedSchemaFields(obj) {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    
    // List of JSON Schema fields that Gemini API doesn't support
    // CRITICAL: Do NOT include 'pattern' here - it's a valid property name, not a JSON Schema field
    const unsupportedFields = [
      '$schema',
      'additionalProperties',
      'minItems',
      'maxItems',
      'minLength',
      'maxLength',
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'format',
      'default',
      'examples',
      'const',
      'oneOf',
      'anyOf',
      'allOf',
      'not',
      'if',
      'then',
      'else'
    ];
    
    // Remove unsupported fields from current level
    for (const field of unsupportedFields) {
      if (field in obj) {
        delete obj[field];
      }
    }
    
    // Handle required array validation for properties
    if (obj.properties && obj.required && Array.isArray(obj.required)) {
      this.logger.debug('Processing required array for tool schema', {
        requiredBefore: obj.required,
        availableProperties: Object.keys(obj.properties)
      });
      
      // Filter required array to only include properties that actually exist
      const originalRequired = [...obj.required];
      obj.required = obj.required.filter(propName => {
        const exists = obj.properties && obj.properties[propName];
        if (!exists) {
          this.logger.warn('Removing invalid required property from tool schema', {
            property: propName,
            reason: 'Property not defined in properties object',
            availableProperties: Object.keys(obj.properties || {})
          });
        }
        return exists;
      });
      
      this.logger.debug('Filtered required array', {
        originalRequired,
        filteredRequired: obj.required,
        removedCount: originalRequired.length - obj.required.length
      });
      
      // Remove required array if it's empty
      if (obj.required.length === 0) {
        this.logger.debug('Removing empty required array from tool schema');
        delete obj.required;
      }
    }
    
    // Recursively clean nested objects and arrays
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        value.forEach(item => this.removeUnsupportedSchemaFields(item));
      } else if (value && typeof value === 'object') {
        this.removeUnsupportedSchemaFields(value);
      }
    }
  }
  
  // Transform Gemini content to OpenAI format
  transformGeminiContentToOpenAI(geminiContent) {
    const openAIMessage = {
      role: this.mapRoleFromGemini(geminiContent.role),
      content: ''
    };
    
    const toolCalls = [];
    let textContent = '';
    
    // Process parts
    if (Array.isArray(geminiContent.parts)) {
      for (const part of geminiContent.parts) {
        if (part.text) {
          textContent += part.text;
        } else if (part.functionCall) {
          // Convert Gemini function calls to OpenAI tool calls
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            }
          });
        }
      }
    }
    
    openAIMessage.content = textContent.trim() || null;
    
    // Add tool calls if present
    if (toolCalls.length > 0) {
      openAIMessage.tool_calls = toolCalls;
    }
    
    return openAIMessage;
  }
  
  // Map roles between OpenAI and Gemini
  mapRoleToGemini(role) {
    switch (role) {
      case 'system':
        return 'user'; // Gemini doesn't support system role, map to user
      case 'user':
        return 'user';
      case 'assistant':
        return 'model';
      case 'tool':
        return 'user'; // Gemini treats tool responses as user messages
      default:
        return 'user';
    }
  }
  
  mapRoleFromGemini(role) {
    switch (role) {
      case 'model':
        return 'assistant';
      case 'user':
        return 'user';
      default:
        return 'assistant';
    }
  }
  
  // Map finish reasons between APIs
  mapFinishReason(finishReason) {
    switch (finishReason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      case 'FINISH_REASON_UNSPECIFIED':
        return 'stop';
      default:
        return 'stop';
    }
  }
  
  // Clean undefined fields from objects
  cleanUndefinedFields(obj) {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        if (obj[key] === undefined) {
          delete obj[key];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.cleanUndefinedFields(obj[key]);
        }
      });
    }
  }
  
  // Analyze request size to help identify potential timeout causes
  analyzeRequestSize(request) {
    if (!request || !request.contents) {
      return { contentLength: 0, tokenEstimate: 0 };
    }
    
    let totalChars = 0;
    let messageCount = 0;
    
    // Count characters in all message contents
    for (const content of request.contents) {
      if (content.parts && Array.isArray(content.parts)) {
        for (const part of content.parts) {
          if (part.text) {
            totalChars += part.text.length;
            messageCount++;
          }
        }
      }
    }
    
    // Rough estimate: 1 token ≈ 4 characters
    const tokenEstimate = Math.floor(totalChars / 4);
    
    return {
      contentLength: totalChars,
      tokenEstimate: tokenEstimate,
      messageCount: messageCount
    };
  }
  
  // Validation helpers
  validateOpenAIRequest(request) {
    if (!request.messages || !Array.isArray(request.messages)) {
      throw new Error('Invalid request: messages must be an array');
    }
    
    if (request.messages.length === 0) {
      throw new Error('Invalid request: messages array cannot be empty');
    }
    
    for (const message of request.messages) {
      if (!message.role) {
        throw new Error('Invalid request: each message must have a role');
      }
      
      // Validate content requirements based on role
      if (message.role === 'tool') {
        // Tool messages must have tool_call_id but content can be empty
        if (!message.tool_call_id) {
          throw new Error('Invalid request: tool messages must have tool_call_id');
        }
      } else if (message.role === 'assistant') {
        // Assistant messages can have empty content in some scenarios
        // No additional validation needed
      } else {
        // User and system messages should have content
        // Note: Gemini can handle empty content, but it's better to have some
      }
      
      if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        throw new Error(`Invalid request: unsupported message role: ${message.role}`);
      }
    }
    
    return true;
  }
}