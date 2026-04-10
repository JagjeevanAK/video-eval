# Video Chunking for Transcription

## Problem

AI transcription APIs (Groq, OpenAI) have file size limits (~25 MB). Videos uploaded from users often exceed this, causing 413 "Request Entity Too Large" errors.

## Solution

Automatically split large videos into smaller chunks, transcribe each chunk, and combine the transcripts.

## How It Works

```
Large Video (e.g., 60 MB)
    ↓
splitVideoIntoChunks() — detects size > limit
    ↓
Split into N chunks (e.g., 4 chunks of ~15 MB)
    ↓
For each chunk:
    1. Seek to start time
    2. Use MediaRecorder to record that segment
    3. Encode as WebM (VP9, 2.5 Mbps)
    ↓
For each chunk: transcribe via provider API
    ↓
Combine transcripts with "--- [chunk boundary] ---" separator
    ↓
Single combined transcript → evaluation proceeds normally
```

## File Size Limits by Provider

| Provider | Limit | Behavior |
|----------|-------|----------|
| Groq | 25 MB | Auto-chunk |
| OpenAI | 25 MB | Auto-chunk |
| Gemini | 2000 MB | No chunking needed |

## Chunk Calculation

```typescript
const estimatedChunks = Math.ceil(totalBytes / maxChunkBytes);
const numChunks = Math.max(2, Math.ceil(estimatedChunks * 1.5)); // 1.5x safety factor
const chunkDuration = videoDuration / numChunks;
```

- Uses a **1.5x safety factor** because MediaRecorder re-encoding changes file size
- Minimum 2 chunks (avoids pointless single-chunk splits)
- Each chunk is encoded at **2.5 Mbps** to keep output reasonable

## MediaRecorder Implementation

Located in `src/lib/videoProcessor.ts`:

1. Creates a hidden `<video>` element, loads the blob URL
2. Seeks to the start time of each segment
3. On `seeked`, calls `video.captureStream()` to get a MediaStream
4. Creates a `MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })`
5. Records for `chunkDuration + 500ms` buffer, then stops
6. Collects all chunks into a Blob

**Important**: The output format is **WebM/VP9**, not the original format. This is fine for transcription APIs since they process audio content, not video codec specifics.

## API Flow

```
extractTranscriptFromVideo(videoBlob, config)
    ↓
size > limit?
    ├─ Yes → transcribeInChunks()
    │           ↓
    │       splitVideoIntoChunks() → Blob[]
    │           ↓
    │       For each blob: transcribeVideoBlob()
    │           ↓
    │       Join with boundaries → combined transcript
    │
    └─ No → transcribeVideoBlob() directly
```

## Debug Logs

```
[Transcription] Video info: { sizeMB: "60.20", sizeBytes: 63124480, type: "video/mp4", provider: "groq" }
[Transcription] Video exceeds provider limit, splitting into chunks: { limitMB: 25 }
[VideoChunker] Video: 60.20 MB, 240.5s
[VideoChunker] Splitting into 4 chunks of ~60.1s each
[VideoChunker] Recording chunk 1/4: 0.0s - 60.1s
[VideoChunker] Chunk 1 size: 14.8 MB
[Transcription] Created chunks, transcribing each: { count: 4 }
[Transcription] Transcribing chunk: { current: 1, total: 4, sizeMB: "14.80" }
[Transcription] Chunk transcript completed: { chunk: 1, length: 820 }
...
[Transcription] Combined transcript completed: { length: 3450, chunks: 4 }
```

## Caveats

- **Browser-only**: Uses `MediaRecorder` and `<video>` element — only works in the browser, not server-side
- **Playback required**: The video must be playable in the browser's `<video>` element (supported codecs)
- **Audio sync**: MediaRecorder captures whatever is playing; ensure the video has audio in the correct track
- **Timing**: Chunk recording is time-based (`setTimeout`), not frame-accurate. Small overlaps/gaps are expected
