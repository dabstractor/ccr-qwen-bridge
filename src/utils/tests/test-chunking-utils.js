/**
 * Unit tests for chunking utilities
 * Tests core functionality for handling large requests
 */

import assert from 'assert';
import {
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
  wouldBreakToolSequence,
  DEFAULT_CHUNKING_CONFIG
} from '../chunking-utils.js';

// Test data
const SMALL_TEXT = "Hello, world!\nThis is a small text.";
const LARGE_TEXT = "Line 1\n".repeat(2000) + "Final line";
const VERY_LARGE_TEXT = "x".repeat(20 * 1024 * 1024); // 20MB

const SMALL_MESSAGES = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
];

const LARGE_MESSAGES = Array.from({ length: 100 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `Message ${i}: ${"Lorem ipsum ".repeat(50)}`
}));

// Test estimateTokens function
console.log('Testing estimateTokens...');
assert.strictEqual(estimateTokens(''), 0, 'Empty string should return 0 tokens');
assert.strictEqual(estimateTokens('test'), 1, 'Short string should return 1 token');
assert.strictEqual(estimateTokens('1234567890'), 3, '10 chars should return ~3 tokens');
assert.strictEqual(estimateTokens('12345678901234567890'), 5, '20 chars should return 5 tokens');
console.log('✅ estimateTokens tests passed');

// Test countLines function
console.log('Testing countLines...');
assert.strictEqual(countLines(''), 0, 'Empty string should return 0 lines');
assert.strictEqual(countLines('single line'), 1, 'Single line should return 1');
assert.strictEqual(countLines('line 1\nline 2'), 2, 'Two lines should return 2');
assert.strictEqual(countLines('line 1\nline 2\nline 3'), 3, 'Three lines should return 3');
console.log('✅ countLines tests passed');

// Test analyzeRequestSize function
console.log('Testing analyzeRequestSize...');
const sampleRequest = {
  contents: [
    {
      parts: [
        { text: 'Hello world' }
      ]
    },
    {
      parts: [
        { text: 'Line 1\nLine 2' }
      ]
    }
  ]
};

const analysis = analyzeRequestSize(sampleRequest);
assert.ok(analysis.sizeBytes > 0, 'Should return positive size');
assert.ok(analysis.lineCount > 0, 'Should return positive line count');
assert.ok(analysis.tokenEstimate > 0, 'Should return positive token estimate');

// Test with empty request
const emptyAnalysis = analyzeRequestSize({});
assert.strictEqual(emptyAnalysis.sizeBytes, 0, 'Empty request should return 0 size');
console.log('✅ analyzeRequestSize tests passed');

// Test shouldChunkRequest function
console.log('Testing shouldChunkRequest...');
const smallRequest = {
  contents: [{ parts: [{ text: SMALL_TEXT }] }]
};

const largeRequest = {
  contents: [{ parts: [{ text: LARGE_TEXT }] }]
};

assert.strictEqual(shouldChunkRequest(smallRequest, DEFAULT_CHUNKING_CONFIG), false, 'Small request should not need chunking');
assert.strictEqual(shouldChunkRequest(largeRequest, DEFAULT_CHUNKING_CONFIG), true, 'Large request should need chunking');

// Test with disabled chunking
const disabledConfig = { ...DEFAULT_CHUNKING_CONFIG, enabled: false };
assert.strictEqual(shouldChunkRequest(largeRequest, disabledConfig), false, 'Should not chunk when disabled');
console.log('✅ shouldChunkRequest tests passed');

// Test chunkTextByLines function
console.log('Testing chunkTextByLines...');
const lineChunks = chunkTextByLines(LARGE_TEXT, { ...DEFAULT_CHUNKING_CONFIG, maxLines: 100 });
assert.ok(lineChunks.length > 1, 'Should create multiple chunks for large text');
assert.ok(lineChunks.every(chunk => chunk.metadata.lineCount <= 100), 'All chunks should respect line limit');
assert.ok(lineChunks.every(chunk => chunk.id && chunk.id.startsWith('chunk_')), 'All chunks should have proper IDs');

// Test empty text
const emptyChunks = chunkTextByLines('', DEFAULT_CHUNKING_CONFIG);
assert.strictEqual(emptyChunks.length, 0, 'Empty text should return no chunks');
console.log('✅ chunkTextByLines tests passed');

// Test chunkTextBySize function
console.log('Testing chunkTextBySize...');
const sizeChunks = chunkTextBySize(VERY_LARGE_TEXT, { ...DEFAULT_CHUNKING_CONFIG, maxSizeBytes: 1024 * 1024 });
assert.ok(sizeChunks.length > 1, 'Should create multiple chunks for large text');
assert.ok(sizeChunks.every(chunk => chunk.metadata.sizeBytes <= 1024 * 1024 * 1.1), 'All chunks should roughly respect size limit');
console.log('✅ chunkTextBySize tests passed');

