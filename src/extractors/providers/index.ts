/**
 * LLM Provider factory
 * Creates provider instances based on configuration
 */

import { LLMConfig } from '../../../core/config';
import { LLMProvider } from './types';
import { createOpenAIProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
import { createMockProvider } from './mock';

export function createLLMProvider(config: LLMConfig): LLMProvider {
  const { provider, model, api_key, base_url } = config;

  switch (provider) {
    case 'openai': {
      if (!api_key) {
        throw new Error('OpenAI provider requires api_key in config');
      }
      return createOpenAIProvider({
        apiKey: api_key,
        model,
        baseUrl: base_url,
      });
    }

    case 'anthropic': {
      if (!api_key) {
        throw new Error('Anthropic provider requires api_key in config');
      }
      return createAnthropicProvider({
        apiKey: api_key,
        model,
        baseUrl: base_url,
      });
    }

    case 'mock': {
      return createMockProvider(new Map());
    }

    default:
      throw new Error(
        `Unsupported LLM provider: ${provider}. Supported: openai, anthropic, mock`
      );
  }
}

export { createOpenAIProvider } from './openai';
export { createAnthropicProvider } from './anthropic';
export { createMockProvider } from './mock';
export type { LLMProvider, ChatMessage, LLMOpts } from './types';
