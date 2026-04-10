# Rubric Extraction — Multimodal AI (Client-Side)

## Overview

Rubric files (PDF, DOC, DOCX) are converted to images client-side and sent directly to the chosen AI provider for criterion extraction. CSV files are parsed client-side without AI.

**Before:** File → Server OCR → Text → Server AI call → Summary → Client
**After:** File → Client images → Client AI call → Rubrics

## Key Files

| File | Role |
|------|------|
| `src/lib/rubricImageExtractor.ts` | PDF→image conversion, DOCX→image, AI extraction for all providers |
| `src/lib/rubricUpload.ts` | Orchestrates parsing vs AI extraction based on file type |
| `src/screens/CreateRoom.tsx` | UI flow — auto-extracts on upload when API key is set |

## File Type Handling

| Type | Method | Needs AI API Key? |
|------|--------|-------------------|
| `.csv` | Client-side CSV parsing (PapaParse) | No |
| `.pdf` | PDF.js → canvas → JPEG base64 → AI provider | Yes |
| `.doc` / `.docx` | Mammoth text extraction → canvas render → JPEG → AI provider | Yes |

## Flow

```
1. User uploads rubric file
2. parseRubricUpload() checks extension
   ├─ CSV → parse immediately, return rubrics
   └─ PDF/DOC/DOCX → flag requiresAI=true
3. If API key available → doExtractRubricsFromImage()
   ├─ Convert file to base64 image(s)
   │  ├─ PDF: pdfjs-dist renders each page to canvas
   │  └─ DOCX: mammoth extracts text, rendered as monospace image
   └─ extractRubricsFromImages() calls AI provider
      ├─ OpenAI/OpenRouter/Groq: image_url content parts
      ├─ Claude: image content part with base64 source
      └─ Gemini: inlineData parts
4. AI returns JSON with rubrics array
5. Rubrics stored, evaluation prompt generated
```

## AI Provider Image Formats

All 5 providers support multimodal input:

| Provider | Image Format in Payload | Default Model |
|----------|------------------------|---------------|
| OpenAI | `image_url` with `data:image/jpeg;base64,...` | gpt-4o |
| Claude | `image` with `type: "base64"`, `media_type`, `data` | claude-sonnet-4-20250514 |
| Gemini | `inlineData` with `mimeType`, `data` | gemini-2.5-flash |
| OpenRouter | `image_url` (same as OpenAI) | google/gemini-2.5-flash-preview |
| Groq | `image_url` (same as OpenAI) | meta-llama/llama-4-scout-17b-16e-instruct |

## Prompt

The extraction prompt (`RUBRIC_EXTRACTION_PROMPT` in `rubricImageExtractor.ts`) instructs the AI to:

1. Extract ALL rubric criteria from the image(s)
2. For each criterion, identify: name, description, max score
3. Respond with a strict JSON format: `{ "rubrics": [{ "name", "description", "maxScore" }] }`
4. Use 5 as default max score if not specified
5. Include no text outside the JSON object

## PDF Rendering Details

- **Library:** `pdfjs-dist` (already in dependencies)
- **Worker:** Loaded from cdnjs.cloudflare.com CDN
- **Scale:** 2.0x for better OCR quality
- **Output:** JPEG at 0.9 quality
- **Limit:** Max 10 pages to avoid huge payloads

## DOCX Rendering Details

- **Library:** `mammoth` (already in dependencies)
- **Method:** Extract raw text → render to canvas as monospace
- **Font:** 14px monospace, 1.5x line height
- **Output:** Single JPEG image of all text content
- **Note:** Loses formatting; text-only extraction

## Client-Side Considerations

- PDF.js worker must be configured: `pdfjsLib.GlobalWorkerOptions.workerSrc`
- Canvas rendering is synchronous in browser — large PDFs may block UI briefly
- Base64 images can be large (PDF pages at 2x scale → several MB each)
- Multi-page documents send all images in a single AI request

## API Removed

The old flow used two server routes that are no longer called for the main path:

- `/api/rubrics/parse` — Server-side OCR + text extraction (deprecated, kept for backward compat)
- `/api/rubrics/summarize` — Server-side AI summarization of extracted text (deprecated, kept for backward compat)

Both routes still exist in the codebase but are unused by the CreateRoom flow.

## Error Handling

| Error | User Message |
|-------|-------------|
| No JSON in AI response | "No JSON found in AI response" |
| File can't be converted | "No images could be extracted from the file" |
| API key missing | Auto-extraction skipped, waits for key |
| Unsupported file type | "Unsupported rubric file type: .xyz" |
| Empty CSV | "No rubric criteria were found in the CSV..." |

## State Flow in CreateRoom

```
rubricParsing: true  → File upload started (converting + AI call)
rubrics: []          → Not yet extracted
rubrics: [...]       → Successfully extracted
summaryError: "..."  → Extraction failed
pendingExtractRef    → Stores File for re-extraction or auto-extract when key changes
```
