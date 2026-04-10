import type { AIProvider, RubricCriteria } from "@/types";
import { extractRubricsFromText } from "@/lib/rubricParser";
import { logger } from "@/lib/logger";

const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  claude: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  claude: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash-preview',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
};

const RUBRIC_EXTRACTION_PROMPT = `You are given one or more images from an assessment rubric document.
Extract ALL rubric criteria from these images.

For each criterion, identify:
1. **Criterion Name** - The name/title of the criterion
2. **Description** - What is expected for this criterion (if provided)
3. **Max Score** - The maximum marks/score (if specified, otherwise use 5)

Respond ONLY with a valid JSON object in this exact format:
{
  "rubrics": [
    {
      "name": "Criterion Name",
      "description": "Brief description of what is expected",
      "maxScore": 5
    }
  ]
}

Rules:
- Extract ALL criteria visible in the images
- Keep descriptions concise (1-2 sentences)
- If max score is not visible, use 5
- Do NOT include any text outside the JSON object
- If multiple images show the same criterion, use the most complete version`;

interface ExtractRubricsFromImageRequest {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  images: Array<{ base64: string; mimeType: string }>;
}

export async function extractRubricsFromImages(
  req: ExtractRubricsFromImageRequest,
): Promise<{ rubrics: RubricCriteria[]; sourceText: string }> {
  const { provider, apiKey, model: requestedModel, images } = req;
  const model = requestedModel || DEFAULT_MODELS[provider];

  logger.info("RubricImageExtract", "Starting rubric extraction from images", {
    provider,
    model,
    imageCount: images.length,
  });

  let responseText: string;

  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'groq': {
      const endpoint = PROVIDER_ENDPOINTS[provider];
      
      // Build content array with text + all images
      const contentParts: Array<Record<string, unknown>> = [
        { type: 'text', text: RUBRIC_EXTRACTION_PROMPT },
      ];
      
      for (const image of images) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        });
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Extract rubric criteria from the provided images.' },
            { role: 'user', content: contentParts },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error("RubricImageExtract", "API error", { provider, status: res.status, error: errorText });
        throw new Error(`API error: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      responseText = data.choices[0].message.content;
      logger.debug("RubricImageExtract", "API response received", { provider, responseLength: responseText?.length || 0 });
      break;
    }

    case 'claude': {
      const contentParts: Array<Record<string, unknown>> = [
        { type: 'text', text: RUBRIC_EXTRACTION_PROMPT },
      ];

      for (const image of images) {
        contentParts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: image.base64,
          },
        });
      }

      const res = await fetch(PROVIDER_ENDPOINTS.claude, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: 'Extract rubric criteria from the provided images.',
          messages: [{ role: 'user', content: contentParts }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error("RubricImageExtract", "Claude API error", { status: res.status, error: errorText });
        throw new Error(`API error: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      responseText = data.content[0].text;
      logger.debug("RubricImageExtract", "Claude response received", { responseLength: responseText?.length || 0 });
      break;
    }

    case 'gemini': {
      const url = `${PROVIDER_ENDPOINTS.gemini}/${model}:generateContent?key=${apiKey}`;
      
      const parts: Array<Record<string, unknown>> = [
        { text: RUBRIC_EXTRACTION_PROMPT },
      ];

      for (const image of images) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
          },
        });
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.3 },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error("RubricImageExtract", "Gemini API error", { status: res.status, error: errorText });
        throw new Error(`API error: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      responseText = data.candidates[0].content.parts[0].text;
      logger.debug("RubricImageExtract", "Gemini response received", { responseLength: responseText?.length || 0 });
      break;
    }

    default:
      logger.error("RubricImageExtract", "Unsupported provider", { provider });
      throw new Error(`Unsupported provider: ${provider}`);
  }

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error("RubricImageExtract", "No JSON found in AI response", { responseText });
    throw new Error('No JSON found in AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const rawRubrics = parsed.rubrics || [];

  // Convert to RubricCriteria format
  const rubrics: RubricCriteria[] = rawRubrics.map((r: { name?: string; description?: string; maxScore?: number }) => ({
    name: r.name || 'Unknown Criterion',
    description: r.description || undefined,
    maxScore: r.maxScore && r.maxScore > 0 ? r.maxScore : 5,
  }));

  // Create source text from extracted rubrics
  const sourceText = rubrics.map((r) => `${r.name}: ${r.description || ''}`).join('\n');

  logger.info("RubricImageExtract", "Rubric extraction completed", { rubricCount: rubrics.length });
  return { rubrics, sourceText };
}

/**
 * Convert a PDF file to an array of base64-encoded JPEG images using PDF.js
 */
export async function convertPdfToImages(pdfFile: File): Promise<Array<{ base64: string; mimeType: string }>> {
  logger.info("PDFToImage", "Converting PDF to images", { fileName: pdfFile.name, size: pdfFile.size });

  // Dynamically import PDF.js (client-side)
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set the worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const images: Array<{ base64: string; mimeType: string }> = [];
  const maxPages = Math.min(pdf.numPages, 10); // Limit to 10 pages to avoid huge payloads

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    logger.debug("PDFToImage", "Processing page", { page: pageNum, total: maxPages });
    
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better OCR quality

    // Create canvas to render the page
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    if (!context) {
      logger.warn("PDFToImage", "Could not get canvas context, skipping page", { page: pageNum });
      continue;
    }

    await page.render({ canvas, viewport }).promise;

    // Convert to JPEG base64
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1];

    images.push({ base64, mimeType: 'image/jpeg' });
    logger.debug("PDFToImage", "Page converted", { page: pageNum, base64Length: base64.length });
  }

  logger.info("PDFToImage", "PDF conversion completed", { pageCount: images.length });
  return images;
}

/**
 * Convert a DOC/DOCX file to base64-encoded image by first extracting text then rendering it
 * Note: For DOC/DOCX, we extract text client-side and render as a simple text image
 * For better quality, consider converting to PDF server-side first
 */
export async function convertDocxToImages(docxFile: File): Promise<Array<{ base64: string; mimeType: string }>> {
  logger.info("DOCXToImage", "Converting DOCX to images", { fileName: docxFile.name, size: docxFile.size });

  // Extract text using mammoth (already installed)
  const mammoth = await import('mammoth');
  const arrayBuffer = await docxFile.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  
  const text = result.value;
  if (!text.trim()) {
    throw new Error('No text content found in DOCX file');
  }

  // Render text to canvas as an image
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }

  // Calculate dimensions
  const fontSize = 14;
  const lineHeight = fontSize * 1.5;
  const charsPerLine = 80;
  const maxWidth = charsPerLine * fontSize * 0.6;
  const lines = text.split('\n');
  const maxHeight = lines.length * lineHeight + 100;

  canvas.width = maxWidth;
  canvas.height = maxHeight;

  // Draw white background
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  context.fillStyle = 'black';
  context.font = `${fontSize}px monospace`;
  context.textBaseline = 'top';

  lines.forEach((line, index) => {
    context.fillText(line, 20, 50 + index * lineHeight, maxWidth - 40);
  });

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const base64 = dataUrl.split(',')[1];

  logger.info("DOCXToImage", "DOCX conversion completed", { base64Length: base64.length });
  return [{ base64, mimeType: 'image/jpeg' }];
}
