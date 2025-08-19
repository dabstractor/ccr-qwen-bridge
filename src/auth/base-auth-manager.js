/**
 * BaseAuthManager - Abstract base class for authentication managers
 * All provider-specific auth managers must extend this class
 */

export class BaseAuthManager {
  constructor(credentialsPath, logger) {
    this.credentialsPath = credentialsPath;
    this.logger = logger;
    this.credentials = null;
  }
  
  /**
   * Initialize the authentication manager
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }
  
  /**
   * Load credentials from storage
   * @returns {Promise<void>}
   */
  async loadCredentials() {
    throw new Error('loadCredentials() must be implemented by subclass');
  }
  
  /**
   * Save credentials to storage
   * @returns {Promise<void>}
   */
  async saveCredentials() {
    throw new Error('saveCredentials() must be implemented by subclass');
  }
  
  /**
   * Check if the current token is expired
   * @returns {boolean} True if token is expired
   */
  isTokenExpired() {
    throw new Error('isTokenExpired() must be implemented by subclass');
  }
  
  /**
   * Refresh the access token
   * @returns {Promise<string>} New access token
   */
  async refreshToken() {
    throw new Error('refreshToken() must be implemented by subclass');
  }
  
  /**
   * Get a valid access token, refreshing if necessary
   * @returns {Promise<string|null>} Valid access token or null if unavailable
   */
  async getValidAccessToken() {
    throw new Error('getValidAccessToken() must be implemented by subclass');
  }
  
  /**
   * Get the provider's API base URL from credentials
   * @returns {string} API base URL
   */
  getApiBaseUrl() {
    throw new Error('getApiBaseUrl() must be implemented by subclass');
  }
}