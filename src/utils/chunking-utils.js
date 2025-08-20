/**
 * Chunking utilities for handling large requests and responses
 * Based on gemini-cli chunking strategies for optimal performance
 */

// Simple debug logger that only logs when DEBUG environment variable is set
function debugLog(...args) {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(...args);
  }
}

/**
 * Default chunking configuration
 * @typedef {Object} ChunkingConfig
 * @property {boolean} enabled - Whether chunking is enabled
 * @property {number} maxSizeBytes - Maximum size in bytes (15MB default)
 * @property {number} maxLines - Maximum number of lines (1500 default)
 * @property {number} maxTokens - Maximum estimated tokens (30000 default)
 * @property {number} batchSize - Number of chunks to process in parallel (1 default)
 * @property {number} overlapLines - Lines to overlap between chunks for context (50 default)
 * @property {string} strategy - Chunking strategy: 'line-based' | 'token-based' | 'size-based'
 */
const DEFAULT_CHUNKING_CONFIG = {
  enabled: true,
  maxSizeBytes: 15 * 1024 * 1024, // 15MB
  maxLines: 1500,
  maxTokens: 30000,
  batchSize: 1,
  overlapLines: 50,
  strategy: 'line-based'
};

/**
 * Estimate token count for text content
 * Based on ~4 characters per token average for most languages
 * @param {string} text - Text to analyze
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  // Basic token estimation: ~4 characters per token
  // This is a rough approximation but sufficient for chunking decisions
  return Math.ceil(text.length / 4);
}

/**
 * Count lines in text content
 * @param {string} text - Text to analyze
 * @returns {number} Number of lines
 */
function countLines(text) {
  if (!text || typeof text !== 'string' || text.length === 0) {
    return 0;
  }
  
  return text.split('\n').length;
}

/**
 * Calculate the total size of a request in bytes
 * @param {Object} request - Request object to analyze
 * @returns {Object} Size analysis results
 */
function analyzeRequestSize(request) {
  if (!request || !request.contents) {
    return { sizeBytes: 0, lineCount: 0, tokenEstimate: 0 };
  }
  
  let totalSize = 0;
  let totalLines = 0;
  let totalTokens = 0;
  
  // Analyze all content parts
  for (const content of request.contents) {
    if (content.parts && Array.isArray(content.parts)) {
      for (const part of content.parts) {
        if (part.text) {
          const text = part.text;
          const textSize = Buffer.byteLength(text, 'utf8');
          const lines = countLines(text);
          const tokens = estimateTokens(text);
          
          totalSize += textSize;
          totalLines += lines;
          totalTokens += tokens;
        }
      }
    }
  }
  
  return {
    sizeBytes: totalSize,
    lineCount: totalLines,
    tokenEstimate: totalTokens
  };
}

/**
 * Determine if a request should be chunked based on size limits
 * @param {Object} request - Request to analyze
 * @param {ChunkingConfig} config - Chunking configuration
 * @returns {boolean} True if chunking is needed
 */
function shouldChunkRequest(request, config = DEFAULT_CHUNKING_CONFIG) {
  if (!config.enabled) {
    return false;
  }
  
  const analysis = analyzeRequestSize(request);
  
  // Tool-aware chunking: requests with many tools often timeout regardless of content size
  const toolCount = (request.tools && Array.isArray(request.tools)) ? request.tools.length : 0;
  const hasManyTools = toolCount > 50; // Threshold for "many tools"
  
  // If we have many tools, be more aggressive about chunking
  const effectiveMaxLines = hasManyTools ? Math.floor(config.maxLines * 0.3) : config.maxLines;
  const effectiveMaxTokens = hasManyTools ? Math.floor(config.maxTokens * 0.5) : config.maxTokens;
  
  // Check against all configured limits (with tool-adjusted thresholds)
  return analysis.sizeBytes > config.maxSizeBytes ||
         analysis.lineCount > effectiveMaxLines ||
         analysis.tokenEstimate > effectiveMaxTokens ||
         hasManyTools; // Always chunk if we have too many tools
}

/**
 * Split text content into chunks based on line boundaries
 * Preserves semantic boundaries and maintains context overlap
 * @param {string} text - Text to chunk
 * @param {ChunkingConfig} config - Chunking configuration
 * @returns {Array<Object>} Array of text chunks with metadata
 */
