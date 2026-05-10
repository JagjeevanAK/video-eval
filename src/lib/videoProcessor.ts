import type { VideoClip } from '@/types';

const CLIP_DURATION_SEC = 30;
const AUDIO_BITRATE = 64_000;
const AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

interface MediaProgress {
  onLog?: (message: string) => void;
}

function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return AUDIO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
}

/**
 * Split a large video blob into smaller chunks of approximately `maxChunkSizeMB` each.
 * Uses MediaRecorder to record segments from the video element.
 */
export async function splitVideoIntoChunks(
  videoBlob: Blob,
  maxChunkSizeMB: number = 25,
): Promise<Blob[]> {
  const duration = await getVideoDuration(videoBlob);
  const totalBytes = videoBlob.size;
  const maxChunkBytes = maxChunkSizeMB * 1024 * 1024;

  // Estimate how many chunks we need based on file size ratio
  const estimatedChunks = Math.ceil(totalBytes / maxChunkBytes);
  // Ensure at least 2 chunks, and add some headroom (1.5x safety factor)
  const numChunks = Math.max(2, Math.ceil(estimatedChunks * 1.5));
  const chunkDuration = duration / numChunks;

  console.log(`[VideoChunker] Video: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB, ${duration.toFixed(1)}s`);
  console.log(`[VideoChunker] Splitting into ${numChunks} chunks of ~${chunkDuration.toFixed(1)}s each`);

  const chunks: Blob[] = [];
  const url = URL.createObjectURL(videoBlob);

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const end = Math.min((i + 1) * chunkDuration, duration);

    console.log(`[VideoChunker] Recording chunk ${i + 1}/${numChunks}: ${start.toFixed(1)}s - ${end.toFixed(1)}s`);
    const chunkBlob = await recordVideoSegment(url, start, end);
    chunks.push(chunkBlob);

    const chunkSizeMB = (chunkBlob.size / (1024 * 1024)).toFixed(2);
    console.log(`[VideoChunker] Chunk ${i + 1} size: ${chunkSizeMB} MB`);
  }

  URL.revokeObjectURL(url);
  return chunks;
}

/**
 * Extract and compress only the video's audio track for transcription APIs.
 * This avoids sending or re-recording video frames when Whisper only needs audio.
 */
export async function extractAudioForTranscription(
  videoBlob: Blob,
  progress?: MediaProgress,
): Promise<Blob> {
  const duration = await getVideoDuration(videoBlob);
  const sourceSizeMB = (videoBlob.size / (1024 * 1024)).toFixed(2);
  progress?.onLog?.(`  Preparing audio-only transcription input from ${sourceSizeMB} MB video...`);

  const url = URL.createObjectURL(videoBlob);
  try {
    const audioBlob = await recordAudioSegment(url, 0, duration);
    const audioSizeMB = (audioBlob.size / (1024 * 1024)).toFixed(2);
    progress?.onLog?.(`  Audio-only transcription input ready: ${audioSizeMB} MB`);
    return audioBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Split audio-only transcription input into provider-sized chunks.
 * The full audio blob is usually small enough; chunk recording is a fallback for long videos.
 */
export async function splitAudioForTranscription(
  videoBlob: Blob,
  maxChunkSizeMB: number,
  progress?: MediaProgress,
): Promise<Blob[]> {
  const audioBlob = await extractAudioForTranscription(videoBlob, progress);
  const maxChunkBytes = maxChunkSizeMB * 1024 * 1024;

  if (audioBlob.size <= maxChunkBytes) {
    return [audioBlob];
  }

  const duration = await getVideoDuration(videoBlob);
  const estimatedChunks = Math.ceil(audioBlob.size / maxChunkBytes);
  const numChunks = Math.max(2, Math.ceil(estimatedChunks * 1.25));
  const chunkDuration = duration / numChunks;
  const url = URL.createObjectURL(videoBlob);

  progress?.onLog?.(
    `  Audio is still over ${maxChunkSizeMB} MB. Splitting into ${numChunks} audio chunk(s)...`,
  );

  try {
    const chunks: Blob[] = [];
    for (let i = 0; i < numChunks; i += 1) {
      const start = i * chunkDuration;
      const end = Math.min((i + 1) * chunkDuration, duration);
      progress?.onLog?.(
        `  Preparing audio chunk ${i + 1}/${numChunks} (${Math.round(start)}s - ${Math.round(end)}s)...`,
      );
      chunks.push(await recordAudioSegment(url, start, end));
    }
    return chunks;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Record a specific time segment from a video URL using MediaRecorder
 */
function recordVideoSegment(
  videoUrl: string,
  startTime: number,
  endTime: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const duration = endTime - startTime;
    let mediaRecorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];

    video.onloadedmetadata = () => {
      video.currentTime = startTime;
    };

    video.onseeked = () => {
      // Start recording from this position
      try {
        const videoEl = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
        const stream = videoEl.captureStream
          ? videoEl.captureStream()
          : videoEl.mozCaptureStream?.();

        if (!stream) {
          reject(new Error('Video captureStream not supported'));
          return;
        }

        mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 2_500_000, // 2.5 Mbps to keep file size reasonable
        });

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          video.pause();
          resolve(blob);
        };

        mediaRecorder.onerror = (e) => {
          reject(new Error(`MediaRecorder error: ${(e as ErrorEvent).message}`));
        };

        mediaRecorder.start();
        video.play();

        // Stop recording after the segment duration
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
          video.pause();
        }, (duration + 0.5) * 1000); // Add 0.5s buffer
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => {
      reject(new Error('Failed to load video for chunking'));
    };
  });
}

