export class ErrorHandler {
  constructor(logger) {
    this.logger = logger;
  }

  handleAuthenticationError(error, res) {
    // F-4.3: Enhanced error handling for unrecoverable auth errors
    if (error.message.includes('FATAL:')) {
      this.logger.logFatalError('Authentication failure requires immediate action', {
        error: error.message,
        action: 'User must re-authenticate with official CLI'
      });

      return res.status(503).json({
        error: {
          message: 'Authentication service unavailable. Please re-authenticate with the official qwen-code CLI.',
          type: 'auth_unavailable',
          details: 'Run the following command to fix this issue: qwen auth',
          documentation: 'https://github.com/QwenLM/qwen-code'
        }
      });
    }

    // Handle specific auth error types
    if (error.message.includes('invalid_grant')) {
      this.logger.error('Invalid or expired refresh token', {
        error: error.message,
        solution: 'Re-authenticate with official CLI'
      });

      return res.status(401).json({
        error: {
          message: 'Your authentication has expired. Please re-authenticate with the official qwen-code CLI.',
          type: 'authentication_expired',
          details: 'Run: qwen auth',
          code: 'INVALID_REFRESH_TOKEN'
        }
      });
    }

    if (error.message.includes('access_denied')) {
      this.logger.error('Access denied by Qwen API', {
        error: error.message
      });

      return res.status(403).json({
        error: {
          message: 'Access denied. Please check your account status and re-authenticate.',
          type: 'access_denied',
          details: 'Run: qwen auth',
          code: 'ACCESS_DENIED'
        }
      });
    }

    // Generic auth error
    this.logger.error('Authentication error', {
      error: error.message
    });

    return res.status(401).json({
      error: {
        message: 'Authentication failed. Please re-authenticate with the official qwen-code CLI.',
        type: 'authentication_error',
        details: 'Run: qwen auth'
      }
    });
  }

  handleApiError(error, res) {
    const statusCode = error.statusCode || 500;

    // Rate limiting
    if (statusCode === 429) {
      this.logger.warn('Rate limit exceeded', {
        error: error.message,
        statusCode
      });

      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded. Please try again later.',
          type: 'rate_limit_exceeded',
          details: 'The Qwen API is temporarily rate limiting requests. Please wait before trying again.',
          retryAfter: error.retryAfter || '60 seconds'
        }
      });
    }

    // Network errors
    if (statusCode === 503 || error.message.includes('Network error')) {
      this.logger.error('Network connectivity issue', {
        error: error.message,
        statusCode
      });

      return res.status(503).json({
        error: {
          message: 'Unable to connect to Qwen API. Please check your internet connection.',
          type: 'network_error',
          details: 'This is usually a temporary issue. Please try again in a few moments.',
          troubleshooting: [
            'Check your internet connection',
            'Verify no firewall is blocking HTTPS requests',
            'Try again in a few minutes'
          ]
        }
      });
    }

    // Timeout errors
    if (statusCode === 504 || error.message.includes('timeout')) {
      const provider = error.provider || 'Unknown';
      this.logger.error('Request timeout', {
        provider,
        error: error.message,
        statusCode
      });

      return res.status(504).json({
        error: {
          message: 'Request timeout. The upstream API did not respond in time.',
          type: 'timeout_error',
          details: 'The request took too long to complete. This may be due to high API load.',
          suggestion: 'Try reducing the complexity of your request or try again later.'
        }
      });
    }

    // Bad Request (400)
    if (statusCode === 400) {
      this.logger.warn('Bad request to Qwen API', {
        error: error.message,
        statusCode
      });

      return res.status(400).json({
        error: {
          message: 'Invalid request format or parameters.',
          type: 'bad_request',
          details: error.message,
          documentation: 'Please check the OpenAI API documentation for proper request format.'
        }
      });
    }

    // Generic API error
    this.logger.error('API error', {
      error: error.message,
      statusCode
    });

    return res.status(statusCode).json({
      error: {
        message: error.message || 'An error occurred while processing the request',
        type: 'api_error',
        statusCode
      }
    });
  }

  handleValidationError(error, res) {
    this.logger.warn('Request validation failed', {
      error: error.message
    });

    return res.status(400).json({
      error: {
        message: error.message,
        type: 'validation_error',
        details: 'Please check your request format and ensure all required fields are present.',
        examples: {
          valid_request: {
            model: 'qwen3-coder-plus',
            messages: [
              { role: 'user', content: 'Hello, how are you?' }
            ]
          }
        }
      }
    });
  }

  handleUnknownError(error, res) {
    this.logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      type: error.constructor.name
    });

    return res.status(500).json({
      error: {
        message: 'Internal server error',
        type: 'server_error',
        details: 'An unexpected error occurred. Please try again later.',
        support: 'If this error persists, please check the server logs for more details.'
      }
    });
  }

  // Helper method to determine error type and route to appropriate handler
  handleError(error, res) {
    // Authentication errors
    if (error.message.includes('FATAL:') || 
        error.message.includes('invalid_grant') || 
        error.message.includes('access_denied') ||
        error.message.includes('Authentication') ||
        error.message.includes('authenticate')) {
      return this.handleAuthenticationError(error, res);
    }

    // Validation errors
    if (error.message.includes('Invalid request') || 
        error.message.includes('validation') ||
        error.message.includes('must be') ||
        error.message.includes('required')) {
      return this.handleValidationError(error, res);
    }

    // API errors (have statusCode)
    if (error.statusCode) {
      return this.handleApiError(error, res);
    }

    // Unknown errors
    return this.handleUnknownError(error, res);
  }

  // Middleware to wrap async route handlers with error handling
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(error => {
        this.handleError(error, res);
      });
    };
  }

  // Express error handling middleware
  errorMiddleware() {
    return (error, req, res, next) => {
      this.handleError(error, res);
    };
  }
}