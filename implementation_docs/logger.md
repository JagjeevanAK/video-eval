# Logger System

## Overview

A structured logging utility that works on both server and client, with file persistence on the server.

## File

`src/lib/logger.ts`

## API

```typescript
import { logger } from '@/lib/logger';

logger.info('ModuleName', 'Human-readable message', { key: 'value' });
logger.warn('ModuleName', 'Warning message', { key: 'value' });
logger.error('ModuleName', 'Error message', errorObject);
logger.debug('ModuleName', 'Debug message', { key: 'value' });
```

## Behavior

| Environment | Console | File (`.log`) |
|------------|---------|--------------|
| **Server** (Node.js) | ✅ `console.*` | ✅ Appended |
| **Client** (Browser) | ✅ `console.*` | ❌ No file access |

## Log Format

```
[2025-04-10T09:30:00.000Z] [INFO] [Transcription] Video info | {"sizeMB":"60.20","sizeBytes":63124480,"type":"video/mp4","provider":"groq"}
```

Fields:
1. **Timestamp** — ISO 8601
2. **Level** — INFO, WARN, ERROR, DEBUG
3. **Module** — Namespace prefix (e.g., `Transcription`, `ClipEval-3`, `RubricParse`)
4. **Message** — Human-readable description
5. **Data** — JSON-serialized context (optional)

## Module Naming Convention

Use descriptive module names that identify the source:

| Module | Context |
|--------|---------|
| `Transcription` | Video transcription (aiEvaluator.ts) |
| `Transcription-Groq` | Groq-specific transcription |
| `Transcription-OpenAI` | OpenAI-specific transcription |
| `Transcription-Gemini` | Gemini-specific transcription |
| `ClipEval-1`, `ClipEval-2`... | Clip evaluation (indexed by clip number) |
| `API` | Generic API calls |
| `RubricParse` | Server-side rubric parsing |
| `RubricSummarize` | Server-side rubric summarization |
| `PDF2JSON` | PDF text extraction |
| `PDF OCR` | PDF OCR extraction |

## Level Guidelines

| Level | When to Use |
|-------|-------------|
| `info` | Normal operations: starting/stopping, counts, sizes |
| `warn` | Non-critical issues: approaching rate limits, missing data |
| `error` | Failures: API errors, exceptions |
| `debug` | Verbose details: payload sizes, intermediate values |

## Why Not `console.log`?

1. **Structured data**: JSON context objects are machine-parseable
2. **Module namespacing**: Easy to filter logs by module
3. **Server persistence**: Logs survive page refresh (server-side only)
4. **Level-aware**: `console.error` vs `console.log` for different severities
5. **Consistent format**: All logs follow the same pattern

## Adding New Logs

```typescript
// Before: console.log("Starting process");
// After:
logger.info("ModuleName", "Starting process");

// Before: console.error("Error:", err);
// After:
logger.error("ModuleName", "Process failed", err);

// With context:
logger.info("ModuleName", "Video processed", {
  sizeMB: "45.2",
  duration: 180,
  clips: 6,
});
```

## Log File

- **Path**: `.log` at project root
- **Format**: Plain text, one line per entry
- **Persistence**: Appends only (never rotates — manage manually)
- **Git**: `.log` is in `.gitignore`

## Browser vs Server

The logger detects environment via `typeof window === 'undefined'`:

- **Server** (API routes): Writes to `.log` file + console
- **Client** (browser): Console only (no filesystem access)

The dynamic `import('fs')` avoids bundling Node.js `fs` into the client bundle.