// Test createChunksFromMessages function
console.log('Testing createChunksFromMessages...');
const messageChunks = createChunksFromMessages(LARGE_MESSAGES, { ...DEFAULT_CHUNKING_CONFIG, maxLines: 50 });
assert.ok(messageChunks.length > 0, 'Should create chunks from messages');
assert.ok(messageChunks.every(chunk => Array.isArray(chunk.content)), 'All chunks should contain message arrays');
assert.ok(messageChunks.every(chunk => chunk.metadata.messageCount > 0), 'All chunks should have message count');

// Test empty messages
const emptyMessageChunks = createChunksFromMessages([], DEFAULT_CHUNKING_CONFIG);
assert.strictEqual(emptyMessageChunks.length, 0, 'Empty messages should return no chunks');
console.log('✅ createChunksFromMessages tests passed');

// Test extractTextFromMessage function
console.log('Testing extractTextFromMessage...');
assert.strictEqual(extractTextFromMessage({ content: 'test' }), 'test', 'Should extract string content');
assert.strictEqual(extractTextFromMessage({ content: [{ type: 'text', text: 'test' }] }), 'test', 'Should extract array content');
assert.strictEqual(extractTextFromMessage({ content: { text: 'test' } }), 'test', 'Should extract object content');
assert.strictEqual(extractTextFromMessage({}), '', 'Should return empty string for no content');
console.log('✅ extractTextFromMessage tests passed');

// Test aggregateChunkResponses function
console.log('Testing aggregateChunkResponses...');
const mockChunkResponses = [
  {
    id: 'chunk1',
    model: 'gemini-pro',
    choices: [{ message: { content: 'Response 1' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  },
  {
    id: 'chunk2',
    model: 'gemini-pro',
    choices: [{ message: { content: ' Response 2' } }],
    usage: { prompt_tokens: 8, completion_tokens: 7, total_tokens: 15 }
  }
];

const aggregated = aggregateChunkResponses(mockChunkResponses, 'gemini-pro');
assert.strictEqual(aggregated.choices[0].message.content, 'Response 1 Response 2', 'Should concatenate content');
assert.strictEqual(aggregated.usage.total_tokens, 30, 'Should sum usage tokens');
assert.ok(aggregated._chunked, 'Should mark as chunked response');
assert.strictEqual(aggregated._chunked.chunkCount, 2, 'Should track chunk count');

// Test single response (no aggregation needed)
const single = aggregateChunkResponses([mockChunkResponses[0]], 'gemini-pro');
assert.deepStrictEqual(single, mockChunkResponses[0], 'Single response should return unchanged');

// Test empty responses
try {
  aggregateChunkResponses([], 'gemini-pro');
  assert.fail('Should throw error for empty responses');
} catch (error) {
  assert.ok(error.message.includes('empty'), 'Should throw appropriate error');
}
console.log('✅ aggregateChunkResponses tests passed');

// Test validateChunkingConfig function
console.log('Testing validateChunkingConfig...');
const validConfig = { ...DEFAULT_CHUNKING_CONFIG };
const validResult = validateChunkingConfig(validConfig);
assert.strictEqual(validResult.valid, true, 'Default config should be valid');
assert.strictEqual(validResult.errors.length, 0, 'Default config should have no errors');

const invalidConfig = {
  enabled: 'not-boolean',
  maxSizeBytes: -1,
  maxLines: 0,
  maxTokens: 'invalid',
  batchSize: -5,
  overlapLines: 'invalid',
  strategy: 'invalid-strategy'
};

const invalidResult = validateChunkingConfig(invalidConfig);
assert.strictEqual(invalidResult.valid, false, 'Invalid config should be invalid');
assert.ok(invalidResult.errors.length > 0, 'Invalid config should have errors');

// Test warning conditions
const warningConfig = {
  ...DEFAULT_CHUNKING_CONFIG,
  overlapLines: 2000, // Greater than maxLines
  maxSizeBytes: 100 * 1024 * 1024 // 100MB
};

const warningResult = validateChunkingConfig(warningConfig);
assert.ok(warningResult.warnings.length > 0, 'Should generate warnings for problematic config');
console.log('✅ validateChunkingConfig tests passed');

// Integration test: Full chunking workflow
console.log('Testing full chunking workflow...');
const workflowMessages = Array.from({ length: 50 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `Message ${i}: ${"This is a longer message with more content. ".repeat(20)}`
}));

const workflowConfig = {
  ...DEFAULT_CHUNKING_CONFIG,
  maxLines: 10,
  overlapLines: 2
};

const workflowChunks = createChunksFromMessages(workflowMessages, workflowConfig);
assert.ok(workflowChunks.length > 1, 'Should create multiple chunks in workflow');

// Simulate processing responses
const workflowResponses = workflowChunks.map((chunk, index) => ({
  id: `workflow-${index}`,
  model: 'gemini-pro',
  choices: [{
    message: {
      content: `Processed chunk ${index + 1} with ${chunk.metadata.messageCount} messages`
    }
  }],
  usage: {
    prompt_tokens: chunk.metadata.tokenEstimate,
    completion_tokens: 20,
    total_tokens: chunk.metadata.tokenEstimate + 20
  }
}));

const workflowAggregated = aggregateChunkResponses(workflowResponses, 'gemini-pro');
assert.ok(workflowAggregated.choices[0].message.content.includes('chunk 1'), 'Should include first chunk response');
assert.ok(workflowAggregated.choices[0].message.content.includes(`chunk ${workflowChunks.length}`), 'Should include last chunk response');
assert.ok(workflowAggregated.usage.total_tokens > 0, 'Should have aggregated usage statistics');
console.log('✅ Full chunking workflow test passed');

// Test tool sequence preservation
console.log('Testing tool sequence preservation...');

const toolSequenceMessages = [
  { role: 'user', content: 'Please help me with a task' },
  { 
    role: 'assistant', 
    content: 'I will call a tool to help you',
    tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 'help_tool', arguments: '{"task": "test"}' } },
      { id: 'call_2', type: 'function', function: { name: 'another_tool', arguments: '{"data": "example"}' } }
    ]
  },
  { role: 'tool', tool_call_id: 'call_1', content: 'Tool 1 result: Success' },
  { role: 'tool', tool_call_id: 'call_2', content: 'Tool 2 result: Complete' },
  { role: 'assistant', content: 'Based on the tool results, here is my response' },
  { role: 'user', content: 'Thank you, that was helpful' }
];