function chunkTextByLines(text, config = DEFAULT_CHUNKING_CONFIG) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  const lines = text.split('\n');
  const chunks = [];
  let currentIndex = 0;
  
  while (currentIndex < lines.length) {
    const endIndex = Math.min(currentIndex + config.maxLines, lines.length);
    const chunkLines = lines.slice(currentIndex, endIndex);
    const chunkText = chunkLines.join('\n');
    
    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      index: chunks.length,
      content: chunkText,
      metadata: {
        originalPosition: currentIndex,
        sizeBytes: Buffer.byteLength(chunkText, 'utf8'),
        lineCount: chunkLines.length,
        tokenEstimate: estimateTokens(chunkText),
        startLine: currentIndex,
        endLine: endIndex - 1
      }
    });
    
    // Move to next chunk with overlap for context preservation
    currentIndex = Math.max(endIndex - config.overlapLines, endIndex);
    
    // Prevent infinite loop if overlap is too large
    if (currentIndex === endIndex - config.overlapLines && endIndex < lines.length) {
      currentIndex = endIndex;
    }
  }
  
  return chunks;
}

/**
 * Split text content into chunks based on size limits
 * @param {string} text - Text to chunk
 * @param {ChunkingConfig} config - Chunking configuration
 * @returns {Array<Object>} Array of text chunks with metadata
 */
function chunkTextBySize(text, config = DEFAULT_CHUNKING_CONFIG) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  const chunks = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    // Calculate chunk size considering overlap
    let chunkEndIndex = Math.min(currentIndex + config.maxSizeBytes, text.length);
    
    // Try to break at a natural boundary (line break) if possible
    if (chunkEndIndex < text.length) {
      const lineBreakIndex = text.lastIndexOf('\n', chunkEndIndex);
      if (lineBreakIndex > currentIndex + (config.maxSizeBytes * 0.8)) {
        chunkEndIndex = lineBreakIndex + 1;
      }
    }
    
    const chunkText = text.substring(currentIndex, chunkEndIndex);
    
    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      index: chunks.length,
      content: chunkText,
      metadata: {
        originalPosition: currentIndex,
        sizeBytes: Buffer.byteLength(chunkText, 'utf8'),
        lineCount: countLines(chunkText),
        tokenEstimate: estimateTokens(chunkText),
        startByte: currentIndex,
        endByte: chunkEndIndex - 1
      }
    });
    
    // Calculate overlap in characters for size-based chunking
    const overlapChars = Math.min(config.overlapLines * 100, chunkText.length * 0.1);
    currentIndex = Math.max(chunkEndIndex - overlapChars, chunkEndIndex);
    
    // Prevent infinite loop
    if (currentIndex === chunkEndIndex - overlapChars && chunkEndIndex < text.length) {
      currentIndex = chunkEndIndex;
    }
  }
  
  return chunks;
}

/**
 * Create chunks from messages array
 * Intelligently splits large messages while preserving conversation structure and tool call sequences
 * @param {Array} messages - OpenAI format messages  
 * @param {ChunkingConfig} config - Chunking configuration
 * @returns {Array<Object>} Array of message chunks
 */
