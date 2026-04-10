import type { VideoClip } from '@/types';

const CLIP_DURATION_SEC = 30;

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
