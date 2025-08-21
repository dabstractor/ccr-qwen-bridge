/**
 * Tool Call Validator
 * 
 * Validates tool call sequences and manages tool call state according to OpenAI and Qwen API requirements.
 * Ensures proper tool_call_id mapping and prevents validation errors that break tool calling.
 */

// Tool call state management types
export const ToolCallState = {
  PENDING: 'pending',
  EXECUTING: 'executing', 
  COMPLETED: 'completed',
  ERROR: 'error'
};

/**
 * Enhanced error class that behaves like a string for backward compatibility
 * but stores detailed error information for debugging
 */
class ValidationError extends String {
  constructor(message, context = {}) {
    super(message);
    this.message = message;
    this.timestamp = new Date().toISOString();
    Object.assign(this, context);
  }

  toString() {
    return this.message;
  }

  valueOf() {
    return this.message;
  }
}

/**
 * Enhanced warning class that behaves like a string for backward compatibility
 */
class ValidationWarning extends String {
  constructor(message, context = {}) {
    super(message);
    this.message = message;
    this.timestamp = new Date().toISOString();
    Object.assign(this, context);
  }

  toString() {
    return this.message;
  }

  valueOf() {
    return this.message;
  }
}

/**
 * Validation result structure for tool call sequence validation
 */
export class ValidationResult {
  constructor(valid = true, errors = [], warnings = []) {
    this.valid = valid;
    this.errors = errors;
    this.warnings = warnings;
    this.toolCallCount = 0;
    this.respondedToolCallCount = 0;
    // NEW: Add detailed context for debugging
    this.context = {
      schemaValidation: [],
      parameterProcessing: [],
      jsonParsing: []
    };
  }

  addError(message, context = {}) {
    const error = new ValidationError(message, context);
    this.errors.push(error);
    this.valid = false;
  }

  addWarning(message, context = {}) {
    const warning = new ValidationWarning(message, context);
    this.warnings.push(warning);
  }

