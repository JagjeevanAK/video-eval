import { NextResponse } from 'next/server';

import { summarizeRubrics } from '@/lib/rubricSummarizer';
import type { AIProvider } from '@/types';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: string;
      apiKey?: string;
      model?: string;
      rubricText?: string;
    };

    const { provider, apiKey, model, rubricText } = body;

    if (!provider || !['openai', 'claude', 'gemini', 'openrouter'].includes(provider)) {
      return NextResponse.json({ error: 'Valid AI provider is required' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }
    if (!rubricText) {
      return NextResponse.json({ error: 'Rubric text is required' }, { status: 400 });
    }

    const summary = await summarizeRubrics({
      provider: provider as AIProvider,
      apiKey,
      model,
      rubricText,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to summarize rubrics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