function createChunksFromMessages(messages, config = DEFAULT_CHUNKING_CONFIG) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return [];
  }
  
  debugLog(`[CHUNKING] Starting chunking for ${messages.length} messages`);
  debugLog(`[CHUNKING] Config: maxLines=${config.maxLines}, maxTokens=${config.maxTokens}, maxSizeBytes=${config.maxSizeBytes}`);
  
  // Log message roles and tool calls
  messages.forEach((msg, idx) => {
    debugLog(`[CHUNKING] Message ${idx}: role=${msg.role}, has_tool_calls=${!!(msg.tool_calls)}, tool_call_id=${msg.tool_call_id || 'none'}`);
    if (msg.tool_calls) {
      msg.tool_calls.forEach(call => debugLog(`  Tool call: id=${call.id}, function=${call.function.name}`));
    }
  });
  
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  let currentLines = 0;
  let currentTokens = 0;
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    debugLog(`[CHUNKING] Processing message ${i}: role=${message.role}`);
    
    // Calculate message size
    const messageText = extractTextFromMessage(message);
    const messageSize = Buffer.byteLength(JSON.stringify(message), 'utf8');
    const messageLines = countLines(messageText);
    const messageTokens = estimateTokens(messageText);
    
    debugLog(`[CHUNKING] Message ${i} size: ${messageSize} bytes, ${messageLines} lines, ${messageTokens} tokens`);
    debugLog(`[CHUNKING] Current chunk: ${currentChunk.length} messages, ${currentSize} bytes, ${currentLines} lines, ${currentTokens} tokens`);
    
    // Check if adding this message would exceed limits
    const wouldExceedSize = currentSize + messageSize > config.maxSizeBytes;
    const wouldExceedLines = currentLines + messageLines > config.maxLines;
    const wouldExceedTokens = currentTokens + messageTokens > config.maxTokens;
    
    debugLog(`[CHUNKING] Would exceed limits? size=${wouldExceedSize}, lines=${wouldExceedLines}, tokens=${wouldExceedTokens}`);
    
    // CRITICAL: Check for tool call sequences that must stay together
    const isToolSequenceBreak = wouldBreakToolSequence(messages, i, currentChunk);
    debugLog(`[CHUNKING] Would break tool sequence? ${isToolSequenceBreak}`);
    
    // If current chunk is not empty and adding would exceed limits AND it's safe to split (won't break tool sequence)
    const shouldFinalizeCurrent = currentChunk.length > 0 && 
                                  (wouldExceedSize || wouldExceedLines || wouldExceedTokens) && 
                                  !isToolSequenceBreak;
    
    debugLog(`[CHUNKING] Should finalize current chunk? ${shouldFinalizeCurrent}`);
    
    if (shouldFinalizeCurrent) {
      debugLog(`[CHUNKING] Finalizing chunk ${chunks.length} with ${currentChunk.length} messages`);
      debugLog(`[CHUNKING] Chunk ${chunks.length} message roles: [${currentChunk.map(m => m.role).join(', ')}]`);
      chunks.push(createMessageChunk(currentChunk, chunks.length));
      currentChunk = [];
      currentSize = 0;
      currentLines = 0;
      currentTokens = 0;
    }
    
    // If single message exceeds limits, we need to be careful with tool sequences
    if (messageSize > config.maxSizeBytes || messageLines > config.maxLines || messageTokens > config.maxTokens) {
      debugLog(`[CHUNKING] Message ${i} exceeds limits - handling specially`);
      debugLog(`[CHUNKING] Message ${i}: ${messageSize} bytes, ${messageLines} lines, ${messageTokens} tokens`);
      
      // For tool messages, we can't chunk them - they must stay with their tool call
      if (message.role === 'tool' || (message.role === 'assistant' && message.tool_calls)) {
        debugLog(`[CHUNKING] Message ${i} is tool-related, keeping whole despite size`);
        // Keep oversized tool messages whole and put them in their own chunk
        if (currentChunk.length > 0) {
          debugLog(`[CHUNKING] Finalizing current chunk before oversized tool message`);
          chunks.push(createMessageChunk(currentChunk, chunks.length));
          currentChunk = [];
          currentSize = 0;
          currentLines = 0;
          currentTokens = 0;
        }
        chunks.push(createMessageChunk([message], chunks.length));
        
        // Continue to next message after handling oversized tool message
        continue;
      } else {
        debugLog(`[CHUNKING] Message ${i} is non-tool, but content chunking can break conversation flow`);
        debugLog(`[CHUNKING] WARNING: Large message will be kept whole to preserve conversation structure`);
        
        // Finalize current chunk if it exists
        if (currentChunk.length > 0) {
          debugLog(`[CHUNKING] Finalizing current chunk before large message`);
          chunks.push(createMessageChunk(currentChunk, chunks.length));
          currentChunk = [];
          currentSize = 0;
          currentLines = 0;
          currentTokens = 0;
        }
        
        // Put the large message in its own chunk to maintain conversation structure
        // This is safer than content chunking which can break message flow
        debugLog(`[CHUNKING] Putting large message ${i} in its own chunk`);
        chunks.push(createMessageChunk([message], chunks.length));
      }
      
      // Continue to next message after handling oversized message
      continue;
    } else {
      debugLog(`[CHUNKING] Adding message ${i} to current chunk`);
      // Add message to current chunk
      currentChunk.push(message);
      currentSize += messageSize;
      currentLines += messageLines;
      currentTokens += messageTokens;
    }
  }
  
  // Add final chunk if not empty
  if (currentChunk.length > 0) {
    debugLog(`[CHUNKING] Finalizing final chunk with ${currentChunk.length} messages`);
    debugLog(`[CHUNKING] Final chunk message roles: [${currentChunk.map(m => m.role).join(', ')}]`);
    chunks.push(createMessageChunk(currentChunk, chunks.length));
  }
  
  debugLog(`[CHUNKING] Created ${chunks.length} chunks total`);
  chunks.forEach((chunk, idx) => {
    debugLog(`[CHUNKING] Chunk ${idx}: ${chunk.metadata.messageCount} messages, roles=[${chunk.content.map(m => m.role).join(', ')}]`);
  });
  
  return chunks;
}

