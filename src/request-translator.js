import { ToolCallValidator } from './tool-call-validator.js';

export class RequestTranslator {
  constructor(logger, apiBaseUrl = null, requestTimeout = 30000) {
    this.logger = logger;
    this.apiBaseUrl = apiBaseUrl;
    this.requestTimeout = requestTimeout;
    this.toolCallValidator = new ToolCallValidator(logger);
  }

  setTokenManager(tokenManager) {
    this.tokenManager = tokenManager;
  }

  translateOpenAIToQwen(openAIRequest) {
    // F-1.3: Translate OpenAI-compatible requests to Qwen-Code API format
    // Qwen-Code API is OpenAI-compatible, so minimal translation is needed
    // We'll pass through most fields but ensure compatibility
    
    const qwenRequest = {
      model: openAIRequest.model || 'qwen-coder-plus',
      messages: this.transformMessagesForQwen(openAIRequest.messages || [], openAIRequest.tools),
      temperature: openAIRequest.temperature,
      max_tokens: openAIRequest.max_tokens,
      top_p: openAIRequest.top_p,
      frequency_penalty: openAIRequest.frequency_penalty,
      presence_penalty: openAIRequest.presence_penalty,
      stop: openAIRequest.stop,
      stream: openAIRequest.stream || false,
      n: openAIRequest.n || 1,
      user: openAIRequest.user,
      // CRITICAL: Include tool/function calling fields
      tools: openAIRequest.tools,
      tool_choice: openAIRequest.tool_choice,
      function_call: openAIRequest.function_call,
      functions: openAIRequest.functions
    };

    // Remove undefined fields to keep request clean
    Object.keys(qwenRequest).forEach(key => {
      if (qwenRequest[key] === undefined) {
        delete qwenRequest[key];
      }
    });

    this.logger.info('Translated OpenAI request to Qwen format', {
      model: qwenRequest.model,
      messageCount: qwenRequest.messages.length,
      stream: qwenRequest.stream,
      hasTools: !!qwenRequest.tools,
      toolCount: qwenRequest.tools ? qwenRequest.tools.length : 0,
      hasToolChoice: !!qwenRequest.tool_choice
    });

    return qwenRequest;
  }

  translateQwenToOpenAI(qwenResponse) {
    // F-1.4: Transform Qwen-Code responses to OpenAI-compatible format
    // Enhanced with robust tool call preservation and error handling
    
    const openAIResponse = {
      id: qwenResponse.id || this.generateId(),
      object: qwenResponse.object || 'chat.completion',
      created: qwenResponse.created || Math.floor(Date.now() / 1000),
      model: qwenResponse.model || 'qwen-coder-plus',
      choices: qwenResponse.choices || [],
      usage: qwenResponse.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    // Enhanced choice processing with comprehensive tool call preservation
    openAIResponse.choices = openAIResponse.choices.map((choice, index) => {
      const processedChoice = {
        index: choice.index !== undefined ? choice.index : index,
        finish_reason: choice.finish_reason || 'stop'
      };

      // Process message with tool call preservation
      const message = choice.message || choice.delta || {};
      processedChoice.message = {
        role: message.role || 'assistant',
        content: message.content || null
      };

      // ✅ CRITICAL: Preserve tool_calls structure completely
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        const validatedToolCalls = [];
        
        for (const toolCall of message.tool_calls) {
          try {
            // Validate and preserve tool call structure
            if (!toolCall.id) {
              this.logger.warn('Tool call missing ID in response, skipping', {
                functionName: toolCall.function?.name
              });
              continue;
            }

            if (!toolCall.function || !toolCall.function.name) {
              this.logger.warn('Tool call missing function information in response', {
                toolCallId: toolCall.id
              });
              continue;
            }

            // Validate arguments are valid JSON if present
            let validatedArguments = toolCall.function.arguments || '{}';
            if (validatedArguments) {
              try {
                // Parse and re-stringify to ensure valid JSON
                const parsedArgs = JSON.parse(validatedArguments);
                validatedArguments = JSON.stringify(parsedArgs);
              } catch (error) {
                this.logger.warn('Invalid JSON in tool call arguments, using empty object', {
                  toolCallId: toolCall.id,
                  functionName: toolCall.function.name,
                  error: error.message,
                  rawArguments: validatedArguments.substring(0, 200) + '...',
                  argumentsLength: validatedArguments.length
                });
                validatedArguments = '{}';
              }
            }

            // Build validated tool call
            const validatedToolCall = {
              id: toolCall.id,
              type: toolCall.type || 'function',
              function: {
                name: toolCall.function.name,
                arguments: validatedArguments
              }
            };

            validatedToolCalls.push(validatedToolCall);
            
            this.logger.debug('Preserved tool call in response', {
              toolCallId: toolCall.id,
              functionName: toolCall.function.name,
              hasArguments: !!validatedArguments && validatedArguments !== '{}'
            });

          } catch (error) {
            this.logger.error('Error processing tool call in response', {
              toolCallId: toolCall.id,
              error: error.message
            });
          }
        }

        // Only add tool_calls if we have valid ones
        if (validatedToolCalls.length > 0) {
          processedChoice.message.tool_calls = validatedToolCalls;
          
          this.logger.info('Preserved tool calls in OpenAI response', {
            originalCount: message.tool_calls.length,
            validatedCount: validatedToolCalls.length
          });
        } else if (message.tool_calls.length > 0) {
          this.logger.warn('All tool calls in response were invalid, removing tool_calls field', {
            originalCount: message.tool_calls.length
          });
        }
      }

      return processedChoice;
    });

    // Final validation and logging
    const totalToolCalls = openAIResponse.choices.reduce((count, choice) => {
      return count + (choice.message.tool_calls ? choice.message.tool_calls.length : 0);
    }, 0);

    this.logger.info('Translated Qwen response to OpenAI format', {
      id: openAIResponse.id,
      model: openAIResponse.model,
      choiceCount: openAIResponse.choices.length,
      totalToolCalls,
      hasUsage: !!openAIResponse.usage
    });

    return openAIResponse;
  }

