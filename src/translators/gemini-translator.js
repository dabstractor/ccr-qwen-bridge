import { ToolCallValidator } from '../tool-call-validator.js';
import { BaseTranslator } from './base-translator.js';

/**
 * GeminiTranslator - Gemini-specific request translator
 * Translates between OpenAI-compatible format and Google Gemini API format
 */
export class GeminiTranslator extends BaseTranslator {
  constructor(logger, apiBaseUrl = null, requestTimeout = 30000) {
    super(logger, apiBaseUrl || 'https://generativelanguage.googleapis.com/v1', requestTimeout);
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
      },
      // Handle streaming
      stream: openAIRequest.stream || false
    };
    
    // Handle tools/functions if present
    if (openAIRequest.tools || openAIRequest.functions) {
      geminiRequest.tools = this.transformToolsForGemini(openAIRequest.tools || openAIRequest.functions);
    }
    
    // Remove undefined fields to keep request clean
    this.cleanUndefinedFields(geminiRequest);
    this.cleanUndefinedFields(geminiRequest.generationConfig);
    
    this.logger.info('Translated OpenAI request to Gemini format', {
      model: modelName,
      messageCount: geminiRequest.contents ? geminiRequest.contents.length : 0,
      stream: geminiRequest.stream,
      hasTools: !!geminiRequest.tools,
      toolCount: geminiRequest.tools ? geminiRequest.tools.length : 0
    });
    
    return {
      model: modelName,
      request: geminiRequest
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
    
    this.logger.info('Translated Gemini response to OpenAI format', {
      id: openAIResponse.id,
      model: openAIResponse.model,
      choiceCount: openAIResponse.choices.length,
      hasUsage: !!openAIResponse.usage
    });
    
    return openAIResponse;
  }
  
  async forwardToProviderAPI(providerRequest, accessToken) {
    try {
      const { model, request } = providerRequest;
      const apiUrl = `${this.apiBaseUrl}/models/${model}:generateContent?key=${accessToken}`;
      
      this.logger.info('Forwarding request to Gemini API', {
        url: apiUrl,
        model: model,
        messageCount: request.contents ? request.contents.length : 0
      });
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'gemini-code/1.0.0'
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
      if (request.stream) {
        // For streaming responses, return the response directly
        return response;
      } else {
        const responseData = await response.json();
        
        this.logger.info('Received successful response from Gemini API', {
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
        // Tool response messages
        geminiContent.parts.push({
          text: message.content || ''
        });
      } else if (message.role === 'assistant' && message.tool_calls) {
        // Assistant messages with tool calls
        // Convert tool calls to Gemini function calls
        const functionCalls = message.tool_calls.map(toolCall => ({
          functionCall: {
            name: toolCall.function.name,
            args: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
          }
        }));
        
        geminiContent.parts.push(...functionCalls);
        
        // Add content if present
        if (message.content) {
          geminiContent.parts.unshift({
            text: message.content
          });
        }
      } else {
        // Regular text messages (system, user, assistant)
        if (message.content) {
          geminiContent.parts.push({
            text: message.content
          });
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
    
    return tools.map(tool => {
      if (tool.type === 'function') {
        return {
          functionDeclarations: [
            {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters
            }
          ]
        };
      } else if (tool.function) {
        // Handle direct function format
        return {
          functionDeclarations: [
            {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters
            }
          ]
        };
      }
      return tool;
    });
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
      case 'user':
        return role;
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