/**
 * Check if chunking at this position would break a tool call sequence
 * Tool sequences: assistant_with_tool_calls -> tool_response(s) -> (optional assistant continuation)
 * @param {Array} messages - All messages
 * @param {number} currentIndex - Current message index being considered for chunking
 * @param {Array} currentChunk - Messages already in current chunk
 * @returns {boolean} True if chunking here would break tool sequence
 */
function wouldBreakToolSequence(messages, currentIndex, currentChunk) {
  const currentMessage = messages[currentIndex];
  
  debugLog(`[TOOL_SEQUENCE] Checking message ${currentIndex}: role=${currentMessage.role}, tool_call_id=${currentMessage.tool_call_id || 'none'}, has_tool_calls=${!!(currentMessage.tool_calls)}`);
  debugLog(`[TOOL_SEQUENCE] Current chunk has ${currentChunk.length} messages: [${currentChunk.map((m, i) => `${i}:${m.role}`).join(', ')}]`);
  
  // Strategy 1: If current message is a tool response, check if its corresponding tool call is in current chunk
  if (currentMessage.role === 'tool') {
    debugLog(`[TOOL_SEQUENCE] Current message is tool response with call_id=${currentMessage.tool_call_id}`);
    
    // Look backwards in the current chunk for the assistant message with this tool call
    for (let i = currentChunk.length - 1; i >= 0; i--) {
      const chunkMessage = currentChunk[i];
      if (chunkMessage.role === 'assistant' && chunkMessage.tool_calls) {
        const hasMatchingCall = chunkMessage.tool_calls.some(call => call.id === currentMessage.tool_call_id);
        if (hasMatchingCall) {
          debugLog(`[TOOL_SEQUENCE] BLOCKING: Tool response ${currentMessage.tool_call_id} belongs with assistant message at chunk position ${i}`);
          return true;
        }
      }
    }
  }
  
  // Strategy 2: If current message has tool calls, check if any following messages are tool responses
  if (currentMessage.role === 'assistant' && currentMessage.tool_calls) {
    const toolCallIds = currentMessage.tool_calls.map(call => call.id);
    debugLog(`[TOOL_SEQUENCE] Current message has ${toolCallIds.length} tool calls: [${toolCallIds.join(', ')}]`);
    
    // Look ahead to see if there are tool responses that would be separated
    for (let i = currentIndex + 1; i < messages.length; i++) {
      const futureMessage = messages[i];
      
      // If we hit a non-tool message, stop looking (tool responses must be immediate)
      if (futureMessage.role !== 'tool') {
        break;
      }
      
      // Check if this tool response matches our tool calls
      if (toolCallIds.includes(futureMessage.tool_call_id)) {
        debugLog(`[TOOL_SEQUENCE] BLOCKING: Tool call ${futureMessage.tool_call_id} has response at message ${i} that would be separated`);
        return true;
      }
    }
  }
  
  // Strategy 3: Look for incomplete tool sequences in current chunk
  // If the chunk ends with tool calls but no responses, we can't split yet
  if (currentChunk.length > 0) {
    const lastMessage = currentChunk[currentChunk.length - 1];
    if (lastMessage.role === 'assistant' && lastMessage.tool_calls) {
      const toolCallIds = lastMessage.tool_calls.map(call => call.id);
      debugLog(`[TOOL_SEQUENCE] Last message in chunk has tool calls: [${toolCallIds.join(', ')}]`);
      
      // Check if all tool calls in the last message have responses in the following messages
      const allResponsesPresent = toolCallIds.every(callId => 
        messages.slice(currentIndex).some(msg => msg.role === 'tool' && msg.tool_call_id === callId)
      );
      
      if (!allResponsesPresent) {
        debugLog(`[TOOL_SEQUENCE] BLOCKING: Not all tool calls in last message have responses in the following messages`);
        return true;
      }
    }
  }
  
  debugLog(`[TOOL_SEQUENCE] No tool sequence blocking found - safe to chunk here`);
  return false;
}

