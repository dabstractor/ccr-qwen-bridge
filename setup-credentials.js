#!/usr/bin/env node

/**
 * Setup script for extracting provider credentials and adding them to .env file
 * This script should be run during initial setup to configure provider credentials
 * It checks which providers are enabled in .env and only processes those providers
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

async function readEnvFile(envPath) {
  try {
    const content = await fs.readFile(envPath, 'utf8');
    return content.split('\n');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // .env file doesn't exist, create empty array
      return [];
    }
    throw error;
  }
}

async function parseEnvFile(envPath) {
  const lines = await readEnvFile(envPath);
  const config = {};
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, value] = trimmedLine.split('=');
      if (key && value !== undefined) {
        config[key.trim()] = value.trim();
      }
    }
  }
  
  return config;
}

async function findCLI(cliName) {
  // Check if CLI is installed and get its path
  return new Promise((resolve) => {
    const whichProcess = spawn('which', [cliName], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    whichProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    whichProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    whichProcess.on('close', (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim());
      } else {
        resolve(null);
      }
    });

    whichProcess.on('error', () => {
      resolve(null);
    });
  });
}

async function extractQwenCredentialsFromCLI(cliPath) {
  try {
    // Get the CLI installation directory
    const cliDir = path.dirname(cliPath);
    const qwenModulePath = path.join(
      cliDir,
      '..',
      'lib',
      'node_modules',
      '@qwen-code',
      'qwen-code',
      'node_modules',
      '@qwen-code',
      'qwen-code-core',
      'dist',
      'src',
      'qwen',
      'qwenOAuth2.js'
    );

    // Check if the file exists
    await fs.access(qwenModulePath);

    // Read the file content
    const content = await fs.readFile(qwenModulePath, 'utf8');

    // Extract client ID using regex
    const clientIdMatch = content.match(/const QWEN_OAUTH_CLIENT_ID = '([^']+)';/);

    if (clientIdMatch) {
      return {
        clientId: clientIdMatch[1]
      };
    }

    return null;
  } catch (error) {
    console.error('Error extracting Qwen credentials from CLI:', error.message);
    return null;
  }
}

async function extractGeminiCredentialsFromCLI(cliPath) {
  try {
    // Get the CLI installation directory
    const cliDir = path.dirname(cliPath);
    const geminiModulePath = path.join(
      cliDir,
      '..',
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
    await fs.access(geminiModulePath);

    // Read the file content
    const content = await fs.readFile(geminiModulePath, 'utf8');

    // Extract client ID and secret using regex
    const clientIdMatch = content.match(/const OAUTH_CLIENT_ID = '([^']+)';/);
    const clientSecretMatch = content.match(/const OAUTH_CLIENT_SECRET = '([^']+)';/);

    if (clientIdMatch && clientSecretMatch) {
      return {
        clientId: clientIdMatch[1],
        clientSecret: clientSecretMatch[1]
      };
    }

    return null;
  } catch (error) {
    console.error('Error extracting Gemini credentials from CLI:', error.message);
    return null;
  }
}

async function writeEnvFile(envPath, lines) {
  const content = lines.join('\n') + '\n';
  await fs.writeFile(envPath, content, 'utf8');
}

async function updateEnvFileWithCredentials(envPath, provider, credentials) {
  const lines = await readEnvFile(envPath);
  let clientIdLineFound = false;
  let clientIdLineIndex = -1;
  
  const clientIdKey = `PROVIDER_${provider.toUpperCase()}_CLIENT_ID`;
  const clientSecretKey = `PROVIDER_${provider.toUpperCase()}_CLIENT_SECRET`;

  // Find existing credential lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(`${clientIdKey}=`)) {
      clientIdLineFound = true;
      clientIdLineIndex = i;
    }
  }

  // Update or add credential lines
  if (clientIdLineFound) {
    // Line exists, update it
    if (clientIdLineIndex !== -1) {
      lines[clientIdLineIndex] = `${clientIdKey}=${credentials.clientId}`;
      console.log(`✅ Updated existing ${provider} client ID in .env file`);
    }
    
    // Handle client secret for Gemini
    if (provider === 'gemini' && credentials.clientSecret) {
      let clientSecretLineFound = false;
      let clientSecretLineIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith(`${clientSecretKey}=`)) {
          clientSecretLineFound = true;
          clientSecretLineIndex = i;
          break;
        }
      }
      
      if (clientSecretLineFound) {
        lines[clientSecretLineIndex] = `${clientSecretKey}=${credentials.clientSecret}`;
        console.log('✅ Updated existing Gemini client secret in .env file');
      } else {
        // Insert after client ID line
        lines.splice(clientIdLineIndex + 1, 0, `${clientSecretKey}=${credentials.clientSecret}`);
        console.log('✅ Added new Gemini client secret to .env file');
      }
    }
  } else {
    // Line doesn't exist, find a good place to insert
    let insertIndex = lines.length;
    
    // Find the provider section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`PROVIDER_${provider.toUpperCase()}_`)) {
        // Insert after the last provider line
        insertIndex = i + 1;
        while (insertIndex < lines.length && 
               (lines[insertIndex].trim() === '' || 
                lines[insertIndex].startsWith('#') || 
                lines[insertIndex].includes(`PROVIDER_${provider.toUpperCase()}_`))) {
          if (lines[insertIndex].includes('CLIENT_ID') || lines[insertIndex].includes('CLIENT_SECRET')) {
            break;
          }
          insertIndex++;
        }
        break;
      }
    }
    
    // Insert the new line(s)
    if (provider === 'gemini' && credentials.clientSecret) {
      lines.splice(insertIndex, 0, 
        `${clientIdKey}=${credentials.clientId}`,
        `${clientSecretKey}=${credentials.clientSecret}`
      );
      console.log(`✅ Added new ${provider} credentials to .env file`);
    } else {
      lines.splice(insertIndex, 0, `${clientIdKey}=${credentials.clientId}`);
      console.log(`✅ Added new ${provider} client ID to .env file`);
    }
  }

  // Write the updated file
  await writeEnvFile(envPath, lines);
  return true;
}

async function setupProviderCredentials(provider, config) {
  console.log(`🔍 Setting up ${provider} provider credentials...`);

  // Check if provider is enabled
  const enabledKey = `PROVIDER_${provider.toUpperCase()}_ENABLED`;
  const isEnabled = config[enabledKey] === 'true';
  
  if (!isEnabled) {
    console.log(`⏭️  ${provider} provider is not enabled, skipping...`);
    return true;
  }

  // Check if CLI is installed
  const cliName = provider === 'qwen' ? 'qwen' : 'gemini';
  const cliPath = await findCLI(cliName);
  
  if (!cliPath) {
    console.error(`❌ ${provider} CLI not found. Please install it first:`);
    if (provider === 'qwen') {
      console.error('   npm install -g @qwen-code/qwen-code');
    } else {
      console.error('   npm install -g @google/gemini-cli');
    }
    return false;
  }

  console.log(`✅ Found ${provider} CLI at: ${cliPath}`);

  // Extract credentials from CLI
  let credentials;
  if (provider === 'qwen') {
    credentials = await extractQwenCredentialsFromCLI(cliPath);
  } else {
    credentials = await extractGeminiCredentialsFromCLI(cliPath);
  }
  
  if (!credentials) {
    console.error(`❌ Failed to extract credentials from ${provider} CLI`);
    console.error('   Please ensure you have the latest version of the CLI installed');
    return false;
  }

  console.log(`✅ Extracted ${provider} credentials from CLI`);
  console.log(`   Client ID: ${credentials.clientId.substring(0, 20)}...`);
  if (credentials.clientSecret) {
    console.log(`   Client Secret: ${credentials.clientSecret.substring(0, 20)}...`);
  }

  // Update .env file
  const envPath = path.join(process.cwd(), '.env');
  try {
    const success = await updateEnvFileWithCredentials(envPath, provider, credentials);
    if (success) {
      console.log(`✅ ${provider} credentials setup completed successfully!\n`);
    } else {
      console.error(`❌ Failed to update .env file for ${provider}. Please check the file manually.`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Failed to update .env file for ${provider}:`, error.message);
    return false;
  }
  
  return true;
}

async function main() {
  console.log('🔧 Multi-Provider Credentials Setup\n');

  // Read current .env configuration
  const envPath = path.join(process.cwd(), '.env');
  let config = {};
  
  try {
    config = await parseEnvFile(envPath);
  } catch (error) {
    console.log('⚠️  No .env file found or unable to parse it. Will create default configuration.');
  }

  // Check which providers are enabled
  const enabledProviders = [];
  
  if (config.PROVIDER_QWEN_ENABLED !== 'false') {
    enabledProviders.push('qwen');
  }
  
  if (config.PROVIDER_GEMINI_ENABLED === 'true') {
    enabledProviders.push('gemini');
  }
  
  // If no providers are explicitly configured, default to both
  if (enabledProviders.length === 0) {
    enabledProviders.push('qwen', 'gemini');
  }

  console.log(`⚙️  Setting up credentials for enabled providers: ${enabledProviders.join(', ')}\n`);

  let successCount = 0;
  let totalCount = enabledProviders.length;

  // Setup credentials for each enabled provider
  for (const provider of enabledProviders) {
    try {
      const success = await setupProviderCredentials(provider, config);
      if (success) {
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Script failed for ${provider}:`, error.message);
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(50));
  if (successCount === totalCount) {
    console.log('🎉 All provider credentials setup completed successfully!');
    console.log('   The .env file has been updated with your provider credentials.');
    console.log('   You can now run the Docker container with proper provider support.');
  } else {
    console.log(`⚠️  Completed ${successCount}/${totalCount} providers successfully.`);
    if (successCount > 0) {
      console.log('   The .env file has been partially updated.');
      console.log('   Please fix the issues above and run the script again.');
    }
  }
  console.log('='.repeat(50));
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
}

export { 
  readEnvFile, 
  parseEnvFile, 
  findCLI, 
  extractQwenCredentialsFromCLI, 
  extractGeminiCredentialsFromCLI, 
  updateEnvFileWithCredentials,
  setupProviderCredentials
};