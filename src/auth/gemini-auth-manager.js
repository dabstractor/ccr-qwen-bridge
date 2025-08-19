import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { BaseAuthManager } from './base-auth-manager.js';

/**
 * GeminiAuthManager - Gemini-specific OAuth manager
 * Handles authentication for Google Gemini API using OAuth 2.0
 */
export class GeminiAuthManager extends BaseAuthManager {
  constructor(credentialsPath, logger) {
    // Expand home path before calling super
    const expandedPath = credentialsPath.startsWith('~') 
      ? path.join(os.homedir(), credentialsPath.slice(1))
      : credentialsPath;
    
    super(expandedPath, logger);
    
    // Gemini OAuth 2.0 constants (research needed for exact values)
    this.TOKEN_URL = 'https://oauth2.googleapis.com/token';
    this.SCOPE = 'https://www.googleapis.com/auth/generative-language'; // Example scope
    // Note: CLIENT_ID would typically come from configuration or environment variables
    // For now, we'll use a placeholder
    this.CLIENT_ID = process.env.GEMINI_CLIENT_ID || 'gemini-client-id-placeholder';
  }
  
  async initialize() {
    try {
      // Load credentials from ~/.gemini/oauth_creds.json on startup
      await this.loadCredentials();
      this.logger.info('Gemini Auth Manager initialized successfully', {
        credentialsPath: this.credentialsPath
      });
    } catch (error) {
      this.logger.error('Failed to initialize Gemini Auth Manager', {
        error: error.message,
        credentialsPath: this.credentialsPath
      });
      throw new Error(`Gemini authentication initialization failed: ${error.message}. Please ensure you have authenticated with the Gemini CLI first.`);
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
      
      this.logger.info('Gemini credentials loaded successfully');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Credentials file not found at ${this.credentialsPath}. Please authenticate with the Gemini CLI first.`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in credentials file: ${error.message}`);
      }
      throw error;
    }
  }
  
  async saveCredentials() {
    try {
      // Atomically write updated credentials to file
      const tempPath = `${this.credentialsPath}.tmp`;
      const data = JSON.stringify(this.credentials, null, 2);
      
      await fs.writeFile(tempPath, data, { mode: 0o600 });
      await fs.rename(tempPath, this.credentialsPath);
      
      this.logger.info('Gemini credentials saved successfully');
      
    } catch (error) {
      this.logger.error('Failed to save Gemini credentials', {
        error: error.message,
        credentialsPath: this.credentialsPath
      });
      throw new Error(`Failed to persist Gemini credentials: ${error.message}`);
    }
  }
  
  isTokenExpired() {
    if (!this.credentials || !this.credentials.expiry_date) {
      return true;
    }
    
    // Check if current access_token is expired (Date.now() > expiry_date)
    return Date.now() > this.credentials.expiry_date;
  }
  
  async refreshToken() {
    try {
      this.logger.info('Attempting to refresh Gemini access token');
      
      // Refresh Logic - POST request to token endpoint
      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'gemini-code/1.0.0'
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: this.CLIENT_ID,
          refresh_token: this.credentials.refresh_token,
          scope: this.SCOPE
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'unknown_error' }));
        
        // Handle unrecoverable auth errors
        if (errorData.error === 'invalid_grant' || errorData.error === 'access_denied') {
          this.logger.error('Unrecoverable Gemini authentication error', {
            error: errorData.error,
            description: errorData.error_description
          });
          throw new Error(`FATAL: ${errorData.error}. Please re-authenticate with the Gemini CLI.`);
        }
        
        throw new Error(`Gemini token refresh failed: ${errorData.error || 'HTTP ' + response.status}`);
      }
      
      const tokenData = await response.json();
      
      // Update credentials with new tokens
      this.credentials.access_token = tokenData.access_token;
      
      if (tokenData.refresh_token) {
        this.credentials.refresh_token = tokenData.refresh_token;
      }
      
      // Calculate new expiry_date as Date.now() + (expires_in * 1000)
      this.credentials.expiry_date = Date.now() + (tokenData.expires_in * 1000);
      
      // Persist updated credentials
      await this.saveCredentials();
      
      this.logger.info('Gemini access token refreshed successfully', {
        expiresIn: tokenData.expires_in,
        newExpiryDate: new Date(this.credentials.expiry_date).toISOString()
      });
      
      return this.credentials.access_token;
      
    } catch (error) {
      this.logger.error('Gemini token refresh failed', {
        error: error.message
      });
      
      // Re-throw fatal errors
      if (error.message.includes('FATAL:')) {
        throw error;
      }
      
      throw new Error(`Unable to refresh Gemini access token: ${error.message}`);
    }
  }
  
  async getValidAccessToken() {
    try {
      // Proactive token refresh - check expiration before each request
      if (this.isTokenExpired()) {
        this.logger.info('Gemini access token expired, refreshing...');
        await this.refreshToken();
      }
      
      // Return valid access token for Authorization header
      return this.credentials.access_token;
      
    } catch (error) {
      this.logger.error('Failed to obtain valid Gemini access token', {
        error: error.message
      });
      
      // Return null for unrecoverable errors to trigger service unavailable
      if (error.message.includes('FATAL:')) {
        console.error('\n' + '='.repeat(80));
        console.error('GEMINI AUTHENTICATION ERROR - ACTION REQUIRED');
        console.error('='.repeat(80));
        console.error(error.message);
        console.error('='.repeat(80) + '\n');
        return null;
      }
      
      throw error;
    }
  }
  
  getApiBaseUrl() {
    // Gemini API base URL
    return 'https://generativelanguage.googleapis.com/v1';
  }
}