/**
 * Extract text content from a message object
 * @param {Object} message - Message object
 * @returns {string} Extracted text content
 */
function extractTextFromMessage(message) {
  if (!message) return '';
  
  if (typeof message.content === 'string') {
    return message.content;
  }
  
  if (Array.isArray(message.content)) {
    return message.content
      .filter(block => block.type === 'text')
      .map(block => block.text || '')
      .join('');
  }
  
  return message.content?.text || '';
}


/**
 * Create a message chunk object
 * @param {Array} messages - Messages in the chunk
 * @param {number} index - Chunk index
 * @returns {Object} Chunk object
 */
function createMessageChunk(messages, index) {
  const totalSize = messages.reduce((sum, msg) => 
    sum + Buffer.byteLength(JSON.stringify(msg), 'utf8'), 0);
  const totalLines = messages.reduce((sum, msg) => 
    sum + countLines(extractTextFromMessage(msg)), 0);
  const totalTokens = messages.reduce((sum, msg) => 
    sum + estimateTokens(extractTextFromMessage(msg)), 0);
  
  // Count tool calls and responses for debugging
  let toolCallCount = 0;
  let toolResponseCount = 0;
  const toolCallIds = new Set();
  const toolResponseIds = new Set();
  
  messages.forEach(msg => {
    if (msg.role === 'assistant' && msg.tool_calls) {
      toolCallCount += msg.tool_calls.length;
      msg.tool_calls.forEach(call => toolCallIds.add(call.id));
    }
    if (msg.role === 'tool') {
      toolResponseCount++;
      if (msg.tool_call_id) {
        toolResponseIds.add(msg.tool_call_id);
      }
    }
  });
  
  debugLog(`[CHUNK_CREATE] Chunk ${index + 1}: ${messages.length} messages, ${toolCallCount} tool calls, ${toolResponseCount} tool responses`);
  debugLog(`[CHUNK_CREATE] Tool call IDs: [${Array.from(toolCallIds).join(', ')}]`);
  debugLog(`[CHUNK_CREATE] Tool response IDs: [${Array.from(toolResponseIds).join(', ')}]`);
  
  // Validate tool call/response balance
  const unmatchedCalls = Array.from(toolCallIds).filter(id => !toolResponseIds.has(id));
  const unmatchedResponses = Array.from(toolResponseIds).filter(id => !toolCallIds.has(id));
  
  if (unmatchedCalls.length > 0) {
    debugLog(`[CHUNK_CREATE] WARNING: Unmatched tool calls in chunk ${index + 1}: [${unmatchedCalls.join(', ')}]`);
  }
  if (unmatchedResponses.length > 0) {
    debugLog(`[CHUNK_CREATE] WARNING: Unmatched tool responses in chunk ${index + 1}: [${unmatchedResponses.join(', ')}]`);
  }
  
  return {
    id: `chunk_${index + 1}`,
    index,
    content: messages,
    metadata: {
      messageCount: messages.length,
      sizeBytes: totalSize,
      lineCount: totalLines,
      tokenEstimate: totalTokens,
      firstMessageRole: messages[0]?.role || 'unknown',
      lastMessageRole: messages[messages.length - 1]?.role || 'unknown',
      toolCallCount,
      toolResponseCount,
      hasUnmatchedToolCalls: unmatchedCalls.length > 0,
      hasUnmatchedToolResponses: unmatchedResponses.length > 0
    }
  };
}

