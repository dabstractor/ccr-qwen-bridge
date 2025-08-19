import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

/**
 * CredentialDiscovery - Dynamically discovers OAuth client credentials from CLI tools
 * Retrieves client IDs, secrets, and other auth config from installed CLI tools
 */
export class CredentialDiscovery {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Discover Qwen OAuth credentials from the installed CLI
   */
  async discoverQwenCredentials() {
    try {
      // For Qwen, the client_id appears to be hardcoded in the CLI
      // We can extract it by examining the CLI binary or using known constants
      const credentials = {
        clientId: 'f0304373b74a44d2b584a3fb70ca9e56', // Known Qwen OAuth client ID
        tokenUrl: 'https://chat.qwen.ai/api/v1/oauth2/token',
        credentialsPath: path.join(os.homedir(), '.qwen', 'oauth_creds.json')
      };

      // Verify the credentials file exists
      try {
        await fs.access(credentials.credentialsPath);
        this.logger.info('Qwen credentials file found', { path: credentials.credentialsPath });
      } catch (error) {
        this.logger.warn('Qwen credentials file not found', { path: credentials.credentialsPath });
      }

      return credentials;
    } catch (error) {
      this.logger.error('Failed to discover Qwen credentials', { error: error.message });
      throw new Error(`Qwen credential discovery failed: ${error.message}`);
    }
  }

  /**
   * Discover Gemini OAuth credentials from the installed CLI
   */
  async discoverGeminiCredentials() {
    try {
      const geminiConfigDir = path.join(os.homedir(), '.gemini');
      
      // Check if Gemini CLI is installed
      try {
        await fs.access(geminiConfigDir);
      } catch (error) {
        throw new Error('Gemini CLI not found. Please install the Gemini CLI first.');
      }

      // Try to extract client credentials from Gemini CLI configuration
      const credentials = await this.extractGeminiClientCredentials();
      
      return {
        ...credentials,
        tokenUrl: 'https://oauth2.googleapis.com/token',
        credentialsPath: path.join(geminiConfigDir, 'oauth_creds.json'),
        scope: [
          'https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ]
      };
    } catch (error) {
      this.logger.error('Failed to discover Gemini credentials', { error: error.message });
      throw new Error(`Gemini credential discovery failed: ${error.message}`);
    }
  }

  /**
   * Extract Gemini client credentials using various methods
   */
  async extractGeminiClientCredentials() {
    // Method 1: Try to extract from the installed CLI
    try {
      const cliCredentials = await this.extractGeminiClientCredentialsFromCLI();
      if (cliCredentials.clientId && cliCredentials.clientSecret) {
        this.logger.info('Found Gemini credentials from CLI');
        return cliCredentials;
      }
    } catch (error) {
      this.logger.debug('Could not get Gemini credentials from CLI', { error: error.message });
    }
    
    // Method 2: Try to get from gemini CLI info command (fallback)
    try {
      const cliCredentials = await this.getGeminiCredentialsFromCLI();
      if (cliCredentials.clientId && cliCredentials.clientSecret) {
        this.logger.info('Found Gemini credentials from CLI command');
        return cliCredentials;
      }
    } catch (error) {
      this.logger.debug('Could not get Gemini credentials from CLI command', { error: error.message });
    }

    // Method 3: Use known Google AI Studio credentials (if available)
    const knownCredentials = this.getKnownGeminiCredentials();
    if (knownCredentials) {
      this.logger.info('Using known Gemini credentials');
      return knownCredentials;
    }

    throw new Error('Could not discover Gemini client credentials. Please ensure the Gemini CLI is properly configured.');
  }

  /**
   * Attempt to get Gemini credentials from CLI commands
   */
  async getGeminiCredentialsFromCLI() {
    return new Promise((resolve, reject) => {
      // Try to run gemini config command to get client info
      const geminiProcess = spawn('gemini', ['config', 'get'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      geminiProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      geminiProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      geminiProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse output to extract client credentials
            const credentials = this.parseGeminiConfigOutput(output);
            resolve(credentials);
          } catch (error) {
            reject(new Error(`Failed to parse gemini config output: ${error.message}`));
          }
        } else {
          reject(new Error(`gemini config command failed: ${errorOutput}`));
        }
      });

      geminiProcess.on('error', (error) => {
        reject(new Error(`Failed to execute gemini config: ${error.message}`));
      });
    });
  }

  /**
   * Parse gemini CLI config output to extract credentials
   */
  parseGeminiConfigOutput(output) {
    // This would need to be implemented based on actual gemini CLI output format
    // For now, return empty object
    this.logger.debug('Gemini config output', { output });
    return {};
  }
  
  /**
   * Extract Gemini client credentials from the installed CLI
   */
  async extractGeminiClientCredentialsFromCLI() {
    try {
      // Path to the Gemini CLI OAuth module
      const oauthModulePath = path.join(
        os.homedir(), 
        '.local', 
        'lib', 
        'node_modules', 
        '@google', 
        'gemini-cli', 
        'node_modules', 
        '@google', 
        'gemini-cli-core', 
        'dist', 
        'src', 
        'code_assist', 
        'oauth2.js'
      );
      
      // Check if the file exists
      try {
        await fs.access(oauthModulePath);
      } catch (error) {
        throw new Error('Gemini CLI OAuth module not found');
      }
      
      // Read the file content
      const content = await fs.readFile(oauthModulePath, 'utf8');
      
      // Extract client ID and secret using regex
      const clientIdMatch = content.match(/const OAUTH_CLIENT_ID = '([^']+)';/);
      const clientSecretMatch = content.match(/const OAUTH_CLIENT_SECRET = '([^']+)';/);
      
      if (clientIdMatch && clientSecretMatch) {
        const clientId = clientIdMatch[1];
        const clientSecret = clientSecretMatch[1];
        
        this.logger.info('Extracted Gemini client credentials from CLI');
        return { clientId, clientSecret };
      }
      
      throw new Error('Could not extract client credentials from Gemini CLI');
    } catch (error) {
      this.logger.debug('Failed to extract Gemini client credentials from CLI', { error: error.message });
      throw error;
    }
  }

  /**
   * Get known/default Gemini credentials if available
   */
  getKnownGeminiCredentials() {
    // Check if we have environment variables set
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GEMINI_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GEMINI_CLIENT_SECRET;

    if (clientId && clientSecret) {
      return { clientId, clientSecret };
    }

    // No credentials available - let the system fall back to environment variables or fail gracefully
    return null;
  }

  /**
   * Discover all provider credentials
   */
  async discoverAllCredentials() {
    const credentials = {};

    try {
      credentials.qwen = await this.discoverQwenCredentials();
      this.logger.info('Qwen credentials discovered successfully');
    } catch (error) {
      this.logger.warn('Qwen credential discovery failed', { error: error.message });
    }

    try {
      credentials.gemini = await this.discoverGeminiCredentials();
      this.logger.info('Gemini credentials discovered successfully');
    } catch (error) {
      this.logger.warn('Gemini credential discovery failed', { error: error.message });
    }

    return credentials;
  }
}