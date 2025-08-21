import { QwenAuthManager } from '../src/auth/qwen-auth-manager.js';
import { Logger } from '../src/logger.js';

async function testRefreshToken() {
  const logger = new Logger();
  
  try {
    // Initialize the Qwen auth manager
    const authManager = new QwenAuthManager(
      '~/.qwen/oauth_creds.json',
      'f0304373b74a44d2b584a3fb70ca9e56',
      logger
    );
    
    await authManager.initialize();
    
    console.log('Attempting to refresh token...');
    const result = await authManager.refreshToken();
    console.log('Token refresh result:', result);
  } catch (error) {
    console.error('Error during token refresh:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testRefreshToken();