import type { AIProvider, RubricCriteria, ClipEvaluationResult } from '@/types';
import { splitVideoIntoChunks } from '@/lib/videoProcessor';
import { logger } from '@/lib/logger';

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
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
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
  // Log video size for debugging
  const videoSizeMB = (videoBlob.size / (1024 * 1024)).toFixed(2);
  const videoSizeBytes = videoBlob.size;
  logger.info("Transcription", "Video info", { sizeMB: videoSizeMB, sizeBytes: videoSizeBytes, type: videoBlob.type || 'unknown', provider: config.provider });

  // Provider file size limits
  const MAX_FILE_SIZE_MB: Record<string, number> = {
    groq: 25,
    openai: 25,
    gemini: 2000,
  };
  const providerLimit = MAX_FILE_SIZE_MB[config.provider] || 25;

  // If video exceeds limit, split into chunks and transcribe each
  if (videoSizeBytes > providerLimit * 1024 * 1024) {
    logger.info("Transcription", "Video exceeds provider limit, splitting into chunks", { limitMB: providerLimit });
    return transcribeInChunks(videoBlob, config, providerLimit);
  }

  // Warn if approaching limit
  if (videoSizeBytes > (providerLimit * 0.8) * 1024 * 1024 && config.provider !== 'gemini') {
    logger.warn("Transcription", "Video size approaching provider limit", { sizeMB: videoSizeMB, provider: config.provider, limitMB: providerLimit });
  }

  // Direct transcription (video within size limit)
  return transcribeVideoBlob(videoBlob, config, videoSizeMB);
}

/**
 * Transcribe a video blob that's within the size limit
 */
async function transcribeVideoBlob(
  videoBlob: Blob,
  config: AIConfig,
  videoSizeMB: string,
): Promise<string> {
  // For Gemini, we can send video directly
  if (config.provider === 'gemini') {
    logger.info("Transcription", "Using Gemini multimodal transcription");
    const model = config.model || DEFAULT_MODELS.gemini;
    const base64 = await blobToBase64(videoBlob);

    const base64SizeKB = (base64.length / 1024).toFixed(2);
    logger.debug("Transcription", "Gemini base64 payload size", { sizeKB: base64SizeKB });
    
    const mimeType = videoBlob.type || 'video/mp4';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
    const data = await fetchWithRetry<{ candidates: Array<{ content: { parts: Array<{ text: string }> } }> }>(() =>
      fetch(url, {
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
      }),
      5,
      'Transcription-Gemini',
    );
    const transcript = data.candidates[0].content.parts[0].text;
    logger.info("Transcription", "Gemini transcript length", { length: transcript.length });
    return transcript;
  }

  // For OpenAI, use Whisper
  if (config.provider === 'openai') {
    logger.info("Transcription", "Using OpenAI Whisper API");
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('model', 'whisper-1');

    logger.info("Transcription", "Sending to OpenAI Whisper", { sizeMB: videoSizeMB });
    const data = await fetchWithRetry<{ text: string }>(() =>
      fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: formData,
      }),
      5,
      'Transcription-OpenAI',
    );
    logger.info("Transcription", "OpenAI Whisper transcript length", { length: data.text?.length || 0 });
    return data.text;
  }

  // For Groq, use Whisper-large-v3 via OpenAI-compatible endpoint
  if (config.provider === 'groq') {
    logger.info("Transcription", "Using Groq Whisper API");
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('model', 'whisper-large-v3');

    logger.info("Transcription", "Sending to Groq Whisper", { sizeMB: videoSizeMB, fileSizeBytes: videoBlob.size });
    const data = await fetchWithRetry<{ text: string }>(() =>
      fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: formData,
      }),
      5,
      'Transcription-Groq',
    );
    logger.info("Transcription", "Groq Whisper transcript length", { length: data.text?.length || 0 });
    return data.text;
  }

  // For others
  logger.error("Transcription", "Provider does not support direct transcription", { provider: config.provider });
  throw new Error(`Direct transcription not supported for ${config.provider}. Please use OpenAI, Gemini, or Groq for auto-transcription.`);
}

/**
 * Split video into chunks, transcribe each, and combine transcripts
 */
