import type { AIProvider, RubricCriteria } from "@/types";

interface ParseRubricUploadResponse {
  rubrics: RubricCriteria[];
  sourceText?: string;
}

export async function parseRubricUpload(file: File): Promise<ParseRubricUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/rubrics/parse", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as ParseRubricUploadResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Failed to parse rubric file.");
  }

  return payload;
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