  async forwardToQwenAPI(qwenRequest, accessToken) {
    try {
      // Get the correct API base URL from token manager
      let apiBaseUrl;
      if (this.tokenManager) {
        apiBaseUrl = this.tokenManager.getApiBaseUrl();
      } else {
        apiBaseUrl = this.apiBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      }
      
      const apiUrl = `${apiBaseUrl}/chat/completions`;

      this.logger.info('Forwarding request to Qwen API', {
        url: apiUrl,
        model: qwenRequest.model,
        messageCount: qwenRequest.messages.length
      });

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'qwen-code/1.0.0'
        },
        body: JSON.stringify(qwenRequest),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        this.logger.error('Qwen API request failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });

        const error = new Error(errorData.error?.message || `API request failed: ${response.status} ${response.statusText}`);
        error.statusCode = response.status;
        throw error;
      }

      // Handle streaming vs non-streaming responses
      if (qwenRequest.stream) {
        // For streaming responses, return the response directly
        // The Express res.pipe() will handle the streaming
        return response;
      } else {
        const responseData = await response.json();
        
        this.logger.info('Received successful response from Qwen API', {
          id: responseData.id,
          model: responseData.model,
          usage: responseData.usage
        });

        return responseData;
      }

    } catch (error) {
      this.logger.error('Error forwarding request to Qwen API', {
        error: error.message,
        statusCode: error.statusCode
      });

      // Handle specific error cases
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to Qwen API. Please check your internet connection.');
        networkError.statusCode = 503;
        throw networkError;
      }

      // Handle timeout errors
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        const timeoutError = new Error('Request timeout: Qwen API did not respond in time.');
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
      // Handle Server-Sent Events format
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
        const translatedData = this.translateStreamingQwenToOpenAI(data);
        
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

  // Translate streaming response chunks from Qwen to OpenAI format
  translateStreamingQwenToOpenAI(qwenChunk) {
    // Handle streaming chunk translation similar to non-streaming
    const openAIChunk = {
      id: qwenChunk.id || this.generateId(),
      object: qwenChunk.object || 'chat.completion.chunk',
      created: qwenChunk.created || Math.floor(Date.now() / 1000),
      model: qwenChunk.model || 'qwen-coder-plus',
      choices: qwenChunk.choices || []
    };

    // Process each choice in the streaming chunk
    openAIChunk.choices = openAIChunk.choices.map((choice, index) => {
      const processedChoice = {
        index: choice.index !== undefined ? choice.index : index,
        finish_reason: choice.finish_reason || null
      };

      // Process delta message with tool call preservation
      const delta = choice.delta || {};
      processedChoice.delta = {
        role: delta.role || undefined,
        content: delta.content || undefined
      };

      // ✅ CRITICAL: Preserve tool_calls in streaming chunks
      if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
        const validatedToolCalls = [];
        
        for (const toolCall of delta.tool_calls) {
          try {
            // Validate and preserve streaming tool call structure
            const validatedToolCall = {
              index: toolCall.index,
              id: toolCall.id || undefined,
              type: toolCall.type || 'function'
            };

            if (toolCall.function) {
              validatedToolCall.function = {
                name: toolCall.function.name || undefined,
                arguments: undefined
              };
              
              // For streaming tool calls, pass arguments through without validation
              // since they may be partial JSON fragments that complete over multiple chunks
              if (toolCall.function.arguments !== undefined) {
                validatedToolCall.function.arguments = toolCall.function.arguments;
              }
            }

            validatedToolCalls.push(validatedToolCall);
            
          } catch (error) {
            this.logger.error('Error processing streaming tool call', {
              toolCallIndex: toolCall.index,
              error: error.message
            });
          }
        }

        // Only add tool_calls if we have valid ones
        if (validatedToolCalls.length > 0) {
          processedChoice.delta.tool_calls = validatedToolCalls;
        }
      }

      return processedChoice;
    });

