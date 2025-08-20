/**
 * Integration tests for Gemini translator with chunking functionality
 * Tests the integration of chunking with Gemini API translation
 */

import assert from 'assert';
import { GeminiTranslator } from '../gemini-translator.js';

// Mock logger for testing
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

// Test chunking configuration
const testChunkingConfig = {
  enabled: true,
  maxSizeBytes: 1024, // Small size for testing
  maxLines: 10,
  maxTokens: 100,
  batchSize: 1,
  overlapLines: 2,
  strategy: 'line-based'
};

// Create translator instance for testing
const translator = new GeminiTranslator(
  mockLogger,
  'https://generativelanguage.googleapis.com/v1beta',
  30000,
  testChunkingConfig
);

// Test data
const smallOpenAIRequest = {
  model: 'gemini-pro',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
  ]
};

const largeOpenAIRequest = {
  model: 'gemini-pro',
  messages: Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}: ${"This is a long message that will help test chunking functionality. ".repeat(5)}`
  }))
};

// Test constructor initialization
console.log('Testing GeminiTranslator constructor...');
assert.ok(translator.chunkingConfig, 'Should initialize with chunking config');
assert.strictEqual(translator.chunkingConfig.enabled, true, 'Chunking should be enabled');
assert.strictEqual(translator.chunkingConfig.maxLines, 10, 'Should use provided maxLines');
console.log('✅ Constructor tests passed');

// Test translateOpenAIToProvider with small request
console.log('Testing translateOpenAIToProvider with small request...');
const smallTranslated = translator.translateOpenAIToProvider(smallOpenAIRequest);
assert.ok(smallTranslated.model, 'Should have model');
assert.ok(smallTranslated.request, 'Should have request');
assert.ok(smallTranslated.request.contents, 'Should have contents');
assert.strictEqual(smallTranslated.stream, false, 'Should default to non-streaming');
console.log('✅ Small request translation tests passed');

// Test translateOpenAIToProvider with large request
console.log('Testing translateOpenAIToProvider with large request...');
const largeTranslated = translator.translateOpenAIToProvider(largeOpenAIRequest);
assert.ok(largeTranslated.model, 'Should have model');
assert.ok(largeTranslated.request, 'Should have request');
assert.ok(largeTranslated.request.contents, 'Should have contents');
assert.ok(largeTranslated.request.contents.length <= largeOpenAIRequest.messages.length, 'Should not expand content unnecessarily');
console.log('✅ Large request translation tests passed');

// Test chunking decision logic (would need shouldChunkRequest to be exposed)
console.log('Testing chunking decision logic...');

// Create a request that should trigger chunking based on our test config
const chunkableRequest = {
  contents: Array.from({ length: 15 }, (_, i) => ({
    role: 'user',
    parts: [{ text: `Line ${i}\nAnother line ${i}` }]
  }))
};

// We can't directly test shouldChunkRequest since it's not exposed, 
// but we can test the overall behavior through forwardToProviderAPI
// (though that would require mocking the actual API calls)

console.log('✅ Chunking decision logic tests completed (limited without API mocking)');

// Test message transformation for chunking
console.log('Testing message transformation for chunking...');
const messagesWithTools = [
  { role: 'user', content: 'Test message' },
  { 
    role: 'assistant', 
    content: 'I will call a tool',
    tool_calls: [{
      id: 'call_123',
      type: 'function',
      function: { name: 'test_tool', arguments: '{"param": "value"}' }
    }]
  },
  { 
    role: 'tool', 
    tool_call_id: 'call_123',
    content: 'Tool result' 
  }
];

const toolTranslated = translator.translateOpenAIToProvider({
  model: 'gemini-pro',
  messages: messagesWithTools,
  tools: [{
    type: 'function',
    function: {
      name: 'test_tool',
      description: 'Test tool',
      parameters: {
        type: 'object',
        properties: { param: { type: 'string' } },
        required: ['param']
      }
    }
  }]
});

assert.ok(toolTranslated.request.contents, 'Should transform messages with tools');
assert.ok(toolTranslated.request.tools, 'Should include tool definitions');
console.log('✅ Tool message transformation tests passed');

// Test response translation (Gemini to OpenAI)
console.log('Testing response translation...');
const mockGeminiResponse = {
  candidates: [{
    content: {
      parts: [{ text: 'Test response from Gemini' }],
      role: 'model'
    },
    finishReason: 'STOP'
  }],
  usageMetadata: {
    promptTokenCount: 10,
    candidatesTokenCount: 8,
    totalTokenCount: 18
  }
};

const translatedResponse = translator.translateProviderToOpenAI(mockGeminiResponse);
assert.strictEqual(translatedResponse.object, 'chat.completion', 'Should have correct object type');
assert.ok(translatedResponse.choices, 'Should have choices');
assert.ok(translatedResponse.choices[0].message.content.includes('Test response'), 'Should preserve content');
assert.strictEqual(translatedResponse.usage.total_tokens, 18, 'Should preserve usage data');
console.log('✅ Response translation tests passed');

// Test streaming chunk processing
console.log('Testing streaming chunk processing...');
const sseChunk = 'data: {"candidates": [{"content": {"parts": [{"text": "Streaming response"}]}}]}';
const processedChunk = translator.processStreamingChunk(sseChunk);
assert.ok(processedChunk.includes('data:'), 'Should maintain SSE format');
assert.ok(processedChunk.includes('chat.completion.chunk'), 'Should convert to OpenAI streaming format');

// Test malformed chunk handling
const malformedChunk = 'data: {"incomplete": "json"';
const processedMalformed = translator.processStreamingChunk(malformedChunk);
assert.strictEqual(processedMalformed, '', 'Should skip malformed chunks');
console.log('✅ Streaming chunk processing tests passed');

// Test configuration validation
console.log('Testing configuration validation...');
const invalidConfigTranslator = new GeminiTranslator(
  mockLogger,
  'https://generativelanguage.googleapis.com/v1beta',
  30000,
  {
    enabled: 'invalid',
    maxSizeBytes: -1,
    maxLines: 'invalid'
  }
);

// Should fall back to default config due to validation failure
assert.ok(invalidConfigTranslator.chunkingConfig, 'Should have chunking config after validation');
assert.strictEqual(typeof invalidConfigTranslator.chunkingConfig.enabled, 'boolean', 'Should use valid config after validation');
console.log('✅ Configuration validation tests passed');

// Integration test: simulate chunked request processing workflow
console.log('Testing chunked request processing workflow...');

// This test simulates what would happen with a large request
// but doesn't actually make API calls (would need mocking for full integration)
const workflowMessages = Array.from({ length: 25 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `Workflow message ${i}: ${"Long content to trigger chunking. ".repeat(10)}`
}));

const workflowRequest = translator.translateOpenAIToProvider({
  model: 'gemini-pro',
  messages: workflowMessages
});

assert.ok(workflowRequest.request.contents, 'Should translate large request');
assert.ok(workflowRequest.request.contents.length > 0, 'Should have content to process');

// The actual chunking would happen in forwardToProviderAPI, but testing that
// requires mocking the Gemini API, which is beyond the scope of unit tests
console.log('✅ Chunked request processing workflow tests completed');

// Test edge cases
console.log('Testing edge cases...');

// Empty messages
const emptyTranslated = translator.translateOpenAIToProvider({
  model: 'gemini-pro',
  messages: []
});
assert.ok(emptyTranslated.request.contents, 'Should handle empty messages');

// Messages with no content
const noContentMessages = [
  { role: 'user', content: '' },
  { role: 'assistant' }
];
const noContentTranslated = translator.translateOpenAIToProvider({
  model: 'gemini-pro',
  messages: noContentMessages
});
assert.ok(noContentTranslated.request.contents, 'Should handle messages with no content');

// Very long single message (should be handled by text chunking within the message)
const veryLongMessage = [{
  role: 'user',
  content: "Very long message content. ".repeat(1000)
}];
const longMessageTranslated = translator.translateOpenAIToProvider({
  model: 'gemini-pro',
  messages: veryLongMessage
});
assert.ok(longMessageTranslated.request.contents, 'Should handle very long single messages');

console.log('✅ Edge case tests passed');

// Test utility methods
console.log('Testing utility methods...');

// Test ID generation
const id1 = translator.generateId();
const id2 = translator.generateId();
assert.ok(id1.startsWith('chatcmpl-'), 'Should generate OpenAI-style ID');
assert.notStrictEqual(id1, id2, 'Should generate unique IDs');

// Test role mapping
assert.strictEqual(translator.mapRoleToGemini('user'), 'user', 'Should map user role correctly');
assert.strictEqual(translator.mapRoleToGemini('assistant'), 'model', 'Should map assistant role to model');
assert.strictEqual(translator.mapRoleToGemini('system'), 'user', 'Should map system role to user');

assert.strictEqual(translator.mapRoleFromGemini('model'), 'assistant', 'Should map model role to assistant');
assert.strictEqual(translator.mapRoleFromGemini('user'), 'user', 'Should map user role correctly');

// Test finish reason mapping
assert.strictEqual(translator.mapFinishReason('STOP'), 'stop', 'Should map STOP reason');
assert.strictEqual(translator.mapFinishReason('MAX_TOKENS'), 'length', 'Should map MAX_TOKENS reason');
assert.strictEqual(translator.mapFinishReason('SAFETY'), 'content_filter', 'Should map SAFETY reason');

console.log('✅ Utility method tests passed');

console.log('\n🎉 All Gemini translator integration tests passed successfully!');
console.log(`Tested with chunking config: maxLines=${testChunkingConfig.maxLines}, maxSizeBytes=${testChunkingConfig.maxSizeBytes}`);
console.log('Note: Full chunking integration requires API mocking for complete testing');