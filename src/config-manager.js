import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { config } from 'dotenv';
import { CredentialDiscovery } from './auth/credential-discovery.js';

export class ConfigManager {
  constructor(logger) {
    this.logger = logger;
    this.config = {};
    this.providerConfigs = {};
    this.configLoaded = false;
    this.credentialDiscovery = new CredentialDiscovery(logger);
  }
  
  async initialize() {
    try {
      // Load .env file if it exists
      await this.loadDotEnv();
      
      // Build configuration with precedence: Environment variables > Config file > Defaults
      this.config = this.buildConfig();
      
      // Discover credentials from CLI tools
      const discoveredCredentials = await this.credentialDiscovery.discoverAllCredentials();
      
      // Build provider configurations with discovered credentials
      this.providerConfigs = await this.buildProviderConfigs(discoveredCredentials);
      
      this.configLoaded = true;
      this.logger.info('Configuration loaded successfully', {
        host: this.config.HOST,
        port: this.config.PORT,
        logLevel: this.config.LOG_LEVEL,
        providers: Object.keys(this.providerConfigs)
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
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'console', // 'console' or 'json'
      // Default timeout for API requests in milliseconds
      REQUEST_TIMEOUT: 30000, // 30 seconds
      // Provider-specific defaults will be handled in provider configs
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
  
  async buildProviderConfigs(discoveredCredentials = {}) {
    const providerConfigs = {};
    
    // Build Qwen configuration with discovered credentials
    const qwenCredentials = discoveredCredentials.qwen || {};
    providerConfigs.qwen = {
      name: 'qwen',
      enabled: this.getConfigValue('PROVIDER_QWEN_ENABLED', 'true').toLowerCase() === 'true',
      credentialsPath: qwenCredentials.credentialsPath || this.getConfigValue('PROVIDER_QWEN_CREDENTIALS_PATH', '~/.qwen/oauth_creds.json'),
      defaultModel: this.getConfigValue('PROVIDER_QWEN_DEFAULT_MODEL', 'qwen3-coder-plus'),
      tokenUrl: qwenCredentials.tokenUrl || this.getConfigValue('PROVIDER_QWEN_TOKEN_URL', 'https://chat.qwen.ai/api/v1/oauth2/token'),
      clientId: qwenCredentials.clientId || this.getConfigValue('PROVIDER_QWEN_CLIENT_ID', 'f0304373b74a44d2b584a3fb70ca9e56'),
      apiBaseUrl: this.getConfigValue('PROVIDER_QWEN_API_BASE_URL', null),
      requestTimeout: parseInt(this.getConfigValue('PROVIDER_QWEN_REQUEST_TIMEOUT', '30000'))
    };
    
    // Build Gemini configuration with discovered credentials
    const geminiCredentials = discoveredCredentials.gemini || {};
    providerConfigs.gemini = {
      name: 'gemini',
      enabled: this.getConfigValue('PROVIDER_GEMINI_ENABLED', 'true').toLowerCase() === 'true',
      credentialsPath: geminiCredentials.credentialsPath || this.getConfigValue('PROVIDER_GEMINI_CREDENTIALS_PATH', '~/.gemini/oauth_creds.json'),
      defaultModel: this.getConfigValue('PROVIDER_GEMINI_DEFAULT_MODEL', 'gemini-pro'),
      tokenUrl: geminiCredentials.tokenUrl || this.getConfigValue('PROVIDER_GEMINI_TOKEN_URL', 'https://oauth2.googleapis.com/token'),
      clientId: geminiCredentials.clientId || this.getConfigValue('PROVIDER_GEMINI_CLIENT_ID', null),
      clientSecret: geminiCredentials.clientSecret || this.getConfigValue('PROVIDER_GEMINI_CLIENT_SECRET', null),
      scope: geminiCredentials.scope,
      apiBaseUrl: this.getConfigValue('PROVIDER_GEMINI_API_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
      requestTimeout: parseInt(this.getConfigValue('PROVIDER_GEMINI_REQUEST_TIMEOUT', '30000'))
    };
    
    this.logger.info('Built provider configurations with discovered credentials', {
      qwenEnabled: providerConfigs.qwen.enabled,
      qwenClientId: providerConfigs.qwen.clientId ? 'found' : 'missing',
      geminiEnabled: providerConfigs.gemini.enabled,
      geminiClientId: providerConfigs.gemini.clientId ? 'found' : 'missing',
      geminiClientSecret: providerConfigs.gemini.clientSecret ? 'found' : 'missing'
    });
    
    return providerConfigs;
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
  
  getProviderConfig(providerName) {
    if (!this.configLoaded) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    return this.providerConfigs[providerName] || null;
  }
  
  getAllProviderConfigs() {
    if (!this.configLoaded) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    return { ...this.providerConfigs };
  }
  
  getEnabledProviders() {
    if (!this.configLoaded) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    
    const enabledProviders = [];
    for (const [providerName, config] of Object.entries(this.providerConfigs)) {
      if (config.enabled) {
        enabledProviders.push(providerName);
      }
    }
    
    return enabledProviders;
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
  
  getLogLevel() {
    return this.get('LOG_LEVEL');
  }
  
  getLogFormat() {
    return this.get('LOG_FORMAT');
  }
  
  getRequestTimeout() {
    return this.get('REQUEST_TIMEOUT');
  }
  
  // Development helper to dump config (excluding sensitive data)
  dumpConfig() {
    const config = this.getAll();
    const sanitized = { ...config };
    
    // Don't expose sensitive paths in logs
    const sanitizedProviderConfigs = {};
    for (const [providerName, providerConfig] of Object.entries(this.providerConfigs)) {
      sanitizedProviderConfigs[providerName] = { ...providerConfig };
      if (sanitizedProviderConfigs[providerName].credentialsPath) {
        sanitizedProviderConfigs[providerName].credentialsPath = 
          sanitizedProviderConfigs[providerName].credentialsPath.replace(os.homedir(), '~');
      }
    }
    
    return {
      ...sanitized,
      providerConfigs: sanitizedProviderConfigs
    };
  }
}