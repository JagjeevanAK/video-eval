# Rate Limit Retry System

## Problem

AI providers enforce rate limits (tokens per minute, requests per minute). When exceeded, they return HTTP 429 errors. Without retry logic, the entire evaluation fails and the user must restart.

Groq provides a **suggested retry delay** in the error message:
```json
{"error": {"message": "Rate limit reached... Please try again in 2.744s.", "type": "tokens", "code": "rate_limit_exceeded"}}
```

## Solution

A `fetchWithRetry()` wrapper that:
1. Detects 429 responses
2. Parses the provider's suggested delay (if available)
3. Waits, then retries automatically
4. Falls back to exponential backoff if no suggestion found

## Implementation

### `fetchWithRetry<T>(fetchFn, maxRetries, label)`

Located in `src/lib/aiEvaluator.ts`.

```typescript
async function fetchWithRetry<T>(
  fetchFn: () => Promise<Response>,
  maxRetries: number = 5,
  label: string = 'API',
): Promise<T>
```

**Parameters:**
- `fetchFn`: Function that returns a `Promise<Response>` (lazy — only called when needed)
- `maxRetries`: Number of retry attempts (default 5)
- `label`: Prefix for log messages (e.g., `"ClipEval-3"`, `"Transcription-Groq"`)

### Retry Behavior

| Attempt | Delay Strategy | Wait Time |
|---------|---------------|-----------|
| 1 | Groq suggested delay + 500ms buffer | Provider's suggestion |
| 2 | Groq suggested delay + 500ms buffer | Provider's suggestion |
| ... | Groq suggested delay + 500ms buffer | Provider's suggestion |
| (no suggestion) | Exponential backoff | 2s, 4s, 8s, 16s, 30s |

- **Cap**: Maximum wait time is 30 seconds
- **Groq parsing**: Regex `/try again in ([\d.]+)s/i` extracts the suggested delay
- **Non-429 errors**: Thrown immediately (no retry)

### Usage Pattern

All API calls in `aiEvaluator.ts` are wrapped:

```typescript
// Clip evaluation (all 4 providers)
const data = await fetchWithRetry<{ choices: [...] }>(() =>
  fetch(endpoint, { method: 'POST', body: ... }),
  5,
  `ClipEval-${clipIndex + 1}`,
);

// Transcription (Groq, OpenAI, Gemini)
const data = await fetchWithRetry<{ text: string }>(() =>
  fetch('https://api.groq.com/openai/v1/audio/transcriptions', { ... }),
  5,
  'Transcription-Groq',
);
```

### Supported Providers

| Provider | Clip Evaluation | Transcription |
|----------|----------------|---------------|
| Groq | ✅ | ✅ |
| OpenAI | ✅ | ✅ |
| Gemini | ✅ | ✅ |
| OpenRouter | ✅ | ❌ (no transcription) |
| Claude | ✅ | ❌ (no transcription) |

## Error Handling Flow

```
fetch() → 429
    ↓
Parse error body for suggested delay
    ↓
Wait (suggested + 500ms OR exponential backoff)
    ↓
Retry (up to 5 times)
    ↓
Success → return data
Failure → throw "Max retries exceeded"
```

## Debug Logs

```
[ClipEval-5] Rate limit hit: { attempt: 1, maxRetries: 6 }
[ClipEval-5] Waiting (suggested delay): { waitMs: 3244, suggestedDelay: 2744 }
... (wait) ...
[ClipEval-5] Rate limit hit: { attempt: 2, maxRetries: 6 }
[ClipEval-5] Waiting (exponential backoff): { waitMs: 4000, attempt: 2 }
... (wait) ...
[ClipEval-5] Retry successful
```

## Why Not Retry Other Errors?

- **4xx errors** (400, 401, 403): Retrying won't help — the request is malformed or unauthorized
- **5xx errors**: Could be transient, but we prefer to fail fast for server errors (could add retry later if needed)
- **Network errors**: Caught by the `catch` block but not retried (could add later)

## Tuning

To adjust retry behavior:
1. Increase `maxRetries` for more patience (default 5)
2. Adjust the 30-second cap in `Math.min(..., 30000)`
3. Modify exponential backoff formula: `Math.pow(2, attempt + 1) * 1000`