/**
 * Aggregate responses from multiple chunks into a single OpenAI-compatible response
 * @param {Array<Object>} chunkResponses - Array of responses from processed chunks
 * @param {string} model - Model name for the aggregated response
 * @returns {Object} Aggregated OpenAI-compatible response
 */
function aggregateChunkResponses(chunkResponses, model = 'gemini-pro') {
  if (!chunkResponses || chunkResponses.length === 0) {
    throw new Error('Cannot aggregate empty chunk responses');
  }
  
  // Handle single chunk case
  if (chunkResponses.length === 1) {
    return chunkResponses[0];
  }
  
  // Aggregate multiple chunks
  const firstResponse = chunkResponses[0];
  const aggregatedContent = chunkResponses
    .map(response => response.choices?.[0]?.message?.content || '')
    .filter(content => content.length > 0)
    .join('');
  
  // Aggregate usage statistics
  const totalUsage = {
    prompt_tokens: chunkResponses.reduce((sum, r) => sum + (r.usage?.prompt_tokens || 0), 0),
    completion_tokens: chunkResponses.reduce((sum, r) => sum + (r.usage?.completion_tokens || 0), 0),
    total_tokens: chunkResponses.reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0)
  };
  
  // Check if any chunk has tool calls
  const allToolCalls = [];
  for (const response of chunkResponses) {
    const toolCalls = response.choices?.[0]?.message?.tool_calls;
    if (toolCalls && Array.isArray(toolCalls)) {
      allToolCalls.push(...toolCalls);
    }
  }
  
  // Build aggregated response
  const aggregatedResponse = {
    id: firstResponse.id || generateResponseId(),
    object: 'chat.completion',
    created: firstResponse.created || Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: aggregatedContent
      },
      finish_reason: 'stop'
    }],
    usage: totalUsage,
    _chunked: {
      chunkCount: chunkResponses.length,
      aggregated: true
    }
  };
  
  // Add tool calls if present
  if (allToolCalls.length > 0) {
    aggregatedResponse.choices[0].message.tool_calls = allToolCalls;
  }
  
  return aggregatedResponse;
}

/**
 * Generate a unique response ID for aggregated responses
 * @returns {string} Unique response ID
 */
function generateResponseId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `chatcmpl-chunked-${timestamp}${random}`;
}

/**
 * Validate chunking configuration
 * @param {ChunkingConfig} config - Configuration to validate
 * @returns {Object} Validation result with any errors
 */
function validateChunkingConfig(config) {
  const errors = [];
  const warnings = [];
  
  if (typeof config.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }
  
  if (!Number.isInteger(config.maxSizeBytes) || config.maxSizeBytes <= 0) {
    errors.push('maxSizeBytes must be a positive integer');
  }
  
  if (!Number.isInteger(config.maxLines) || config.maxLines <= 0) {
    errors.push('maxLines must be a positive integer');
  }
  
  if (!Number.isInteger(config.maxTokens) || config.maxTokens <= 0) {
    errors.push('maxTokens must be a positive integer');
  }
  
  if (!Number.isInteger(config.batchSize) || config.batchSize <= 0) {
    errors.push('batchSize must be a positive integer');
  }
  
  if (!Number.isInteger(config.overlapLines) || config.overlapLines < 0) {
    errors.push('overlapLines must be a non-negative integer');
  }
  
  const validStrategies = ['line-based', 'token-based', 'size-based'];
  if (!validStrategies.includes(config.strategy)) {
    errors.push(`strategy must be one of: ${validStrategies.join(', ')}`);
  }
  
  // Warnings for potentially problematic configurations
  if (config.overlapLines >= config.maxLines) {
    warnings.push('overlapLines should be less than maxLines to avoid infinite loops');
  }
  
  if (config.maxSizeBytes > 50 * 1024 * 1024) { // 50MB
    warnings.push('maxSizeBytes above 50MB may cause memory issues');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export {
  DEFAULT_CHUNKING_CONFIG,
  estimateTokens,
  countLines,
  analyzeRequestSize,
  shouldChunkRequest,
  chunkTextByLines,
  chunkTextBySize,
  createChunksFromMessages,
  aggregateChunkResponses,
  validateChunkingConfig,
  extractTextFromMessage,
  wouldBreakToolSequence
};