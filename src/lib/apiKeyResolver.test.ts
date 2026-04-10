import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveApiKey, hasApiKey, getProviderEnvVar } from './apiKeyResolver';

describe('apiKeyResolver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveApiKey', () => {
    it('should return input key when provided', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = '';
      const result = resolveApiKey('openai', 'sk-test-key');
      expect(result).toBe('sk-test-key');
    });

    it('should return env var when input key is empty', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-env-key';
      const result = resolveApiKey('openai', '');
      expect(result).toBe('sk-env-key');
    });

    it('should return env var when input key is whitespace', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-env-key';
      const result = resolveApiKey('openai', '   ');
      expect(result).toBe('sk-env-key');
    });

    it('should prioritize input key over env var', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-env-key';
      const result = resolveApiKey('openai', 'sk-input-key');
      expect(result).toBe('sk-input-key');
    });

    it('should return null when neither input nor env var is set', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = '';
      const result = resolveApiKey('openai', '');
      expect(result).toBeNull();
    });

    it('should work with different providers', () => {
      process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY = 'sk-ant-key';
      const result = resolveApiKey('claude', '');
      expect(result).toBe('sk-ant-key');
    });
  });

  describe('hasApiKey', () => {
    it('should return true when input key is provided', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = '';
      expect(hasApiKey('openai', 'sk-test')).toBe(true);
    });

    it('should return true when env var is set', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-env-key';
      expect(hasApiKey('openai', '')).toBe(true);
    });

    it('should return false when neither is available', () => {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = '';
      expect(hasApiKey('openai', '')).toBe(false);
    });
  });

  describe('getProviderEnvVar', () => {
    it('should return correct env var name for each provider', () => {
      expect(getProviderEnvVar('openai')).toBe('NEXT_PUBLIC_OPENAI_API_KEY');
      expect(getProviderEnvVar('claude')).toBe('NEXT_PUBLIC_ANTHROPIC_API_KEY');
      expect(getProviderEnvVar('gemini')).toBe('NEXT_PUBLIC_GOOGLE_AI_API_KEY');
      expect(getProviderEnvVar('openrouter')).toBe('NEXT_PUBLIC_OPENROUTER_API_KEY');
      expect(getProviderEnvVar('groq')).toBe('NEXT_PUBLIC_GROQ_API_KEY');
    });
  });
});
