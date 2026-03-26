import type { RubricCriteria } from "@/types";

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
