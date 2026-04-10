import type { AIProvider } from '@/types';

/**
 * Environment variable names for each AI provider's API key.
 * These should be set in `.env.local` or `.env` files with NEXT_PUBLIC_ prefix
 * so they are available in the browser.
 */
const PROVIDER_ENV_VARS: Record<AIProvider, string> = {
  openai: 'NEXT_PUBLIC_OPENAI_API_KEY',
  claude: 'NEXT_PUBLIC_ANTHROPIC_API_KEY',
  gemini: 'NEXT_PUBLIC_GOOGLE_AI_API_KEY',
  openrouter: 'NEXT_PUBLIC_OPENROUTER_API_KEY',
  groq: 'NEXT_PUBLIC_GROQ_API_KEY',
};

/**
 * Resolve the API key for a given AI provider.
 * Priority:
 * 1. User-provided key from input field
 * 2. Environment variable (via NEXT_PUBLIC_* for client-side access)
 * 3. Returns null if neither is available
 */
export function resolveApiKey(
  provider: AIProvider,
  inputKey?: string,
): string | null {
  // Priority 1: User-provided key
  if (inputKey && inputKey.trim()) {
    return inputKey.trim();
  }

  // Priority 2: Environment variable
  const envVarName = PROVIDER_ENV_VARS[provider];
  const envKey = process.env[envVarName];
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  // Priority 3: Not available
  return null;
}

/**
 * Check if an API key is available for the given provider.
 * Returns true if either the input key or environment variable is set.
 */
export function hasApiKey(
  provider: AIProvider,
  inputKey?: string,
): boolean {
  return resolveApiKey(provider, inputKey) !== null;
}

/**
 * Get the environment variable name for a given provider.
 * Useful for showing users which env var to set.
 */
export function getProviderEnvVar(provider: AIProvider): string {
  return PROVIDER_ENV_VARS[provider];
}
