import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Logger } from '../src/logger.js';
import { RequestTranslator } from '../src/request-translator.js';

describe('Logger', () => {
  test('should create logger instance', () => {
    const logger = new Logger();
    assert(logger instanceof Logger);
    assert.strictEqual(logger.level, 'info');
  });

  test('should format messages correctly', () => {
    const logger = new Logger();
    const formatted = logger.formatMessage('info', 'test message', { key: 'value' });
    
    assert(formatted.timestamp);
    assert.strictEqual(formatted.level, 'INFO');
    assert.strictEqual(formatted.message, 'test message');
    assert.strictEqual(formatted.key, 'value');
  });

  test('should filter logs by level', () => {
    const logger = new Logger('error');
    assert(logger.shouldLog('error'));
    assert(!logger.shouldLog('info'));
    assert(!logger.shouldLog('debug'));
  });
});

describe('RequestTranslator', () => {
  test('should create translator instance', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    assert(translator instanceof RequestTranslator);
  });

  test('should translate OpenAI request to Qwen format', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const openAIRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      temperature: 0.7,
      max_tokens: 100
    };

    const qwenRequest = translator.translateOpenAIToQwen(openAIRequest);
    
    assert.strictEqual(qwenRequest.model, 'gpt-4');
    assert.strictEqual(qwenRequest.messages.length, 1);
    assert.strictEqual(qwenRequest.temperature, 0.7);
    assert.strictEqual(qwenRequest.max_tokens, 100);
  });

  test('should translate Qwen response to OpenAI format', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const qwenResponse = {
      id: 'test-id',
      model: 'qwen-coder-plus',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello back!' },
          finish_reason: 'stop'
        }
      ],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
    };

    const openAIResponse = translator.translateQwenToOpenAI(qwenResponse);
    
    assert.strictEqual(openAIResponse.id, 'test-id');
    assert.strictEqual(openAIResponse.object, 'chat.completion');
    assert.strictEqual(openAIResponse.model, 'qwen-coder-plus');
    assert.strictEqual(openAIResponse.choices.length, 1);
    assert.strictEqual(openAIResponse.choices[0].message.content, 'Hello back!');
  });

  test('should validate OpenAI request format', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    // Valid request
    const validRequest = {
      messages: [{ role: 'user', content: 'Hello' }]
    };
    assert.doesNotThrow(() => translator.validateOpenAIRequest(validRequest));
    
    // Invalid request - no messages
    const invalidRequest1 = {};
    assert.throws(() => translator.validateOpenAIRequest(invalidRequest1));
    
    // Invalid request - empty messages
    const invalidRequest2 = { messages: [] };
    assert.throws(() => translator.validateOpenAIRequest(invalidRequest2));
    
    // Invalid request - invalid role
    const invalidRequest3 = {
      messages: [{ role: 'invalid', content: 'Hello' }]
    };
    assert.throws(() => translator.validateOpenAIRequest(invalidRequest3));
    
    // Valid request - assistant message with empty content (should be allowed)
    const validRequestEmptyAssistant = {
      messages: [
        { role: 'user', content: 'Search for docs' },
        { role: 'assistant', content: null }  // Empty content should be allowed for assistant
      ]
    };
    assert.doesNotThrow(() => translator.validateOpenAIRequest(validRequestEmptyAssistant));
    
    // Invalid request - user message with empty content (should fail)
    const invalidRequestEmptyUser = {
      messages: [{ role: 'user', content: null }]
    };
    assert.throws(() => translator.validateOpenAIRequest(invalidRequestEmptyUser));
    
    // Valid request - tool message with empty content (should be allowed)
    const validRequestEmptyTool = {
      messages: [
        { role: 'assistant', tool_calls: [{ id: 'test', function: { name: 'search' } }] },
        { role: 'tool', tool_call_id: 'test', content: '' }  // Empty content allowed for tool
      ]
    };
    assert.doesNotThrow(() => translator.validateOpenAIRequest(validRequestEmptyTool));
  });

  test('should generate unique IDs', () => {
    const logger = new Logger();
    const translator = new RequestTranslator(logger);
    
    const id1 = translator.generateId();
    const id2 = translator.generateId();
    
    assert(id1.startsWith('chatcmpl-'));
    assert(id2.startsWith('chatcmpl-'));
    assert.notStrictEqual(id1, id2);
  });
});