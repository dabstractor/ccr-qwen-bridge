import { ToolCallValidator } from '../tool-call-validator.js';
import { BaseTranslator } from './base-translator.js';

/**
 * GeminiTranslator - Gemini-specific request translator
 * Translates between OpenAI-compatible format and Google Gemini API format
 */
export class GeminiTranslator extends BaseTranslator {
  constructor(logger, apiBaseUrl = null, requestTimeout = 30000) {
    super(logger, apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta', requestTimeout);
    this.toolCallValidator = new ToolCallValidator(logger);
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
    try {
      const { model, request, stream } = providerRequest;
      // Use streaming endpoint if streaming is enabled
      const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
      
      // For public Gemini API, use API key instead of OAuth token
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required for Gemini API access');
      }
      
      const apiUrl = `${this.apiBaseUrl}/models/${model}:${endpoint}?key=${apiKey}`;
      
      // CRITICAL: Remove any 'stream' field that might have leaked into the request
      if ('stream' in request) {
        this.logger.warn('Removing stream field from Gemini request - not supported by API');
        delete request.stream;
      }
      
      // Request prepared for Gemini API
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GeminiCLI/1.0.0 (linux; x64) node.js'
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        this.logger.error('Gemini API request failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        const error = new Error(errorData.error?.message || `API request failed: ${response.status} ${response.statusText}`);
        error.statusCode = response.status;
        throw error;
      }
      
      // Handle streaming vs non-streaming responses
      if (stream) {
        // For streaming responses, return the response directly
        return response;
      } else {
        const responseData = await response.json();
        
        this.logger.debug('Received successful response from Gemini API', {
          id: responseData.id,
          model: model,
          usage: responseData.usageMetadata
        });
        
        return {
          ...responseData,
          model: model
        };
      }
      
    } catch (error) {
      this.logger.error('Error forwarding request to Gemini API', {
        error: error.message,
        statusCode: error.statusCode
      });
      
      // Handle specific error cases
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to Gemini API. Please check your internet connection.');
        networkError.statusCode = 503;
        throw networkError;
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