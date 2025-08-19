export class Logger {
  constructor(level = 'info', format = 'console') {
    this.level = level;
    this.format = format; // 'console' or 'json'
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    
    // Basic console logging for Phase 1
    // Will be enhanced to structured JSON logging in Phase 2
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...metadata
    };

    return logEntry;
  }

  log(level, message, metadata = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatMessage(level, message, metadata);
    
    if (this.format === 'json') {
      // Phase 2: Structured JSON logging
      console.log(JSON.stringify(logEntry));
    } else {
      // Phase 1: Human-readable console logging
      const output = `[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}`;
      
      if (Object.keys(metadata).length > 0) {
        console.log(output, metadata);
      } else {
        console.log(output);
      }
    }
  }

  error(message, metadata = {}) {
    this.log('error', message, metadata);
  }

  warn(message, metadata = {}) {
    this.log('warn', message, metadata);
  }

  info(message, metadata = {}) {
    this.log('info', message, metadata);
  }

  debug(message, metadata = {}) {
    this.log('debug', message, metadata);
  }

  // Security-focused logging - never log sensitive data
  logRequest(method, path, metadata = {}) {
    // F-4.1: Structured logs for key events
    const sanitizedMetadata = { ...metadata };
    
    // Remove any potential sensitive data
    delete sanitizedMetadata.authorization;
    delete sanitizedMetadata.token;
    delete sanitizedMetadata.access_token;
    delete sanitizedMetadata.refresh_token;
    
    this.info(`${method} ${path}`, sanitizedMetadata);
  }

  logTokenRefresh(success, metadata = {}) {
    // F-4.1: Log successful token refresh (without token values)
    const sanitizedMetadata = { ...metadata };
    
    // Never log actual token values
    delete sanitizedMetadata.access_token;
    delete sanitizedMetadata.refresh_token;
    
    if (success) {
      this.info('Token refreshed successfully', sanitizedMetadata);
    } else {
      this.error('Token refresh failed', sanitizedMetadata);
    }
  }

  logServerEvent(event, metadata = {}) {
    // F-4.1: Log server start/stop and other key events
    this.info(`Server ${event}`, metadata);
  }

  logApiCall(success, metadata = {}) {
    // F-4.1: Log successful API request proxying
    const sanitizedMetadata = { ...metadata };
    
    // Remove sensitive data
    delete sanitizedMetadata.authorization;
    delete sanitizedMetadata.token;
    
    if (success) {
      this.info('API request proxied successfully', sanitizedMetadata);
    } else {
      this.error('API request failed', sanitizedMetadata);
    }
  }

  // Fatal error logging for unrecoverable errors
  logFatalError(message, metadata = {}) {
    // F-4.3: Fatal error handling for unrecoverable auth errors
    this.error(`FATAL: ${message}`, metadata);
    
    // Also output to stderr for visibility
    console.error('\n' + '='.repeat(80));
    console.error('FATAL ERROR - IMMEDIATE ACTION REQUIRED');
    console.error('='.repeat(80));
    console.error(message);
    if (Object.keys(metadata).length > 0) {
      console.error('Details:', metadata);
    }
    console.error('='.repeat(80) + '\n');
  }
}