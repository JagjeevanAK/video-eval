import type { AIProvider, RubricCriteria } from "@/types";
import { extractRubricsFromImages, convertPdfToImages, convertDocxToImages } from "@/lib/rubricImageExtractor";
import { extractRubricsFromText, parseRubricsFromCSVText } from "@/lib/rubricParser";

interface ParseRubricUploadResponse {
  rubrics: RubricCriteria[];
  sourceText?: string;
  requiresAI?: boolean;
  fileType?: string;
}

export async function parseRubricUpload(file: File): Promise<ParseRubricUploadResponse> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  // CSV files can be parsed client-side without AI
  if (extension === 'csv') {
    const text = await file.text();
    const rubrics = parseRubricsFromCSVText(text);
    
    if (rubrics.length === 0) {
      throw new Error("No rubric criteria were found in the CSV. Include a name column or a first column with criterion names.");
    }

    const sourceText = rubrics.map((r) => `${r.name}: ${r.description || ''}`).join('\n');
    return { rubrics, sourceText };
  }

  // For PDF/DOC/DOCX, we need to convert to images first
  // But we can't extract rubrics from images without an API key here
  // So we'll just prepare the images and let the caller handle AI extraction
  if (extension === 'pdf' || extension === 'doc' || extension === 'docx') {
    // Return empty rubrics - the caller will need to call extractRubricsWithAI
    return { rubrics: [], sourceText: '', requiresAI: true, fileType: extension };
  }

  throw new Error(`Unsupported rubric file type: .${extension}`);
}

interface SummarizeRubricsRequest {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  rubricText: string;
}

export async function summarizeRubricsUpload(params: SummarizeRubricsRequest): Promise<string> {
  const response = await fetch("/api/rubrics/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const payload = (await response.json()) as { summary?: string; error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Failed to summarize rubrics.");
  }

  if (!payload.summary) {
    throw new Error("No summary returned from AI.");
  }

  return payload.summary;
}

interface ExtractRubricsFromImageFileRequest {
  file: File;
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

export async function extractRubricsFromImageFile(
  req: ExtractRubricsFromImageFileRequest,
): Promise<{ rubrics: RubricCriteria[]; sourceText: string }> {
  const { file, provider, apiKey, model } = req;
  const extension = file.name.split('.').pop()?.toLowerCase();

  // Convert file to images
  let images: Array<{ base64: string; mimeType: string }>;

  if (extension === 'pdf') {
    images = await convertPdfToImages(file);
  } else if (extension === 'docx' || extension === 'doc') {
    images = await convertDocxToImages(file);
  } else if (extension === 'csv') {
    // For CSV, parse directly without AI
    const text = await file.text();
    const rubrics = parseRubricsFromCSVText(text);
    const sourceText = rubrics.map((r) => `${r.name}: ${r.description || ''}`).join('\n');
    return { rubrics, sourceText };
  } else {
    throw new Error(`Unsupported file type: .${extension}`);
  }

  if (images.length === 0) {
    throw new Error('No images could be extracted from the file');
  }

  // Extract rubrics using AI
  return extractRubricsFromImages({
    provider,
    apiKey,
    model,
    images,
  });
}
