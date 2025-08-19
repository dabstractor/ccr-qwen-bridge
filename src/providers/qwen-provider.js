import { BaseProvider } from './base-provider.js';
import { QwenAuthManager } from '../auth/qwen-auth-manager.js';
import { QwenTranslator } from '../translators/qwen-translator.js';

/**
 * QwenProvider - Qwen-specific provider implementation
 * Combines Qwen authentication and translation components
 */
export class QwenProvider extends BaseProvider {
  constructor(config, logger, requestTimeout) {
    super(config, logger);
    
    // Initialize Qwen-specific components
    this.authManager = new QwenAuthManager(
      config.credentialsPath || '~/.qwen/oauth_creds.json',
      config.clientId, // Pass clientId from config (falls back to hardcoded if not provided)
      logger
    );
    
    this.translator = new QwenTranslator(
      logger,
      config.apiBaseUrl,
      requestTimeout
    );
    
    // Connect translator to auth manager for API URL resolution
    this.translator.setTokenManager(this.authManager);
  }
  
  async initialize() {
    try {
      // Initialize authentication manager
      await this.authManager.initialize();
      
      this.logger.info('Qwen Provider initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Qwen Provider', {
        error: error.message
      });
      throw error;
    }
  }
  
  async getValidAccessToken() {
    return await this.authManager.getValidAccessToken();
  }
  
  translateRequest(openAIRequest) {
    return this.translator.translateOpenAIToProvider(openAIRequest);
  }
  
  translateResponse(providerResponse) {
    return this.translator.translateProviderToOpenAI(providerResponse);
  }
  
  async forwardRequest(translatedRequest, accessToken) {
    return await this.translator.forwardToProviderAPI(translatedRequest, accessToken);
  }
  
  getApiBaseUrl() {
    return this.authManager.getApiBaseUrl();
  }
  
  getName() {
    return 'qwen';
  }
}

