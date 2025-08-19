import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ErrorHandler } from '../src/error-handler.js';
import { Logger } from '../src/logger.js';

describe('ErrorHandler', () => {
  test('should create error handler instance', () => {
    const logger = new Logger();
    const errorHandler = new ErrorHandler(logger);
    assert(errorHandler instanceof ErrorHandler);
  });

  test('should handle authentication errors', () => {
    const logger = new Logger();
    const errorHandler = new ErrorHandler(logger);
    
    let statusCode;
    let responseData;
    
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      json: (data) => {
        responseData = data;
        return data;
      }
    };
    
    const authError = new Error('Token refresh failed: invalid_grant');
    authError.statusCode = 401;
    
    errorHandler.handleError(authError, mockRes);
    
    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseData.error.type, 'authentication_expired');
    assert(responseData.error.details.includes('qwen auth'));
  });

  test('should handle validation errors', () => {
    const logger = new Logger();
    const errorHandler = new ErrorHandler(logger);
    
    let statusCode;
    let responseData;
    
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      json: (data) => {
        responseData = data;
        return data;
      }
    };
    
    const validationError = new Error('Invalid request: messages must be an array');
    
    errorHandler.handleError(validationError, mockRes);
    
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(responseData.error.type, 'validation_error');
    assert(responseData.error.examples);
  });

  test('should handle API errors with status codes', () => {
    const logger = new Logger();
    const errorHandler = new ErrorHandler(logger);
    
    let statusCode;
    let responseData;
    
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      json: (data) => {
        responseData = data;
        return data;
      }
    };
    
    const apiError = new Error('Rate limit exceeded');
    apiError.statusCode = 429;
    
    errorHandler.handleError(apiError, mockRes);
    
    assert.strictEqual(statusCode, 429);
    assert.strictEqual(responseData.error.type, 'rate_limit_exceeded');
  });

  test('should create async handler wrapper', () => {
    const logger = new Logger();
    const errorHandler = new ErrorHandler(logger);
    
    const asyncFn = async (req, res) => {
      throw new Error('Test error');
    };
    
    const wrappedFn = errorHandler.asyncHandler(asyncFn);
    assert(typeof wrappedFn === 'function');
  });
});