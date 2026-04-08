import type { AIProvider } from '@/types';

const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  claude: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  claude: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash-preview',
};

const SYSTEM_PROMPT = `You are given rubric criteria extracted from a teacher's assessment document.
For each criterion, produce a single-line summary in this exact format:

**Criterion Name** (X marks) — Brief, plain-English description of what is expected.

Rules:
- One line per criterion, separated by a blank line.
- Keep descriptions to one short sentence (15-25 words).
- Preserve the marks from the input; default to 5 if not specified.
- Do NOT add introductory or concluding text. Only output the criterion summaries.`;

interface SummarizeRequest {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  rubricText: string;
}

export async function summarizeRubrics(req: SummarizeRequest): Promise<string> {
  const { provider, apiKey, model: requestedModel, rubricText } = req;
  const model = requestedModel || DEFAULT_MODELS[provider];

  let responseText: string;

  switch (provider) {
    case 'openai':
    case 'openrouter': {
      const endpoint = PROVIDER_ENDPOINTS[provider];
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: rubricText },
          ],
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.choices[0].message.content;
      break;
    }
    case 'claude': {
      const res = await fetch(PROVIDER_ENDPOINTS.claude, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: rubricText }],
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.content[0].text;
      break;
    }
    case 'gemini': {
      const url = `${PROVIDER_ENDPOINTS.gemini}/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${rubricText}` }] }],
          generationConfig: { temperature: 0.3 },
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.candidates[0].content.parts[0].text;
      break;
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  return responseText.trim();
}