  addSchemaValidationContext(toolName, parameterName, issue, details = {}) {
    this.context.schemaValidation.push({
      toolName,
      parameterName,
      issue,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  addParameterProcessingContext(toolName, step, details = {}) {
    this.context.parameterProcessing.push({
      toolName,
      step,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  addJsonParsingContext(toolName, success, error = null, details = {}) {
    this.context.jsonParsing.push({
      toolName,
      success,
      error,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  hasIssues() {
    return this.errors.length > 0 || this.warnings.length > 0;
  }

  updateValidation() {
    this.valid = this.errors.length === 0;
  }

  getDetailedSummary() {
    return {
      valid: this.valid,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      toolCallCount: this.toolCallCount,
      respondedToolCallCount: this.respondedToolCallCount,
      contextSummary: {
        schemaValidationIssues: this.context.schemaValidation.length,
        parameterProcessingSteps: this.context.parameterProcessing.length,
        jsonParsingAttempts: this.context.jsonParsing.length
      }
    };
  }
}

/**
 * Tool Call Validator class
 * 
 * Provides comprehensive validation for tool calling sequences to ensure compatibility
 * with both OpenAI and Qwen APIs. Tracks tool call state and validates message patterns.
 */
export class ToolCallValidator {
  constructor(logger) {
    this.logger = logger;
    this.toolCallTracker = new Map();
  }

  /**
   * Validate tool call sequence in messages array
   * 
   * @param {Array} messages - Array of message objects to validate
   * @returns {ValidationResult} Validation result with errors/warnings
   */
  validateToolCallSequence(messages) {
    const result = new ValidationResult();
    const toolCallTracker = new Map();
    
    for (const message of messages) {
      // Track assistant messages with tool calls
      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (!toolCall.id) {
            result.addError('Tool call missing required ID', {
              toolCall: JSON.stringify(toolCall),
              validationStep: 'id_validation',
              messageIndex: messages.indexOf(message)
            });
            continue;
          }
          
          if (!toolCall.function || !toolCall.function.name) {
            result.addError('Tool call missing function name', {
              toolCallId: toolCall.id,
              hasFunction: !!toolCall.function,
              functionName: toolCall.function?.name,
              validationStep: 'function_name_validation',
              messageIndex: messages.indexOf(message)
            });
            continue;
          }

          // Validate function arguments are valid JSON
          if (toolCall.function.arguments) {
            try {
              JSON.parse(toolCall.function.arguments);
              result.addJsonParsingContext(toolCall.function.name, true, null, {
                toolCallId: toolCall.id,
                argumentsLength: toolCall.function.arguments.length
              });
            } catch (error) {
              result.addError('Tool call has invalid JSON arguments', {
                toolCallId: toolCall.id,
                functionName: toolCall.function.name,
                jsonError: error.message,
                argumentsPreview: toolCall.function.arguments.substring(0, 100) + (toolCall.function.arguments.length > 100 ? '...' : ''),
                argumentsLength: toolCall.function.arguments.length,
                validationStep: 'json_arguments_validation',
                messageIndex: messages.indexOf(message)
              });
              result.addJsonParsingContext(toolCall.function.name, false, error.message, {
                toolCallId: toolCall.id,
                argumentsLength: toolCall.function.arguments.length
              });
              continue;
            }
          }
          
          // Track pending tool call
          toolCallTracker.set(toolCall.id, { 
            status: ToolCallState.PENDING, 
            call: toolCall,
            timestamp: Date.now()
          });
          result.toolCallCount++;
          
          this.logger.debug('Tracked pending tool call', {
            toolCallId: toolCall.id,
            functionName: toolCall.function.name
          });
        }
      }
      
      // Track tool response messages
      if (message.role === 'tool') {
        if (!message.tool_call_id) {
          result.addError('Tool message missing required tool_call_id');
          continue;
        }
        
        if (!toolCallTracker.has(message.tool_call_id)) {
          result.addError(`Orphaned tool response: tool_call_id '${message.tool_call_id}' has no matching tool call`);
          continue;
        }
        
        // Update tool call status to completed
        const toolCallState = toolCallTracker.get(message.tool_call_id);
        toolCallState.status = ToolCallState.COMPLETED;
        toolCallState.response = message.content;
        toolCallTracker.set(message.tool_call_id, toolCallState);
        result.respondedToolCallCount++;
        
        this.logger.debug('Tracked tool response', {
          toolCallId: message.tool_call_id,
          contentLength: message.content ? message.content.length : 0
        });
      }
    }
    
    // Check for unresolved tool calls
    const pendingCalls = [...toolCallTracker.entries()]
      .filter(([_, state]) => state.status === ToolCallState.PENDING)
      .map(([id, state]) => ({ id, functionName: state.call.function.name }));
    
    if (pendingCalls.length > 0) {
      const pendingIds = pendingCalls.map(call => call.id).join(', ');
      const pendingFunctions = pendingCalls.map(call => call.functionName).join(', ');
      
      // This is critical - Qwen API will reject requests with unresolved tool calls
      result.addError(`Missing tool responses for ${pendingCalls.length} tool call(s). IDs: [${pendingIds}]. Functions: [${pendingFunctions}]`);
    }
    
    // Store validation statistics
    this.toolCallTracker = toolCallTracker;
    
    // Ensure validation state is correct
    result.updateValidation();
    
    if (result.valid) {
      this.logger.info('Tool call sequence validation passed', {
        totalToolCalls: result.toolCallCount,
        respondedToolCalls: result.respondedToolCallCount
      });
    } else {
      this.logger.error('Tool call sequence validation failed', {
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        errors: result.errors
      });
    }
    
    return result;
  }

  /**
   * Track tool call state for ongoing management
   * 
   * @param {string} toolCallId - Tool call ID to track
   * @param {string} status - New status (use ToolCallState constants)
   * @param {Object} metadata - Additional metadata to store
   */
  trackToolCallState(toolCallId, status, metadata = {}) {
    const existingState = this.toolCallTracker.get(toolCallId) || {};
    
    this.toolCallTracker.set(toolCallId, {
      ...existingState,
      status,
      lastUpdated: Date.now(),
      ...metadata
    });
    
    this.logger.debug('Updated tool call state', {
      toolCallId,
      status,
      metadata
    });
  }

  /**
   * Get tool call state
   * 
   * @param {string} toolCallId - Tool call ID to query
   * @returns {Object|null} Tool call state or null if not found
   */
  getToolCallState(toolCallId) {
    return this.toolCallTracker.get(toolCallId) || null;
  }

  /**
   * Clean up orphaned tool calls older than timeout
   * 
   * @param {number} timeoutMs - Timeout in milliseconds (default: 300000 = 5 minutes)
   * @returns {Array} Array of cleaned up tool call IDs
   */
  cleanupOrphanedCalls(timeoutMs = 300000) {
    const now = Date.now();
    const cleanedUp = [];
    
    for (const [toolCallId, state] of this.toolCallTracker.entries()) {
      if (state.status === ToolCallState.PENDING && 
          state.timestamp && 
          (now - state.timestamp) > timeoutMs) {
        
        this.toolCallTracker.delete(toolCallId);
        cleanedUp.push(toolCallId);
        
        this.logger.warn('Cleaned up orphaned tool call', {
          toolCallId,
          ageMs: now - state.timestamp,
          functionName: state.call?.function?.name
        });
      }
    }
    
    if (cleanedUp.length > 0) {
      this.logger.info('Cleaned up orphaned tool calls', {
        cleanedUpCount: cleanedUp.length,
        remainingCount: this.toolCallTracker.size
      });
    }
    
    return cleanedUp;
  }

  /**
   * Get validation statistics
   * 
   * @returns {Object} Current validation statistics
   */
  getStats() {
    const states = [...this.toolCallTracker.values()].reduce((acc, state) => {
      acc[state.status] = (acc[state.status] || 0) + 1;
      return acc;
    }, {});
    
    return {
      totalTracked: this.toolCallTracker.size,
      byStatus: states,
      timestamp: Date.now()
    };
  }

  /**
   * Reset validator state (useful for testing)
   */
  reset() {
    this.toolCallTracker.clear();
    this.logger.debug('Tool call validator state reset');
  }
}