async function transcribeInChunks(
  videoBlob: Blob,
  config: AIConfig,
  maxChunkSizeMB: number,
): Promise<string> {
  logger.info("Transcription", "Splitting video into chunks", { provider: config.provider, maxChunkSizeMB });

  const chunks = await splitVideoIntoChunks(videoBlob, maxChunkSizeMB);
  logger.info("Transcription", "Created chunks, transcribing each", { count: chunks.length });

  const transcripts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkSizeMB = (chunks[i].size / (1024 * 1024)).toFixed(2);
    logger.info("Transcription", "Transcribing chunk", { current: i + 1, total: chunks.length, sizeMB: chunkSizeMB });

    try {
      const transcript = await transcribeVideoBlob(chunks[i], config, chunkSizeMB);
      transcripts.push(transcript);
      logger.info("Transcription", "Chunk transcript completed", { chunk: i + 1, length: transcript.length });
    } catch (err) {
      logger.error("Transcription", "Failed to transcribe chunk", { chunk: i + 1, error: err });
      throw new Error(`Failed to transcribe chunk ${i + 1}/${chunks.length}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Combine transcripts with separators
  const combined = transcripts.join('\n\n--- [chunk boundary] ---\n\n');
  logger.info("Transcription", "Combined transcript completed", { length: combined.length, chunks: chunks.length });
  return combined;
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
 * Retry helper for API calls that handles 429 rate limits.
 * Parses suggested retry delay from error message (Groq), falls back to exponential backoff.
 */
async function fetchWithRetry<T>(
  fetchFn: () => Promise<Response>,
  maxRetries: number = 5,
  label: string = 'API',
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchFn();
      if (res.ok) return await res.json() as T;

      const errorText = await res.text();

      // Not ok — check if it's a 429
      if (res.status === 429) {
        logger.warn(label, "Rate limit hit", { attempt: attempt + 1, maxRetries: maxRetries + 1 });

        // Try to parse suggested retry delay from Groq error message
        const delayMatch = errorText.match(/try again in ([\d.]+)s/i);
        if (delayMatch) {
          const suggestedDelay = parseFloat(delayMatch[1]) * 1000;
          const waitMs = Math.min(suggestedDelay + 500, 30000); // Cap at 30s
          logger.info(label, "Waiting (suggested delay)", { waitMs, suggestedDelay });
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          // Exponential backoff: 2s, 4s, 8s, 16s, 30s
          const waitMs = Math.min(Math.pow(2, attempt + 1) * 1000, 30000);
          logger.info(label, "Waiting (exponential backoff)", { waitMs, attempt: attempt + 1 });
          await new Promise((r) => setTimeout(r, waitMs));
        }

        lastError = new Error(`Rate limit: ${errorText}`);
        continue;
      }

      // Non-429 error — throw immediately
      throw new Error(`API error: ${res.status} ${errorText}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Rate limit')) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Max retries exceeded');
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

      const data = await fetchWithRetry<{ choices: Array<{ message: { content: string } }> }>(() =>
        fetch(endpoint, {
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
        }),
        5,
        `ClipEval-${clipIndex + 1}`,
      );
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

      const data = await fetchWithRetry<{ content: Array<{ text: string }> }>(() =>
        fetch(PROVIDER_ENDPOINTS.claude, {
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
        }),
        5,
        `ClipEval-${clipIndex + 1}`,
      );
      responseText = data.content[0].text;
      break;
    }
    case 'gemini': {
      const url = `${PROVIDER_ENDPOINTS.gemini}/${model}:generateContent?key=${config.apiKey}`;
      const data = await fetchWithRetry<{ candidates: Array<{ content: { parts: Array<{ text: string }> } }> }>(() =>
        fetch(url, {
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
        }),
        5,
        `ClipEval-${clipIndex + 1}`,
      );
      responseText = data.candidates[0].content.parts[0].text;
      break;
    }
    case 'groq': {
      const endpoint = PROVIDER_ENDPOINTS[config.provider];
      const contentParts: Array<Record<string, unknown>> = [
        { type: 'text', text: userMessage },
        {
          type: 'image_url',
          image_url: { url: `data:${screenshotMimeType};base64,${screenshotBase64}` },
        },
      ];

      const data = await fetchWithRetry<{ choices: Array<{ message: { content: string } }> }>(() =>
        fetch(endpoint, {
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
        }),
        5,
        `ClipEval-${clipIndex + 1}`,
      );
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
