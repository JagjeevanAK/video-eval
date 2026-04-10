# VidEval — 30-Second Clip-Based Evaluation

## Overview

The evaluation flow changed from **whole-video-at-once** to **30-second clip-by-clip**. Each clip is evaluated individually using its transcript + a screenshot, then all clip scores are averaged to produce the final video score.

## How It Works

```
Video → Split into 30s clips → Extract screenshot per clip (midpoint)
     → Get full transcript → Split proportionally by time per clip
     → Evaluate each clip (transcript + screenshot) via AI
     → Average all clip scores → Final video score
     → Append to Google Sheet
```

## Files

### `src/lib/videoProcessor.ts` (new)
Browser-based video processing utilities:
- `generateClipDefinitions(videoBlob)` — returns array of `{clipIndex, startTime, endTime}` by splitting video into 30s segments
- `extractClipScreenshot(videoBlob, startTime, endTime)` — seeks to midpoint, captures JPEG screenshot via `<video>` + `<canvas>` at max 640px width
- `extractClipsFromVideo(videoBlob)` — full extraction: returns clip definitions with screenshots (transcripts filled later by caller)

### `src/lib/aiEvaluator.ts` (modified)
- `evaluateClipWithScreenshot(transcript, screenshotBase64, screenshotMimeType, prompt, config, rubrics, clipIndex)` — sends transcript + screenshot to AI for a single clip. Supports multimodal input for all providers:
  - **OpenAI/OpenRouter**: `image_url` content part
  - **Claude**: `image` content part with base64 source
  - **Gemini**: `inlineData` image part
  - **Groq**: `image_url` content part (uses `meta-llama/llama-4-scout-17b-16e-instruct`)
- `averageClipScores(clipResults, rubrics)` — averages scores across all clips (rounded to 2 decimals), combines descriptions with `"Across N clips: desc1 | desc2 | ..."`
- Default Groq model changed to vision-capable `meta-llama/llama-4-scout-17b-16e-instruct`

### `src/lib/rubricParser.ts` (modified)
- `generateEvaluationPrompt()` updated to instruct AI to evaluate based on **both transcript AND screenshot** — considers spoken content + visual elements

### `src/screens/RoomDetail.tsx` (modified)
- `processVideos()` rewritten for clip-based flow:
  1. Download video → `extractClipsFromVideo()` → get clips + screenshots
  2. `extractTranscriptFromVideo()` → full transcript → split by time ratio per clip
  3. Loop through each clip → `evaluateClipWithScreenshot()` → collect results
  4. `averageClipScores()` → store as `scores`, `descriptions`, `clipEvaluationResults`, `averagedScores`, `averagedDescriptions`
  5. Google Sheet row includes `"Clips Evaluated"` count + averaged scores
- UI: "30s clip evaluation" badge, "Total Clips" stat card, "(avg)" on rubric column headers, clips count column in table

### `src/types/index.ts` (modified)
New types:
- `VideoClip` — `{clipIndex, startTime, endTime, transcript, screenshotBase64, screenshotMimeType}`
- `ClipEvaluationResult` — `{clipIndex, startTime, endTime, scores, descriptions}`

Extended `VideoFile`:
- `clipEvaluationResults?: ClipEvaluationResult[]`
- `averagedScores?: Record<string, number>`
- `averagedDescriptions?: Record<string, string>`

## Google Sheet Format

Headers: `["Sr.", "Name", "Clips Evaluated", ...rubricNames, "Description"]`

Each row: `[sr, videoName, clipCount, score1, score2, ..., combinedDescription]`

Scores are averaged across all clips, descriptions are combined.
