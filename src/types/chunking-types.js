/**
 * Type definitions for chunking functionality
 * Using JSDoc comments for TypeScript-style type checking and documentation
 */

/**
 * Configuration for chunking behavior
 * @typedef {Object} ChunkingConfig
 * @property {boolean} enabled - Whether chunking is enabled
 * @property {number} maxSizeBytes - Maximum size in bytes before chunking (default: 15MB)
 * @property {number} maxLines - Maximum number of lines before chunking (default: 1500)
 * @property {number} maxTokens - Maximum estimated tokens before chunking (default: 30000)
 * @property {number} batchSize - Number of chunks to process in parallel (default: 1)
 * @property {number} overlapLines - Lines to overlap between chunks for context (default: 50)
 * @property {('line-based'|'token-based'|'size-based')} strategy - Chunking strategy
 */

/**
 * Metadata for a single chunk
 * @typedef {Object} ChunkMetadata
 * @property {number} originalPosition - Position in original content (line/byte based on strategy)
 * @property {number} sizeBytes - Size of chunk content in bytes
 * @property {number} lineCount - Number of lines in chunk
 * @property {number} tokenEstimate - Estimated token count for chunk
 * @property {number} [startLine] - Starting line number (for line-based chunking)
 * @property {number} [endLine] - Ending line number (for line-based chunking)
 * @property {number} [startByte] - Starting byte position (for size-based chunking)
 * @property {number} [endByte] - Ending byte position (for size-based chunking)
 * @property {number} [messageCount] - Number of messages in chunk (for message chunking)
 * @property {string} [firstMessageRole] - Role of first message (for message chunking)
 * @property {string} [lastMessageRole] - Role of last message (for message chunking)
 * @property {number} [originalMessageIndex] - Index in original message array
 * @property {number} [chunkIndex] - Index within chunked message
 * @property {boolean} [isChunked] - Whether this represents a chunked message
 */

/**
 * A single chunk of content with metadata
 * @typedef {Object} Chunk
 * @property {string} id - Unique identifier for the chunk
 * @property {number} index - Index of chunk in sequence (0-based)
 * @property {any} content - Chunk content (text, messages, etc.)
 * @property {ChunkMetadata} metadata - Metadata about the chunk
 */

/**
 * A request that has been split into chunks
 * @typedef {Object} ChunkedRequest
 * @property {Chunk[]} chunks - Array of content chunks
 * @property {any} originalRequest - Original request before chunking
 * @property {ChunkingConfig} config - Configuration used for chunking
 * @property {RequestSizeAnalysis} analysis - Size analysis of original request
 */

/**
 * Result of analyzing request size and complexity
 * @typedef {Object} RequestSizeAnalysis
 * @property {number} sizeBytes - Total size in bytes
 * @property {number} lineCount - Total number of lines
 * @property {number} tokenEstimate - Estimated total token count
 * @property {number} messageCount - Number of messages (if applicable)
 * @property {boolean} needsChunking - Whether chunking is required
 * @property {string[]} exceedsLimits - Which limits are exceeded
 */

/**
 * Configuration validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether configuration is valid
 * @property {string[]} errors - Array of validation errors
 * @property {string[]} warnings - Array of validation warnings
 */

/**
 * Response aggregation metadata
 * @typedef {Object} AggregationMetadata
 * @property {number} chunkCount - Number of chunks that were aggregated
 * @property {boolean} aggregated - Whether this response was aggregated from chunks
 * @property {number} totalProcessingTime - Total time to process all chunks (optional)
 * @property {string[]} chunkIds - IDs of chunks that were processed
 */

/**
 * Chunked response with aggregation metadata
 * @typedef {Object} ChunkedResponse
 * @property {string} id - Response ID
 * @property {string} object - Response object type
 * @property {number} created - Creation timestamp
 * @property {string} model - Model used for generation
 * @property {Array} choices - Response choices
 * @property {Object} usage - Token usage statistics
 * @property {AggregationMetadata} _chunked - Chunking metadata
 */

/**
 * Chunk processing options
 * @typedef {Object} ChunkProcessingOptions
 * @property {boolean} sequential - Process chunks sequentially vs in parallel
 * @property {number} concurrency - Maximum concurrent chunk processing (if not sequential)
 * @property {boolean} preserveContext - Whether to preserve context between chunks
 * @property {boolean} aggregateResponses - Whether to aggregate chunk responses
 * @property {number} timeoutPerChunk - Timeout for individual chunk processing (ms)
 * @property {boolean} failFast - Stop processing on first chunk failure
 */

