import type { AIProvider, RubricCriteria, ClipEvaluationResult } from '@/types';

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

export interface EvaluationResult {
  scores: Record<string, number>;
  descriptions: Record<string, string>;
}

export interface ClipEvaluationConfig extends AIConfig {
  maxScore?: number; // The max score that clips are evaluated on
}

const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  claude: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  claude: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash-preview',
  groq: 'llama-3.3-70b-versatile',
};

export async function evaluateVideoTranscript(
  transcript: string,
  evaluationPrompt: string,
  config: AIConfig,
  rubrics: RubricCriteria[]
): Promise<EvaluationResult> {
  const model = config.model || DEFAULT_MODELS[config.provider];
  const userMessage = `Here is the video transcript to evaluate:\n\n${transcript}`;

  let responseText: string;

  switch (config.provider) {
    case 'openai':
    case 'openrouter':
    case 'groq': {
      const endpoint = PROVIDER_ENDPOINTS[config.provider];
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: evaluationPrompt },
            { role: 'user', content: userMessage },
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
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: evaluationPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.content[0].text;
      break;
    }
    case 'gemini': {
      const url = `${PROVIDER_ENDPOINTS.gemini}/${model}:generateContent?key=${config.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${evaluationPrompt}\n\n${userMessage}` }] }],
          generationConfig: { temperature: 0.3 },
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.candidates[0].content.parts[0].text;
      break;
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');
  const parsed = JSON.parse(jsonMatch[0]);

  // Handle both new format (with scores/descriptions) and legacy flat format
  const scoresRaw = parsed.scores || parsed;
  const descriptionsRaw = parsed.descriptions || {};

  // Validate scores
  const scores: Record<string, number> = {};
  const descriptions: Record<string, string> = {};
  for (const rubric of rubrics) {
    scores[rubric.name] = typeof scoresRaw[rubric.name] === 'number' ? scoresRaw[rubric.name] : 0;
    descriptions[rubric.name] = typeof descriptionsRaw[rubric.name] === 'string' ? descriptionsRaw[rubric.name] : '';
  }
  return { scores, descriptions };
}

export async function extractTranscriptFromVideo(videoBlob: Blob, config: AIConfig): Promise<string> {
  // For Gemini, we can send video directly
  if (config.provider === 'gemini') {
    const model = config.model || DEFAULT_MODELS.gemini;
    const base64 = await blobToBase64(videoBlob);
    const mimeType = videoBlob.type || 'video/mp4';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: 'Please transcribe all spoken content in this video. Provide only the transcript text, nothing else.' },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`Transcription error: ${res.status}`);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  // For OpenAI, use Whisper
  if (config.provider === 'openai') {
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: formData,
    });
    if (!res.ok) throw new Error(`Transcription error: ${res.status}`);
    const data = await res.json();
    return data.text;
  }

  // For Groq, use Whisper-large-v3 via OpenAI-compatible endpoint
  if (config.provider === 'groq') {
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('model', 'whisper-large-v3');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: formData,
    });
    if (!res.ok) throw new Error(`Transcription error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.text;
  }

  // For others, try audio extraction then OpenRouter with Whisper-compatible endpoint
  throw new Error(`Direct transcription not supported for ${config.provider}. Please use OpenAI, Gemini, or Groq for auto-transcription.`);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Evaluate a single 30-second clip using transcript + screenshot
 */
export async function evaluateClipWithScreenshot(
  transcript: string,
  screenshotBase64: string,
  screenshotMimeType: string,
  evaluationPrompt: string,
  config: AIConfig,
  rubrics: RubricCriteria[],
  clipIndex: number,
): Promise<ClipEvaluationResult> {
  const model = config.model || DEFAULT_MODELS[config.provider];
  const userMessage = `Clip ${clipIndex + 1} transcript:\n\n${transcript}`;

  let responseText: string;

  switch (config.provider) {
    case 'openai':
    case 'openrouter': {
      const endpoint = PROVIDER_ENDPOINTS[config.provider];
      const contentParts: Array<Record<string, unknown>> = [
        { type: 'text', text: userMessage },
        {
          type: 'image_url',
          image_url: { url: `data:${screenshotMimeType};base64,${screenshotBase64}` },
        },
      ];

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: evaluationPrompt },
            { role: 'user', content: contentParts },
          ],
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.choices[0].message.content;
      break;
    }
    case 'claude': {
      const contentParts: Array<Record<string, unknown>> = [
        { type: 'text', text: userMessage },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: screenshotMimeType,
            data: screenshotBase64,
          },
        },
      ];

      const res = await fetch(PROVIDER_ENDPOINTS.claude, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: evaluationPrompt,
          messages: [{ role: 'user', content: contentParts }],
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.content[0].text;
      break;
    }
    case 'gemini': {
      const url = `${PROVIDER_ENDPOINTS.gemini}/${model}:generateContent?key=${config.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: evaluationPrompt },
              { text: userMessage },
              {
                inlineData: {
                  mimeType: screenshotMimeType,
                  data: screenshotBase64,
                },
              },
            ],
          }],
          generationConfig: { temperature: 0.3 },
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.candidates[0].content.parts[0].text;
      break;
    }
    case 'groq': {
      // Groq doesn't support vision, use text only
      const endpoint = PROVIDER_ENDPOINTS[config.provider];
      const fullMessage = `${userMessage}\n\n[Screenshot was captured for this clip but cannot be processed by Groq. Please evaluate based on the transcript only.]`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: evaluationPrompt },
            { role: 'user', content: fullMessage },
          ],
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      responseText = data.choices[0].message.content;
      break;
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');
  const parsed = JSON.parse(jsonMatch[0]);

  // Handle both new format (with scores/descriptions) and legacy flat format
  const scoresRaw = parsed.scores || parsed;
  const descriptionsRaw = parsed.descriptions || {};

  // Validate scores
  const scores: Record<string, number> = {};
  const descriptions: Record<string, string> = {};
  for (const rubric of rubrics) {
    scores[rubric.name] = typeof scoresRaw[rubric.name] === 'number' ? scoresRaw[rubric.name] : 0;
    descriptions[rubric.name] = typeof descriptionsRaw[rubric.name] === 'string' ? descriptionsRaw[rubric.name] : '';
  }

  return {
    clipIndex,
    startTime: 0, // Will be set by caller
    endTime: 0, // Will be set by caller
    scores,
    descriptions,
  };
}

/**
 * Average scores from multiple clip evaluations to get final video scores
 */
export function averageClipScores(
  clipResults: ClipEvaluationResult[],
  rubrics: RubricCriteria[],
): { averagedScores: Record<string, number>; averagedDescriptions: Record<string, string> } {
  if (clipResults.length === 0) {
    return { averagedScores: {}, averagedDescriptions: {} };
  }

  const averagedScores: Record<string, number> = {};
  const averagedDescriptions: Record<string, string> = {};

  for (const rubric of rubrics) {
    const scores = clipResults.map((r) => r.scores[rubric.name] ?? 0);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    // Round to 2 decimal places
    averagedScores[rubric.name] = Math.round(avg * 100) / 100;

    // Combine descriptions: take the most common themes
    const descs = clipResults
      .map((r) => r.descriptions[rubric.name])
      .filter(Boolean);
    averagedDescriptions[rubric.name] = descs.length > 0
      ? `Across ${clipResults.length} clips: ${descs.join(' | ')}`
      : '';
  }

  return { averagedScores, averagedDescriptions };
}