    return openAIChunk;
  }

  // Utility method for streaming support (Phase 2/3)
  async forwardStreamToQwenAPI(qwenRequest, accessToken) {
    // This will be implemented in a future phase when streaming is needed
    throw new Error('Streaming not yet implemented');
  }

  // Transform messages to be compatible with Qwen API
  transformMessagesForQwen(messages, tools = null) {
    // Validate tool call sequence before transformation
    const validationResult = this.toolCallValidator.validateToolCallSequence(messages);
    
    if (!validationResult.valid) {
      this.logger.warn('Tool call sequence validation failed, but proceeding with transformation', {
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
    }
    
    // CRITICAL: Preserve tool messages as-is - Qwen API supports them directly
    const transformedMessages = messages.map(message => {
      // ✅ CORRECT: Preserve tool messages unchanged
      if (message.role === 'tool') {
        // Validate required fields
        if (!message.tool_call_id) {
          this.logger.error('Tool message missing required tool_call_id', {
            content: message.content?.substring(0, 100)
          });
        }
        
        const preservedMessage = {
          role: 'tool',
          tool_call_id: message.tool_call_id,
          content: message.content || ''
        };
        
        this.logger.debug('Preserved tool message structure', {
          toolCallId: message.tool_call_id,
          contentLength: message.content ? message.content.length : 0
        });
        
        return preservedMessage;
      }
      
      // ✅ CORRECT: Preserve assistant messages with tool_calls unchanged
      if (message.role === 'assistant' && message.tool_calls) {
        // Validate tool call structure
        const validToolCalls = message.tool_calls.filter(toolCall => {
          if (!toolCall.id) {
            this.logger.warn('Tool call missing ID, excluding from request', {
              functionName: toolCall.function?.name
            });
            return false;
          }
          
          if (!toolCall.function?.name) {
            this.logger.warn('Tool call missing function name, excluding from request', {
              toolCallId: toolCall.id
            });
            return false;
          }
          
          // Validate arguments are valid JSON if present
          if (toolCall.function.arguments) {
            try {
              JSON.parse(toolCall.function.arguments);
            } catch (error) {
              this.logger.warn('Tool call has invalid JSON arguments, excluding from request', {
                toolCallId: toolCall.id,
                functionName: toolCall.function.name,
                error: error.message
              });
              return false;
            }
          }
          
          return true;
        });
        
        const preservedMessage = {
          role: 'assistant',
          content: message.content || '',
          tool_calls: validToolCalls
        };
        
        this.logger.debug('Preserved assistant message with tool calls', {
          originalToolCallCount: message.tool_calls.length,
          validToolCallCount: validToolCalls.length,
          hasContent: !!message.content
        });
        
        return preservedMessage;
      }
      
      // Pass through other message types unchanged (system, user, assistant without tool_calls)
      return message;
    });
    
    // Log transformation summary
    const toolMessageCount = messages.filter(m => m.role === 'tool').length;
    const assistantWithToolsCount = messages.filter(m => m.role === 'assistant' && m.tool_calls).length;
    
    if (toolMessageCount > 0 || assistantWithToolsCount > 0) {
      this.logger.info('Preserved tool calling structure for Qwen API', {
        totalMessages: messages.length,
        toolMessages: toolMessageCount,
        assistantMessagesWithTools: assistantWithToolsCount,
        validationPassed: validationResult.valid,
        hasToolDefinitions: tools && tools.length > 0
      });
    }
    
    return transformedMessages;
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
        // Assistant messages can have empty content in some scenarios (e.g., tool results, status updates)
        // No additional validation needed
      } else {
        // User and system messages must have content
        if (!message.content) {
          throw new Error('Invalid request: each message must have content');
        }
      }
      
      if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        throw new Error(`Invalid request: unsupported message role: ${message.role}`);
      }
    }

    return true;
  }
}