import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generatePKCEPair } from './utils/pkce-utils.js';

export class OAuthTokenManager {
  constructor(credentialsPath, logger) {
    this.credentialsPath = this.expandHomePath(credentialsPath);
    this.logger = logger;
    this.credentials = null;
    
    // OAuth 2.0 constants from PRP
    this.TOKEN_URL = 'https://chat.qwen.ai/api/v1/oauth2/token';
    this.CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';
    
    // Initialize PKCE support
    this.pkcePair = generatePKCEPair();
  }

  expandHomePath(filePath) {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }

  async initialize() {
    try {
      // F-2.2: Load credentials from ~/.qwen/oauth_creds.json on startup
      await this.loadCredentials();
      this.logger.info('OAuth Token Manager initialized successfully', {
        credentialsPath: this.credentialsPath
      });
    } catch (error) {
      this.logger.error('Failed to initialize OAuth Token Manager', {
        error: error.message,
        credentialsPath: this.credentialsPath
      });
      throw new Error(`Authentication initialization failed: ${error.message}. Please ensure you have authenticated with the official qwen-code CLI first.`);
    }
  }

  async loadCredentials() {
    try {
      const data = await fs.readFile(this.credentialsPath, 'utf8');
      this.credentials = JSON.parse(data);
      
      // Validate required fields for proxy operation
      const requiredFields = ['access_token', 'refresh_token', 'expiry_date'];
      const missingFields = requiredFields.filter(field => !this.credentials[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required credential fields: ${missingFields.join(', ')}`);
      }
      
      this.logger.info('Credentials loaded successfully');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Credentials file not found at ${this.credentialsPath}. Please authenticate with the official qwen-code CLI first.`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in credentials file: ${error.message}`);
      }
      throw error;
    }
  }

  async saveCredentials() {
    try {
      // F-2.6: Atomically write updated credentials to file
      const tempPath = `${this.credentialsPath}.tmp`;
      const data = JSON.stringify(this.credentials, null, 2);
      
      await fs.writeFile(tempPath, data, { mode: 0o600 });
      await fs.rename(tempPath, this.credentialsPath);
      
      this.logger.info('Credentials saved successfully');
      
    } catch (error) {
      this.logger.error('Failed to save credentials', {
        error: error.message,
        credentialsPath: this.credentialsPath
      });
      throw new Error(`Failed to persist credentials: ${error.message}`);
    }
  }

  isTokenExpired() {
    if (!this.credentials || !this.credentials.expiry_date) {
      return true;
    }
    
    // Check if current access_token is expired with a 5-minute buffer
    // This ensures proactive token refresh before actual expiration
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() > (this.credentials.expiry_date - bufferTime);
  }

  async refreshToken() {
    try {
      this.logger.info('Attempting to refresh access token');
      
      // Refresh Logic - POST request to token endpoint
      // Standard OAuth 2.0 refresh token flow with form-encoded data
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', this.CLIENT_ID);
      params.append('refresh_token', this.credentials.refresh_token);
      
      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'qwen-code/1.0.0'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'unknown_error' }));
        
        this.logger.error('Token refresh failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          description: errorData.error_description
        });
        
        // F-4.3: Handle unrecoverable auth errors
        if (errorData.error === 'invalid_grant' || errorData.error === 'access_denied') {
          this.logger.error('Unrecoverable authentication error', {
            error: errorData.error,
            description: errorData.error_description
          });
          throw new Error(`FATAL: ${errorData.error}. Please re-authenticate with the official qwen-code CLI by running: qwen auth`);
        }
        
        // For invalid_client, log the error but don't treat it as fatal
        // This might be a temporary issue that can be resolved
        if (errorData.error === 'invalid_client') {
          this.logger.warn('Client credentials invalid - this might be temporary', {
            error: errorData.error,
            description: errorData.error_description
          });
          
          // Don't throw a fatal error - let the system continue and retry
          throw new Error(`Unable to refresh access token: ${errorData.error}`);
        }
        
        throw new Error(`Token refresh failed: ${errorData.error || 'HTTP ' + response.status}`);
      }

      const tokenData = await response.json();
      
      // Update credentials with new tokens
      this.credentials.access_token = tokenData.access_token;
      
      if (tokenData.refresh_token) {
        this.credentials.refresh_token = tokenData.refresh_token;
      }
      
      // Update resource_url if provided
      if (tokenData.resource_url) {
        this.credentials.resource_url = tokenData.resource_url;
      }
      
      // F-2.5: Calculate new expiry_date as Date.now() + (expires_in * 1000)
      this.credentials.expiry_date = Date.now() + (tokenData.expires_in * 1000);
      
      // F-2.6: Persist updated credentials
      await this.saveCredentials();
      
      this.logger.info('Access token refreshed successfully', {
        expiresIn: tokenData.expires_in,
        newExpiryDate: new Date(this.credentials.expiry_date).toISOString()
      });
      
      return this.credentials.access_token;
      
    } catch (error) {
      this.logger.error('Token refresh failed', {
        error: error.message
      });
      
      // Re-throw fatal errors
      if (error.message.includes('FATAL:')) {
        throw error;
      }
      
      throw new Error(`Unable to refresh access token: ${error.message}`);
    }
  }

  async getValidAccessToken() {
    try {
      // F-2.4: Proactive token refresh - check expiration before each request
      if (this.isTokenExpired()) {
        this.logger.info('Access token expired, refreshing...');
        await this.refreshToken();
      }
      
      // F-2.7: Return valid access token for Authorization header
      return this.credentials.access_token;
      
    } catch (error) {
      this.logger.error('Failed to obtain valid access token', {
        error: error.message
      });
      
      // Return null for unrecoverable errors to trigger service unavailable
      if (error.message.includes('FATAL:')) {
        console.error('\n' + '='.repeat(80));
        console.error('AUTHENTICATION ERROR - ACTION REQUIRED');
        console.error('='.repeat(80));
        console.error(error.message);
        console.error('='.repeat(80) + '\n');
        return null;
      }
      
      throw error;
    }
  }

  getApiBaseUrl() {
    // Determine API base URL from resource_url or use fallback
    if (this.credentials && this.credentials.resource_url) {
      return this.normalizeApiUrl(this.credentials.resource_url);
    }
    
    // Fallback URL from PRP
    return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  normalizeApiUrl(resourceUrl) {
    // Handle resource_url which can be just a domain like "portal.qwen.ai"
    let normalized = resourceUrl;
    
    // If it's just a domain, construct the full URL
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }
    
    // Ensure it ends with /v1 (not /api/v1)
    const suffix = '/v1';
    if (!normalized.endsWith(suffix)) {
      normalized = normalized.replace(/\/+$/, '') + suffix;
    }
    
    return normalized;
  }
}