// Test wouldBreakToolSequence function
assert.strictEqual(wouldBreakToolSequence(toolSequenceMessages, 0, []), false, 'First user message should not break sequence');
assert.strictEqual(wouldBreakToolSequence(toolSequenceMessages, 1, [toolSequenceMessages[0]]), true, 'Assistant with tool calls should break if next messages are tool responses');
assert.strictEqual(wouldBreakToolSequence(toolSequenceMessages, 2, [toolSequenceMessages[0], toolSequenceMessages[1]]), true, 'Tool response should stay with its tool call');
assert.strictEqual(wouldBreakToolSequence(toolSequenceMessages, 4, [toolSequenceMessages[0], toolSequenceMessages[1], toolSequenceMessages[2], toolSequenceMessages[3]]), false, 'Assistant after tools should not break sequence');

// Test chunking with tool sequences - should preserve the tool call/response pairs
const toolChunkConfig = { ...DEFAULT_CHUNKING_CONFIG, maxLines: 2, maxTokens: 100 }; // Very small limits to force chunking
const toolChunks = createChunksFromMessages(toolSequenceMessages, toolChunkConfig);

// Verify that tool calls and responses stay together
let foundToolCallChunk = null;
let foundToolResponseChunks = [];

for (const chunk of toolChunks) {
  const messages = chunk.content;
  
  // Find chunk with tool calls
  if (messages.some(msg => msg.role === 'assistant' && msg.tool_calls)) {
    foundToolCallChunk = chunk;
  }
  
  // Find chunks with tool responses
  if (messages.some(msg => msg.role === 'tool')) {
    foundToolResponseChunks.push(chunk);
  }
}

assert.ok(foundToolCallChunk, 'Should find chunk with tool calls');
assert.ok(foundToolResponseChunks.length > 0, 'Should find chunks with tool responses');

// Verify tool calls and responses are properly grouped
const toolCallMessages = foundToolCallChunk.content;
const assistantMessage = toolCallMessages.find(msg => msg.role === 'assistant' && msg.tool_calls);
assert.ok(assistantMessage, 'Should find assistant message with tool calls');

// Check that tool responses for this assistant are in the same chunk or immediately following chunks
const toolCallIds = assistantMessage.tool_calls.map(call => call.id);
let foundAllResponses = true;
for (const toolCallId of toolCallIds) {
  let foundResponse = false;
  
  // Check if response is in same chunk as tool call
  if (toolCallMessages.some(msg => msg.role === 'tool' && msg.tool_call_id === toolCallId)) {
    foundResponse = true;
  }
  
  if (!foundResponse) {
    foundAllResponses = false;
  }
}

// With our improved chunking logic, tool responses should stay with their calls
assert.ok(foundAllResponses, 'All tool responses should be grouped with their corresponding tool calls');

console.log('✅ Tool sequence preservation tests passed');

console.log('\n🎉 All chunking utility tests passed successfully!');
console.log(`Tested ${workflowChunks.length} chunks in integration test`);
console.log(`Aggregated response contains ${workflowAggregated.usage.total_tokens} total tokens`);
console.log(`Tool sequence test created ${toolChunks.length} chunks from ${toolSequenceMessages.length} messages`);