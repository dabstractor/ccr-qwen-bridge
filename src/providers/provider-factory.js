import { QwenProvider } from './qwen-provider.js';
import { GeminiProvider } from './gemini-provider.js';

/**
 * ProviderFactory - Factory for creating provider instances
 */
export class ProviderFactory {
  static createProvider(providerName, config, logger) {
    switch (providerName.toLowerCase()) {
      case 'qwen':
        return new QwenProvider(config, logger, config.requestTimeout);
      case 'gemini':
        return new GeminiProvider(config, logger);
      default:
        throw new Error();
    }
  }
  
  static getSupportedProviders() {
    return ['qwen', 'gemini'];
  }
  
  static isProviderSupported(providerName) {
    return this.getSupportedProviders().includes(providerName.toLowerCase());
  }
}

