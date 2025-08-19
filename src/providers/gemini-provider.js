import { BaseProvider } from './base-provider.js';
import { GeminiAuthManager } from '../auth/gemini-auth-manager.js';
import { GeminiTranslator } from '../translators/gemini-translator.js';

/**
 * GeminiProvider - Gemini-specific provider implementation
 * Combines Gemini authentication and translation components
 */
export class GeminiProvider extends BaseProvider {
  constructor(config, logger) {
    super(config, logger);
    
    // Initialize Gemini-specific components
    this.authManager = new GeminiAuthManager(
      config.credentialsPath || '~/.gemini/oauth_creds.json',
      logger
    );
    
    this.translator = new GeminiTranslator(
      logger,
      config.apiBaseUrl,
      config.requestTimeout
    );
  }
  
  async initialize() {
    try {
      // Initialize authentication manager
      await this.authManager.initialize();
      
      this.logger.info('Gemini Provider initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Gemini Provider', {
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
    return 'gemini';
  }
}