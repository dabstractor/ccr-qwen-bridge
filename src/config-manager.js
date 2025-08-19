import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { config } from 'dotenv';

export class ConfigManager {
  constructor(logger) {
    this.logger = logger;
    this.config = {};
    this.configLoaded = false;
  }

  async initialize() {
    try {
      // Load .env file if it exists
      await this.loadDotEnv();
      
      // Build configuration with precedence: Environment variables > Config file > Defaults
      this.config = this.buildConfig();
      
      this.configLoaded = true;
      this.logger.info('Configuration loaded successfully', {
        host: this.config.HOST,
        port: this.config.PORT,
        logLevel: this.config.LOG_LEVEL,
        credentialsPath: this.config.CREDENTIALS_FILE_PATH
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize configuration', {
        error: error.message
      });
      throw error;
    }
  }

  async loadDotEnv() {
    try {
      // Check if .env file exists
      const envPath = path.resolve('.env');
      await fs.access(envPath);
      
      // Load .env file
      config({ path: envPath });
      this.logger.info('Loaded configuration from .env file', { path: envPath });
      
    } catch (error) {
      // .env file doesn't exist or can't be read - this is OK
      this.logger.debug('No .env file found, using environment variables and defaults');
    }
  }

  buildConfig() {
    // Default configuration values
    const defaults = {
      HOST: 'localhost',
      PORT: 31337,
      CREDENTIALS_FILE_PATH: '~/.qwen/oauth_creds.json',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'console', // 'console' or 'json'
      REQUEST_TIMEOUT: 30000, // 30 seconds
      QWEN_API_BASE_URL: null // Will be determined from token response
    };

    // Build final configuration with precedence
    const finalConfig = {};
    
    for (const [key, defaultValue] of Object.entries(defaults)) {
      finalConfig[key] = this.getConfigValue(key, defaultValue);
    }

    // Type conversions
    finalConfig.PORT = parseInt(finalConfig.PORT);
    finalConfig.REQUEST_TIMEOUT = parseInt(finalConfig.REQUEST_TIMEOUT);

    // Validation
    this.validateConfig(finalConfig);

    return finalConfig;
  }

  getConfigValue(key, defaultValue) {
    // Precedence: Environment variable > default value
    return process.env[key] || defaultValue;
  }

  validateConfig(config) {
    // Validate port
    if (isNaN(config.PORT) || config.PORT < 1 || config.PORT > 65535) {
      throw new Error(`Invalid PORT value: ${config.PORT}. Must be a number between 1 and 65535.`);
    }

    // Validate host
    if (!config.HOST || typeof config.HOST !== 'string') {
      throw new Error(`Invalid HOST value: ${config.HOST}. Must be a non-empty string.`);
    }

    // Validate log level
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(config.LOG_LEVEL)) {
      throw new Error(`Invalid LOG_LEVEL value: ${config.LOG_LEVEL}. Must be one of: ${validLogLevels.join(', ')}`);
    }

    // Validate log format
    const validLogFormats = ['console', 'json'];
    if (!validLogFormats.includes(config.LOG_FORMAT)) {
      throw new Error(`Invalid LOG_FORMAT value: ${config.LOG_FORMAT}. Must be one of: ${validLogFormats.join(', ')}`);
    }

    // Validate timeout
    if (isNaN(config.REQUEST_TIMEOUT) || config.REQUEST_TIMEOUT < 1000) {
      throw new Error(`Invalid REQUEST_TIMEOUT value: ${config.REQUEST_TIMEOUT}. Must be a number >= 1000 milliseconds.`);
    }

    // Validate credentials path
    if (!config.CREDENTIALS_FILE_PATH || typeof config.CREDENTIALS_FILE_PATH !== 'string') {
      throw new Error(`Invalid CREDENTIALS_FILE_PATH value: ${config.CREDENTIALS_FILE_PATH}. Must be a non-empty string.`);
    }
  }

  get(key) {
    if (!this.configLoaded) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    return this.config[key];
  }

  getAll() {
    if (!this.configLoaded) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    return { ...this.config };
  }

  expandHomePath(filePath) {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }

  // Utility methods for common config values
  getHost() {
    return this.get('HOST');
  }

  getPort() {
    return this.get('PORT');
  }

  getCredentialsPath() {
    return this.expandHomePath(this.get('CREDENTIALS_FILE_PATH'));
  }

  getLogLevel() {
    return this.get('LOG_LEVEL');
  }

  getLogFormat() {
    return this.get('LOG_FORMAT');
  }

  getRequestTimeout() {
    return this.get('REQUEST_TIMEOUT');
  }

  getQwenApiBaseUrl() {
    return this.get('QWEN_API_BASE_URL');
  }

  // Development helper to dump config (excluding sensitive data)
  dumpConfig() {
    const config = this.getAll();
    const sanitized = { ...config };
    
    // Don't expose sensitive paths in logs
    if (sanitized.CREDENTIALS_FILE_PATH) {
      sanitized.CREDENTIALS_FILE_PATH = sanitized.CREDENTIALS_FILE_PATH.replace(os.homedir(), '~');
    }
    
    return sanitized;
  }
}
