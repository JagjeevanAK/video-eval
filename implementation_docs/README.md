# VidEval Implementation Docs

## Overview

This directory contains implementation details for VidEval's core systems. Use these docs to understand how features work before making changes.

## Documents

| Doc | Topic | When to Read |
|-----|-------|--------------|
| [`rubric-extraction.md`](./rubric-extraction.md) | Client-side multimodal AI rubric extraction | Understanding rubric upload flow |
| [`clip-based-evaluation.md`](./clip-based-evaluation.md) | Video evaluation architecture | Understanding the core evaluation flow |
| [`video-chunking.md`](./video-chunking.md) | Auto-splitting large videos for transcription | Debugging 413 errors or modifying chunking logic |
| [`rate-limit-retry.md`](./rate-limit-retry.md) | Automatic retry for API rate limits | Debugging 429 errors or tuning retry behavior |
| [`logger.md`](./logger.md) | Structured logging system | Adding or modifying logs |

## Key Files

```
src/
  lib/
    aiEvaluator.ts            # AI evaluation, transcription, retry logic
    videoProcessor.ts         # Video chunking, screenshot extraction
    rubricParser.ts           # Rubric extraction from CSV/text
    rubricImageExtractor.ts   # PDF/DOCX→images + AI extraction (client-side)
    rubricUpload.ts           # Orchestrates rubric file processing
    rubricSummarizer.ts       # AI-powered rubric summarization (legacy)
    googleApi.ts              # Google Drive, Sheets, OAuth
    logger.ts                 # Structured logging
  stores/
    useAppStore.ts            # Zustand state management
  types/
    index.ts                  # TypeScript types
  screens/
    RoomDetail.tsx            # Main evaluation orchestrator
    CreateRoom.tsx            # Room creation + rubric upload
  app/
    api/rubrics/parse/        # Server-side rubric parsing (deprecated)
    api/rubrics/summarize/    # Server-side rubric summarization (deprecated)
```

## Evaluation Flow Summary

1. **Auth** → Google OAuth → access token in Zustand store
2. **Create Room** → Drive folder + rubric file + AI provider + API key
   - CSV: parsed client-side (PapaParse)
   - PDF/DOC/DOCX: converted to images → sent to AI provider for extraction
3. **Evaluate** (per video):
   - Download video from Drive
   - Split into 30-second clips → extract screenshot per clip
   - Transcribe full video (auto-chunk if >25MB)
   - Split transcript proportionally per clip
   - Evaluate each clip: transcript + screenshot → AI scores
   - Average all clip scores → final video score
   - Append to Google Sheet
4. **View Results** → Table with scores per rubric + Sheet link

## AI Providers

| Provider | Default Model | Vision | Transcription | Rate Limit Retry | Rubric Extraction |
|----------|--------------|--------|---------------|------------------|-------------------|
| openai | gpt-4o | ✅ image_url | ✅ Whisper | ✅ | ✅ image_url |
| claude | claude-sonnet-4-20250514 | ✅ image part | ❌ | ✅ | ✅ image part |
| gemini | gemini-2.5-flash | ✅ inlineData | ✅ multimodal | ✅ | ✅ inlineData |
| openrouter | google/gemini-2.5-flash-preview | ✅ image_url | ❌ | ✅ | ✅ image_url |
| groq | meta-llama/llama-4-scout-17b-16e-instruct | ✅ image_url | ✅ Whisper | ✅ | ✅ image_url |

## Common Issues

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| 413 Request Too Large | Video >25MB for Groq/OpenAI transcription | Auto-handled by chunking |
| 429 Rate Limit Exceeded | Too many tokens/minute | Auto-handled by retry |
| No rubrics extracted | AI couldn't find criteria in image | Check file quality, try different provider |
| Rubric extraction fails | API key missing or invalid | Enter valid key or set env var |
| Video fails to load | Unsupported codec or DRM | Ensure MP4/H.264 |
| Scores all zeros | AI returned unexpected JSON format | Check rubric name matching |