/**
 * Chunk processing result
 * @typedef {Object} ChunkProcessingResult
 * @property {boolean} success - Whether processing succeeded
 * @property {ChunkedResponse|any} response - Final response (aggregated or single)
 * @property {number} chunksProcessed - Number of chunks successfully processed
 * @property {number} chunksFailed - Number of chunks that failed
 * @property {Error[]} errors - Array of errors encountered during processing
 * @property {number} processingTime - Total processing time in milliseconds
 * @property {Object} statistics - Processing statistics
 */

/**
 * Chunking strategy configuration
 * @typedef {Object} ChunkingStrategy
 * @property {string} name - Strategy name
 * @property {function} shouldChunk - Function to determine if chunking is needed
 * @property {function} createChunks - Function to create chunks from content
 * @property {function} processChunk - Function to process individual chunks
 * @property {function} aggregateResults - Function to aggregate chunk results
 */

/**
 * Content analysis result for chunking decisions
 * @typedef {Object} ContentAnalysis
 * @property {string} contentType - Type of content (text, messages, mixed)
 * @property {number} complexity - Complexity score for chunking decisions
 * @property {string[]} boundaries - Natural breaking points in content
 * @property {boolean} hasToolCalls - Whether content includes tool calls
 * @property {boolean} hasLargeBlocks - Whether content has large continuous blocks
 * @property {string} recommendedStrategy - Recommended chunking strategy
 */

// Export type definitions for use in other modules
export const ChunkingTypes = {
  // Configuration types
  ChunkingConfig: 'ChunkingConfig',
  ValidationResult: 'ValidationResult',
  ChunkingStrategy: 'ChunkingStrategy',
  ChunkProcessingOptions: 'ChunkProcessingOptions',
  
  // Content types
  Chunk: 'Chunk',
  ChunkMetadata: 'ChunkMetadata',
  ChunkedRequest: 'ChunkedRequest',
  ContentAnalysis: 'ContentAnalysis',
  
  // Analysis types
  RequestSizeAnalysis: 'RequestSizeAnalysis',
  
  // Response types
  ChunkedResponse: 'ChunkedResponse',
  AggregationMetadata: 'AggregationMetadata',
  ChunkProcessingResult: 'ChunkProcessingResult'
};

// Default configurations for different chunking strategies
export const CHUNKING_STRATEGIES = {
  LINE_BASED: {
    name: 'line-based',
    maxLines: 1500,
    overlapLines: 50,
    preferredFor: ['code', 'structured-text', 'logs']
  },
  
  SIZE_BASED: {
    name: 'size-based',
    maxSizeBytes: 15 * 1024 * 1024, // 15MB
    overlapPercent: 0.05, // 5% overlap
    preferredFor: ['binary', 'mixed-content', 'large-files']
  },
  
  TOKEN_BASED: {
    name: 'token-based',
    maxTokens: 30000,
    overlapTokens: 1000,
    preferredFor: ['natural-language', 'chat', 'documentation']
  }
};

// Validation constants
export const CHUNKING_LIMITS = {
  MIN_CHUNK_SIZE: 1000, // Minimum chunk size to be useful
  MAX_CHUNK_SIZE: 50 * 1024 * 1024, // 50MB absolute maximum
  MIN_OVERLAP: 0,
  MAX_OVERLAP_PERCENT: 0.5, // 50% maximum overlap
  MAX_CHUNKS_PER_REQUEST: 100, // Maximum chunks per request
  DEFAULT_TIMEOUT_PER_CHUNK: 60000, // 60 seconds per chunk
  MAX_CONCURRENT_CHUNKS: 5 // Maximum concurrent chunk processing
};

// Error codes for chunking operations
export const CHUNKING_ERROR_CODES = {
  INVALID_CONFIG: 'CHUNKING_INVALID_CONFIG',
  CONTENT_TOO_LARGE: 'CHUNKING_CONTENT_TOO_LARGE',
  CHUNK_PROCESSING_FAILED: 'CHUNKING_CHUNK_PROCESSING_FAILED',
  AGGREGATION_FAILED: 'CHUNKING_AGGREGATION_FAILED',
  TIMEOUT_EXCEEDED: 'CHUNKING_TIMEOUT_EXCEEDED',
  INVALID_CONTENT_TYPE: 'CHUNKING_INVALID_CONTENT_TYPE'
};