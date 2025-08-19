import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ConfigManager } from '../src/config-manager.js';
import { Logger } from '../src/logger.js';

describe('ConfigManager', () => {
  test('should create config manager instance', () => {
    const logger = new Logger();
    const configManager = new ConfigManager(logger);
    assert(configManager instanceof ConfigManager);
  });

  test('should build config with defaults', () => {
    const logger = new Logger();
    const configManager = new ConfigManager(logger);
    
    const config = configManager.buildConfig();
    
    assert.strictEqual(config.HOST, 'localhost');
    assert.strictEqual(config.PORT, 31337);
    assert.strictEqual(config.LOG_LEVEL, 'info');
    assert.strictEqual(config.LOG_FORMAT, 'console');
    assert.strictEqual(config.REQUEST_TIMEOUT, 30000);
  });

  test('should validate config values', () => {
    const logger = new Logger();
    const configManager = new ConfigManager(logger);
    
    // Valid config should not throw
    const validConfig = {
      HOST: 'localhost',
      PORT: 31337,
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'console',
      REQUEST_TIMEOUT: 30000,
      CREDENTIALS_FILE_PATH: '~/.qwen/oauth_creds.json'
    };
    assert.doesNotThrow(() => configManager.validateConfig(validConfig));
    
    // Invalid port should throw
    const invalidPortConfig = { ...validConfig, PORT: 'invalid' };
    assert.throws(() => configManager.validateConfig(invalidPortConfig));
    
    // Invalid log level should throw
    const invalidLogConfig = { ...validConfig, LOG_LEVEL: 'invalid' };
    assert.throws(() => configManager.validateConfig(invalidLogConfig));
  });

  test('should expand home path correctly', () => {
    const logger = new Logger();
    const configManager = new ConfigManager(logger);
    
    const homePath = configManager.expandHomePath('~/.qwen/oauth_creds.json');
    assert(homePath.includes('.qwen/oauth_creds.json'));
    assert(!homePath.startsWith('~'));
    
    const absolutePath = configManager.expandHomePath('/absolute/path');
    assert.strictEqual(absolutePath, '/absolute/path');
  });
});