import { NextResponse } from 'next/server';

import { summarizeRubrics } from '@/lib/rubricSummarizer';
import type { AIProvider } from '@/types';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    logger.info("RubricSummarize", "POST request received");
    const body = (await request.json()) as {
      provider?: string;
      apiKey?: string;
      model?: string;
      rubricText?: string;
    };

    const { provider, apiKey, model, rubricText } = body;

    if (!provider || !['openai', 'claude', 'gemini', 'openrouter', 'groq'].includes(provider)) {
      logger.warn("RubricSummarize", "Invalid provider", { provider });
      return NextResponse.json({ error: 'Valid AI provider is required' }, { status: 400 });
    }
    if (!apiKey) {
      logger.warn("RubricSummarize", "Missing API key");
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }
    if (!rubricText) {
      logger.warn("RubricSummarize", "Missing rubric text");
      return NextResponse.json({ error: 'Rubric text is required' }, { status: 400 });
    }

    logger.info("RubricSummarize", "Summarizing rubrics", { provider, model });
    const summary = await summarizeRubrics({
      provider: provider as AIProvider,
      apiKey,
      model,
      rubricText,
    });

    logger.info("RubricSummarize", "Rubrics summarized successfully");
    return NextResponse.json({ summary });
  } catch (error) {
    logger.error("RubricSummarize", "Error during rubric summarization", error);
    const message = error instanceof Error ? error.message : 'Failed to summarize rubrics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
