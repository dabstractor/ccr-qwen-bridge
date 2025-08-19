/**
 * BaseProvider - Abstract base class defining the provider interface
 * All provider implementations must extend this class
 */

export class BaseProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  
  /**
   * Initialize the provider (authentication, etc.)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }
  
  /**
   * Get a valid access token for the provider
   * @returns {Promise<string|null>} Valid access token or null if unavailable
   */
  async getValidAccessToken() {
    throw new Error('getValidAccessToken() must be implemented by subclass');
  }
  
  /**
   * Translate OpenAI request to provider-specific format
   * @param {Object} openAIRequest - OpenAI-compatible request
   * @returns {Object} Provider-specific request format
   */
  translateRequest(openAIRequest) {
    throw new Error('translateRequest() must be implemented by subclass');
  }
  
  /**
   * Translate provider response to OpenAI-compatible format
   * @param {Object} providerResponse - Provider-specific response
   * @returns {Object} OpenAI-compatible response
   */
  translateResponse(providerResponse) {
    throw new Error('translateResponse() must be implemented by subclass');
  }
  
  /**
   * Forward request to the provider's API
   * @param {Object} translatedRequest - Provider-specific request
   * @param {string} accessToken - Valid access token
   * @returns {Promise<Object>} Provider response
   */
  async forwardRequest(translatedRequest, accessToken) {
    throw new Error('forwardRequest() must be implemented by subclass');
  }
  
  /**
   * Get the provider's API base URL
   * @returns {string} API base URL
   */
  getApiBaseUrl() {
    throw new Error('getApiBaseUrl() must be implemented by subclass');
  }
  
  /**
   * Get the provider's name
   * @returns {string} Provider name
   */
  getName() {
    return this.config.name || 'unknown';
  }
}