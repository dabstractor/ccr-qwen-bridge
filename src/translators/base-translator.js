/**
 * BaseTranslator - Abstract base class for request translators
 * All provider-specific translators must extend this class
 */

export class BaseTranslator {
  constructor(logger, apiBaseUrl = null, requestTimeout = 30000) {
    this.logger = logger;
    this.apiBaseUrl = apiBaseUrl;
    this.requestTimeout = requestTimeout;
  }
  
  /**
   * Translate OpenAI request to provider-specific format
   * @param {Object} openAIRequest - OpenAI-compatible request
   * @returns {Object} Provider-specific request format
   */
  translateOpenAIToProvider(openAIRequest) {
    throw new Error('translateOpenAIToProvider() must be implemented by subclass');
  }
  
  /**
   * Translate provider response to OpenAI-compatible format
   * @param {Object} providerResponse - Provider-specific response
   * @returns {Object} OpenAI-compatible response
   */
  translateProviderToOpenAI(providerResponse) {
    throw new Error('translateProviderToOpenAI() must be implemented by subclass');
  }
  
  /**
   * Forward request to the provider's API
   * @param {Object} providerRequest - Provider-specific request
   * @param {string} accessToken - Valid access token
   * @returns {Promise<Object>} Provider response
   */
  async forwardToProviderAPI(providerRequest, accessToken) {
    throw new Error('forwardToProviderAPI() must be implemented by subclass');
  }
  
  /**
   * Process streaming chunks for translation
   * @param {string} chunk - Streaming chunk data
   * @returns {string} Processed chunk
   */
  processStreamingChunk(chunk) {
    throw new Error('processStreamingChunk() must be implemented by subclass');
  }
  
  /**
   * Validate OpenAI request format
   * @param {Object} request - OpenAI request to validate
   * @returns {boolean} True if valid
   */
  validateOpenAIRequest(request) {
    throw new Error('validateOpenAIRequest() must be implemented by subclass');
  }
}