function recordAudioSegment(
  videoUrl: string,
  startTime: number,
  endTime: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const duration = endTime - startTime;
    const chunks: Blob[] = [];
    const mimeType = getSupportedAudioMimeType();
    let mediaRecorder: MediaRecorder | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      if (stopTimer) clearTimeout(stopTimer);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const stopRecorder = () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };

    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        fail(new Error('Failed to read video duration for audio extraction'));
        return;
      }
      video.currentTime = startTime;
    };

    video.onseeked = () => {
      try {
        const videoEl = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
        const sourceStream = videoEl.captureStream
          ? videoEl.captureStream()
          : videoEl.mozCaptureStream?.();

        if (!sourceStream) {
          fail(new Error('Audio extraction requires browser captureStream support'));
          return;
        }

        const audioTracks = sourceStream.getAudioTracks();
        if (audioTracks.length === 0) {
          fail(new Error('No audio track found in video'));
          return;
        }

        const audioStream = new MediaStream(audioTracks);
        mediaRecorder = new MediaRecorder(audioStream, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: AUDIO_BITRATE,
        });

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          if (settled) return;
          settled = true;
          audioStream.getTracks().forEach((track) => track.stop());
          sourceStream.getTracks().forEach((track) => track.stop());
          cleanup();
          resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
        };

        mediaRecorder.onerror = () => {
          fail(new Error('MediaRecorder failed during audio extraction'));
        };

        video.onended = stopRecorder;
        mediaRecorder.start();
        video.play().catch((err) => {
          fail(new Error(`Failed to play video for audio extraction: ${err instanceof Error ? err.message : String(err)}`));
        });

        stopTimer = setTimeout(stopRecorder, (duration + 0.5) * 1000);
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    };

    video.onerror = () => {
      fail(new Error('Failed to load video for audio extraction'));
    };
  });
}

/**
 * Extract video duration using HTMLVideoElement
 */
function getVideoDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };
    video.src = url;
  });
}

/**
 * Extract a screenshot from a video blob at a specific time
 * Returns base64-encoded JPEG
 */
async function extractScreenshotAtTime(
  videoBlob: Blob,
  timeInSeconds: number,
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        // Scale down to keep payload reasonable (max 640px width)
        const maxW = 640;
        const scale = Math.min(1, maxW / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        URL.revokeObjectURL(url);
        resolve({ base64: base64Data, mimeType: 'image/jpeg' });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for screenshot extraction'));
    };

    video.src = url;
    // Seek to the target time
    video.currentTime = Math.min(timeInSeconds, video.duration || timeInSeconds);
  });
}

/**
 * Extract transcript from a video clip (blob) using the AI provider.
 * We delegate transcription to the caller since it needs the AI config.
 * This helper just prepares the clip blob.
 */
export function extractClipBlob(
  videoBlob: Blob,
  startTime: number,
  endTime: number,
): Promise<Blob> {
  // In browser, we can't easily slice video with FFmpeg.wasm for every clip
  // So we'll pass the full blob and let the AI provider handle context via the prompt
  // The transcript will be for the whole video, but we'll filter by time context in the prompt
  // For now, return the full blob - actual time-based slicing happens at transcript level
  return Promise.resolve(videoBlob);
}

/**
 * Split a video into 30-second clip definitions
 * Returns clip metadata without actual data - data extraction happens during processing
 */
export async function generateClipDefinitions(videoBlob: Blob): Promise<Array<{ clipIndex: number; startTime: number; endTime: number }>> {
  const duration = await getVideoDuration(videoBlob);
  const clips: Array<{ clipIndex: number; startTime: number; endTime: number }> = [];
  
  let start = 0;
  let index = 0;
  
  while (start < duration) {
    const end = Math.min(start + CLIP_DURATION_SEC, duration);
    clips.push({ clipIndex: index, startTime: start, endTime: end });
    start += CLIP_DURATION_SEC;
    index += 1;
  }
  
  return clips;
}

/**
 * Extract a screenshot for a specific clip (at midpoint)
 */
export async function extractClipScreenshot(
  videoBlob: Blob,
  startTime: number,
  endTime: number,
): Promise<{ base64: string; mimeType: string }> {
  // Take screenshot at the midpoint of the clip
  const midTime = (startTime + endTime) / 2;
  return extractScreenshotAtTime(videoBlob, midTime);
}

/**
 * Full clip extraction: returns VideoClip objects with screenshot ready
 * Transcripts will be filled by the caller after extraction
 */
export async function extractClipsFromVideo(
  videoBlob: Blob,
): Promise<Array<{ clipIndex: number; startTime: number; endTime: number; screenshotBase64: string; screenshotMimeType: string }>> {
  const clipDefs = await generateClipDefinitions(videoBlob);
  
  const clips: Array<{ clipIndex: number; startTime: number; endTime: number; screenshotBase64: string; screenshotMimeType: string }> = [];
  
  for (const def of clipDefs) {
    const screenshot = await extractClipScreenshot(videoBlob, def.startTime, def.endTime);
    clips.push({
      clipIndex: def.clipIndex,
      startTime: def.startTime,
      endTime: def.endTime,
      screenshotBase64: screenshot.base64,
      screenshotMimeType: screenshot.mimeType,
    });
  }
  
  return clips;
}
